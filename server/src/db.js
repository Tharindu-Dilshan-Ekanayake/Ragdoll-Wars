import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LEADERBOARDS, leaderboardScores } from '../../client/src/shared/profile.js'

/**
 * Cloud saves' storage, behind one small async API with two backends:
 *
 * - MongoDB when MONGODB_URI is set: Bloxity Legion gives the game its own managed
 *   database, shared by all its pods.
 * - Otherwise one SQLite file through Node's built-in driver (DB_PATH, default
 *   server/data/floppy.db), for a laptop.
 *
 * A profile is stored whole, with each leaderboard's number copied alongside so the
 * boards are plain indexed queries:
 *
 *   load(id)                  -> profile object or null
 *   save(id, profile)         stores it (whole; the caller merged it first)
 *   top(board, limit)         -> [{ name, value }] best first (players with 0 left out)
 *   rank(board, value)        -> 1 + how many players beat `value`
 */

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/floppy.db', import.meta.url))
const BOARD_IDS = LEADERBOARDS.map((b) => b.id)

/** The managed database's address (MONGODB_URI, or the other common spellings). */
export function mongoUriFrom(env = process.env) {
  const named = env.MONGODB_URI || env.MONGO_URI || env.MONGO_URL || env.MONGODB_URL
  if (named) return named
  return /^mongodb(\+srv)?:\/\//.test(env.DATABASE_URL || '') ? env.DATABASE_URL : ''
}

async function openMongo(uri) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  const profiles = client.db().collection('profiles')
  await Promise.all(BOARD_IDS.map((b) => profiles.createIndex({ [b]: -1 })))
  return {
    kind: 'mongo',
    async load(id) {
      const doc = await profiles.findOne({ _id: id })
      return doc?.data ? JSON.parse(doc.data) : null
    },
    async save(id, profile) {
      await profiles.updateOne({ _id: id }, { $set: { data: JSON.stringify(profile), name: profile.name, updatedAt: Date.now(), ...leaderboardScores(profile) } }, { upsert: true })
    },
    async top(board, limit) {
      const docs = await profiles
        .find({ [board]: { $gt: 0 } }, { projection: { name: 1, [board]: 1 } })
        .sort({ [board]: -1, updatedAt: 1 })
        .limit(limit)
        .toArray()
      return docs.map((d) => ({ name: d.name, value: d[board] }))
    },
    async rank(board, value) {
      return 1 + (await profiles.countDocuments({ [board]: { $gt: value } }))
    },
    close: () => client.close(),
  }
}

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY, name TEXT, data TEXT NOT NULL, updated INTEGER,
    ${BOARD_IDS.map((b) => `${b} INTEGER NOT NULL DEFAULT 0`).join(', ')}
  )`)
  for (const b of BOARD_IDS) db.exec(`CREATE INDEX IF NOT EXISTS profiles_${b} ON profiles (${b} DESC)`)
  const get = db.prepare('SELECT data FROM profiles WHERE id = ?')
  const put = db.prepare(`INSERT INTO profiles (id, name, data, updated, ${BOARD_IDS.join(', ')}) VALUES (?, ?, ?, ?, ${BOARD_IDS.map(() => '?').join(', ')})
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated = excluded.updated, ${BOARD_IDS.map((b) => `${b} = excluded.${b}`).join(', ')}`)
  const tops = Object.fromEntries(BOARD_IDS.map((b) => [b, db.prepare(`SELECT name, ${b} AS value FROM profiles WHERE ${b} > 0 ORDER BY ${b} DESC, updated ASC LIMIT ?`)]))
  const ranks = Object.fromEntries(BOARD_IDS.map((b) => [b, db.prepare(`SELECT COUNT(*) AS n FROM profiles WHERE ${b} > ?`)]))
  return {
    kind: 'sqlite',
    async load(id) {
      const row = get.get(id)
      return row ? JSON.parse(row.data) : null
    },
    async save(id, profile) {
      const s = leaderboardScores(profile)
      put.run(id, profile.name, JSON.stringify(profile), Date.now(), ...BOARD_IDS.map((b) => s[b]))
    },
    async top(board, limit) {
      return tops[board].all(limit).map((r) => ({ name: r.name, value: r.value }))
    },
    async rank(board, value) {
      return 1 + ranks[board].get(value).n
    },
    close: () => db.close(),
  }
}

let opened = null

/** Opens the database once (Mongo if configured, else SQLite at `path`). */
export function openDb({ env = process.env, path = DB_PATH } = {}) {
  if (!opened) {
    const uri = mongoUriFrom(env)
    opened = (uri ? openMongo(uri) : openSqlite(path)).then((db) => {
      console.log(`[db] cloud saves in ${db.kind === 'mongo' ? 'MongoDB' : `SQLite (${path})`}`)
      return db
    })
    opened.catch(() => {
      opened = null
    })
  }
  return opened
}

/** For tests: a fresh in-memory SQLite database. */
export const openMemoryDb = () => openSqlite(':memory:')
