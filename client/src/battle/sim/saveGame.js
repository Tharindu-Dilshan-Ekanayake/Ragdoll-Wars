import { placeMines } from './ordnance.js'
import { addSavedPieces } from './structures.js'
import { UNIT_TYPES } from './units.js'
import { spawnVehicleAt } from './vehicles.js'
import { clearAll, spawnOne } from './world.js'

/**
 * Sandbox saves: the battlefield as plain data (and back) - every living soldier and
 * vehicle with its spot, facing and order, every built piece and every mine. Bodies,
 * bullets and wounds aren't kept: a loaded battlefield starts fresh and ready.
 *
 * Version 1:
 *   { v, mapId, soldiers: [[type, team, x, z, yaw, order]], vehicles: [...same],
 *     pieces: [[key, x, z, rot]], mines: [[team, x, z]] }
 */

const r2 = (n) => Math.round(n * 100) / 100
const keepOrder = (o) => (o === 'move' ? 'hold' : o)

export function serialize(w) {
  return {
    v: 1,
    mapId: w.map.id,
    soldiers: w.slots.filter((s) => s.used && s.alive && !UNIT_TYPES[s.type].zombieAI).map((s) => [s.type, s.team, r2(s.x), r2(s.z), r2(s.yaw), keepOrder(s.order)]),
    vehicles: w.veh.list.filter((v) => v.used && v.alive).map((v) => [v.type, v.team, r2(v.x), r2(v.z), r2(v.yaw), keepOrder(v.order)]),
    pieces: w.build.list.map((st) => [st.key, r2(st.x), r2(st.z), st.rot]),
    mines: w.ord.mines.filter((m) => m.active).map((m) => [m.team, r2(m.x), r2(m.z)]),
  }
}

/** What a save holds, for its slot's label. */
export const saveCounts = (d) => ({ soldiers: d.soldiers.length, vehicles: d.vehicles.length, pieces: d.pieces.length, mines: d.mines.length })

/** Replaces the battlefield with save `d` (made on this map). */
export function applySave(w, d) {
  if (!d || d.v !== 1) return false
  clearAll(w)
  addSavedPieces(w, d.pieces.filter(([key]) => typeof key === 'string'))
  for (const [team, x, z] of d.mines) placeMines(w, team, x, z, 1)
  for (const [type, team, x, z, yaw, order] of d.soldiers) {
    const t = UNIT_TYPES[type]
    if (t && !t.vehicle && !t.strike && !t.trap && !t.zombieAI) spawnOne(w, t, team, x, z, yaw, order)
  }
  for (const [type, team, x, z, yaw, order] of d.vehicles) if (UNIT_TYPES[type]?.vehicle) spawnVehicleAt(w, type, team, x, z, yaw, order)
  w.version += 1
  return true
}
