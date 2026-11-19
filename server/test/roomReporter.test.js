import assert from 'node:assert/strict'
import { test } from 'node:test'

import { reportedMetadata } from '../src/legionRoomReporter.js'

test('a mode word is reported as modeName, never as a catalogue number', () => {
  assert.deepEqual(reportedMetadata({ mode: 'zombies', mapId: 'bastion', started: false }), { mapId: 'bastion', started: false, modeName: 'zombies' })
})

test('a numeric mode (a catalogue row) is left alone, and no metadata is fine', () => {
  assert.deepEqual(reportedMetadata({ mode: 2, modeName: 'Duel' }), { mode: 2, modeName: 'Duel' })
  assert.deepEqual(reportedMetadata(undefined), {})
  assert.deepEqual(reportedMetadata({ code: 'ABCDE' }), { code: 'ABCDE' })
})
