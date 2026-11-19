import { Room, ServerError } from '@colyseus/core'

import { BADGE_IDS, LEADERBOARDS, MAX_WAVE, cleanName, cleanSave, emptyProfile, leaderboardScores, mergeProfiles, normalizeProfile } from '../../../client/src/shared/profile.js'
import { resolveIdentity } from '../bloxityApi.js'
import { queueReport } from '../bloxityLeaderboards.js'
import { bloxity } from '../bloxityEnv.js'
import { openDb } from '../db.js'

/**
 * Cloud saves and the leaderboards: one short-lived room per player (the game opens it
 * when it has something to load or save, and leaves when idle).
 *
 * A signed-in Boxity player (token checked with Boxity, never trusted as is) gets their
 * profile ('profile'), and sends what changed: 'progress' (best wave, badges, totals),
 * 'putSave' (one sandbox save) and 'delSave' (a save id). Each is merged into the stored
 * profile - never overwritten (shared/profile.js) - stored, echoed back ('saved') and
 * queued for Boxity's leaderboards. Anyone, guests too, may ask for 'boards'.
 *
 * Totals can only grow so fast: a profile's kills, battles and minutes are capped by
 * how long it's been since its last save, so a tampered client can't post a million.
 * Off Boxity hosting (a laptop) a `devId` stands in for an account, for testing.
 */

const RATE = 12
const REFILL_MS = 1000
const TOP = 10

/** The most each total may have grown since `stored` was saved (seconds `dt` ago). */
function capGrowth(stored, merged, now) {
  const s = merged.stats
  const was = stored.stats
  if (!stored.updatedAt) {
    // First save of an account: what the player built up before signing in comes along,
    // within reason.
    s.zombieKills = Math.min(s.zombieKills, 20000)
    s.battles = Math.min(s.battles, 1000)
    s.playtime = Math.min(s.playtime, 200 * 3600)
    return merged
  }
  const dt = Math.max(0, (now - stored.updatedAt) / 1000)
  s.zombieKills = Math.min(s.zombieKills, was.zombieKills + 400 + Math.ceil(dt * 4))
  s.battles = Math.min(s.battles, was.battles + 3 + Math.ceil(dt / 20))
  s.playtime = Math.min(s.playtime, was.playtime + 120 + Math.ceil(dt * 1.05))
  return merged
}

export class ProfileRoom extends Room {
  maxClients = 1
  autoDispose = true

  onCreate() {
    this.tokens = RATE
    this.refillAt = Date.now()
    this.queue = Promise.resolve()
    this.onMessage('*', (client, type, payload) => {
      if (!this.spend()) return
      // One at a time, in order: each reads the stored profile, merges, writes.
      this.queue = this.queue.then(() => this.handle(client, String(type), payload)).catch((err) => {
        console.warn('[profile] message failed', type, err?.message || err)
        client.send('error', { message: 'Could not save to the cloud' })
      })
    })
  }

  spend() {
    const now = Date.now()
    this.tokens = Math.min(RATE, this.tokens + ((now - this.refillAt) / REFILL_MS) * 2)
    this.refillAt = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }

  async onAuth(_client, options) {
    let identity = null
    try {
      identity = await resolveIdentity(options)
    } catch {
      identity = null
    }
    if (identity?.verified) return { id: identity.playerId, name: cleanName(identity.name || options?.name), verified: true }
    const dev = typeof options?.devId === 'string' && /^dev-[\w-]{1,40}$/.test(options.devId) ? options.devId : null
    if (dev && !bloxity.hosted) return { id: dev, name: cleanName(options?.name), verified: false }
    // Guests may look at the boards but have nothing to save.
    if (options?.boardsOnly) return { id: null, name: cleanName(options?.name), verified: false }
    throw new ServerError(401, 'Sign in to save to the cloud')
  }

  async onJoin(client, _options, auth) {
    this.who = auth
    if (!auth.id) return
    const db = await openDb()
    const profile = normalizeProfile((await db.load(auth.id)) || emptyProfile(auth.name), auth.name)
    client.send('profile', profile)
  }

  async handle(client, type, payload) {
    if (type === 'boards') return client.send('boards', await this.boards())
    const id = this.who?.id
    if (!id) return
    const db = await openDb()
    const stored = normalizeProfile((await db.load(id)) || emptyProfile(this.who.name), this.who.name)
    const incoming = normalizeProfile({ ...stored, saves: [], removed: {} }, this.who.name)
    const now = Date.now()
    if (type === 'progress') {
      if (!payload || typeof payload !== 'object') return
      incoming.zombieBest = Math.max(0, Math.min(MAX_WAVE, Math.floor(Number(payload.zombieBest) || 0)))
      incoming.badges = {}
      for (const b of BADGE_IDS) if (payload.badges?.[b] === true) incoming.badges[b] = true
      const st = normalizeProfile({ stats: payload.stats }).stats
      incoming.stats = st
    } else if (type === 'putSave') {
      const save = cleanSave(payload)
      if (!save) return client.send('error', { message: 'That save is too big for the cloud' })
      incoming.saves = [save]
    } else if (type === 'delSave') {
      if (typeof payload !== 'string' || !/^s[0-9a-z]{1,16}$/.test(payload)) return
      incoming.removed = { [payload]: now }
    } else return
    const merged = capGrowth(stored, mergeProfiles(stored, incoming), now)
    merged.updatedAt = now
    await db.save(id, merged)
    if (this.who.verified) queueReport(id, merged)
    client.send('saved', { type, profile: merged })
  }

  /** Each board's top players, and this player's own place on it. */
  async boards() {
    const db = await openDb()
    const mine = this.who?.id ? normalizeProfile(await db.load(this.who.id)) : null
    const myScores = mine ? leaderboardScores(mine) : null
    const out = { boards: [] }
    for (const b of LEADERBOARDS) {
      const top = await db.top(b.id, TOP)
      const value = myScores?.[b.id] ?? 0
      out.boards.push({ id: b.id, label: b.label, top, me: myScores ? { value, rank: value > 0 ? await db.rank(b.id, value) : null } : null })
    }
    return out
  }
}
