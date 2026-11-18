import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pack, unpack } from 'msgpackr'

import { MAPS } from '../../client/src/battle/maps/index.js'
import { createEncoder, encodeSnapshot, SOLDIER_STRIDE } from '../../client/src/battle/sim/netProtocol.js'
import { createWorld, spawnUnits, stepWorld, withUnits, moveSelected } from '../../client/src/battle/sim/world.js'
import { newGuestId, resolveIdentity } from '../src/bloxityApi.js'
import { issueSaveTicket, saveIdsFromTickets, setSaveTicketSecret } from '../src/saveTickets.js'

const CAPS = { units: 50, corpses: 40, ragdolls: 0, vehicles: 6, structures: 160 }

test('guests get a server-made id', async () => {
  const id = await resolveIdentity({}, { makeGuestId: () => 'guest-x' })
  assert.equal(id.playerId, 'guest-x')
  assert.equal(id.verified, false)
  assert.match(newGuestId(), /^guest-/)
})

test('save tickets round-trip', () => {
  setSaveTicketSecret('a-test-secret-that-is-long-enough-1234')
  const ticket = issueSaveTicket('guest-abc')
  assert.deepEqual(saveIdsFromTickets([ticket]), ['guest-abc'])
  assert.deepEqual(saveIdsFromTickets(['forged']), [])
})

test('every map loads and simulates on the server', async () => {
  for (const entry of MAPS) {
    const map = (await entry.load()).default
    const w = createWorld(map, CAPS)
    w.deaths = []
    spawnUnits(w, 'rifle', 0, map.bases[0].x + 10, 0, 6, 'attack')
    spawnUnits(w, 'rifle', 1, map.bases[1].x - 10, 0, 6, 'attack')
    for (let i = 0; i < 300; i += 1) stepWorld(w, 1 / 30)
    assert.ok(w.time > 9, `${entry.id} ran`)
  }
})

test('snapshots encode, pack small and carry the battle', async () => {
  const map = (await MAPS[0].load()).default
  const w = createWorld(map, CAPS)
  w.deaths = []
  const enc = createEncoder(w)
  spawnUnits(w, 'rifle', 0, -30, 0, 10, 'attack')
  spawnUnits(w, 'tank', 1, 30, 0, 1, 'attack')
  spawnUnits(w, 'sandbags', 0, -20, 0, 3, 'attack', 1)
  for (let i = 0; i < 90; i += 1) stepWorld(w, 1 / 30)
  const snap = encodeSnapshot(w, enc)
  assert.equal(snap.s.length % SOLDIER_STRIDE, 0)
  assert.ok(snap.s.length / SOLDIER_STRIDE >= 1)
  assert.ok(Array.isArray(snap.b) && snap.b.length === 12, 'built pieces sent once')
  const bytes = pack(snap)
  assert.ok(bytes.length < 20000, `snapshot is ${bytes.length} bytes`)
  assert.deepEqual(unpack(bytes).st, snap.st)
  // Next snapshot doesn't resend unchanged pieces.
  stepWorld(w, 1 / 30)
  assert.equal(encodeSnapshot(w, enc).b, undefined)
})

test('commands only move your own team', async () => {
  const map = (await MAPS[0].load()).default
  const w = createWorld(map, CAPS)
  spawnUnits(w, 'rifle', 1, 30, 0, 1, 'hold')
  for (let i = 0; i < 60; i += 1) stepWorld(w, 1 / 30)
  const red = w.slots.find((s) => s.used && s.team === 1)
  // Blue asking to move a red soldier: nothing happens.
  const moved = withUnits(w, 0, [red.id], [], () => moveSelected(w, 0, 0))
  assert.equal(moved, 0)
  assert.equal(withUnits(w, 1, [red.id], [], () => moveSelected(w, 0, 0)), 1)
})
