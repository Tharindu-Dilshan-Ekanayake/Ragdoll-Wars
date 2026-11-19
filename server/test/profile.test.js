import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cleanSave, emptyProfile, leaderboardScores, mergeProfiles, normalizeProfile, MAX_SAVES } from '../../client/src/shared/profile.js'
import { changedScores } from '../src/bloxityLeaderboards.js'
import { openMemoryDb } from '../src/db.js'

const data = (n = 3) => ({ v: 1, mapId: 'training', soldiers: Array.from({ length: n }, (_, i) => ['rifle', 0, i, 0, 0, 'hold']), vehicles: [], pieces: [['sandbags', 1, 2, 0]], mines: [] })
const save = (id, savedAt, extra = {}) => ({ id, name: `Save ${id}`, mapId: 'training', savedAt, data: data(), ...extra })

test('a merge never loses progress, whichever way round', () => {
  const a = normalizeProfile({ zombieBest: 7, badges: { bronze: true }, stats: { zombieKills: 120, battles: 4, playtime: 900 } })
  const b = normalizeProfile({ zombieBest: 11, badges: { silver: true }, stats: { zombieKills: 80, battles: 9, playtime: 300 } })
  for (const m of [mergeProfiles(a, b), mergeProfiles(b, a)]) {
    assert.equal(m.zombieBest, 11)
    assert.deepEqual(m.badges, { bronze: true, silver: true })
    assert.deepEqual(m.stats, { zombieKills: 120, battles: 9, playtime: 900 })
  }
})

test('saves merge by id, newest copy wins, deleted ones stay deleted', () => {
  const a = normalizeProfile({ saves: [save('s1', 100), save('s2', 200)] })
  const b = normalizeProfile({ saves: [save('s1', 300, { name: 'Renamed' }), save('s3', 50)], removed: { s2: 250 } })
  const m = mergeProfiles(a, b)
  assert.deepEqual(
    m.saves.map((s) => s.id),
    ['s1', 's3'],
  )
  assert.equal(m.saves[0].name, 'Renamed')
  // A save made again after it was deleted comes back.
  const again = mergeProfiles(m, normalizeProfile({ saves: [save('s2', 400)] }))
  assert.ok(again.saves.some((s) => s.id === 's2'))
  // Never more than MAX_SAVES, newest kept.
  const many = normalizeProfile({ saves: Array.from({ length: 12 }, (_, i) => save(`s${i + 10}`, i)) })
  assert.equal(many.saves.length, MAX_SAVES)
  assert.equal(many.saves[0].savedAt, 11)
})

test('bad or oversized saves and wild numbers are refused', () => {
  assert.equal(cleanSave({ ...save('s1', 1), id: '../x' }), null)
  assert.equal(cleanSave({ ...save('s1', 1), data: { ...data(), mapId: 'desert' } }), null)
  assert.equal(cleanSave({ ...save('s1', 1), data: data(400) }), null)
  assert.ok(cleanSave(save('s1', 1)))
  const p = normalizeProfile({ zombieBest: 999, badges: { gold: 'yes', silver: true }, stats: { zombieKills: -5, battles: 'x', playtime: 1e99 } })
  assert.equal(p.zombieBest, 15)
  assert.deepEqual(p.badges, { silver: true })
  assert.equal(p.stats.zombieKills, 0)
  assert.equal(p.stats.battles, 0)
  assert.ok(p.stats.playtime <= 1e9)
  assert.equal(normalizeProfile({ name: '<script>Bob</script>' }).name, 'scriptBobscript')
})

test('leaderboard scores and the Boxity report only send what changed', () => {
  const p = normalizeProfile({ zombieBest: 9, stats: { zombieKills: 300, battles: 12, playtime: 3725 } })
  assert.deepEqual(leaderboardScores(p), { zombie_wave: 9, zombie_kills: 300, battles: 12, playtime: 62 })
  const sent = new Map([['legion_u1|zombie_wave', 9]])
  const scores = changedScores([{ id: 'u1', profile: p }], sent)
  assert.equal(scores.length, 3)
  assert.ok(scores.every((s) => s.userId === 'legion_u1' && s.board !== 'zombie_wave'))
})

test('the database keeps profiles and ranks the boards', async () => {
  const db = await openMemoryDb()
  const mk = (name, wave, kills) => normalizeProfile({ ...emptyProfile(name), zombieBest: wave, stats: { zombieKills: kills, battles: 1, playtime: 60 } })
  await db.save('a', mk('Alpha', 5, 100))
  await db.save('b', mk('Bravo', 12, 40))
  await db.save('c', mk('Charlie', 8, 0))
  assert.equal((await db.load('b')).name, 'Bravo')
  assert.equal(await db.load('nobody'), null)
  assert.deepEqual(
    (await db.top('zombie_wave', 10)).map((r) => r.name),
    ['Bravo', 'Charlie', 'Alpha'],
  )
  // Players with nothing on a board aren't listed on it.
  assert.deepEqual(
    (await db.top('zombie_kills', 10)).map((r) => r.value),
    [100, 40],
  )
  assert.equal(await db.rank('zombie_wave', 8), 2)
  await db.save('a', mk('Alpha', 14, 100))
  assert.equal((await db.top('zombie_wave', 1))[0].name, 'Alpha')
  db.close()
})
