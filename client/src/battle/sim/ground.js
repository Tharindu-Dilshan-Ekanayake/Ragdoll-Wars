import { helipadsOf, PAD_SIZE } from './helipads.js'
import { mapObstacles } from './pieces.js'
import { buildTerrain } from './terrain.js'

/**
 * A map's terrain heightfield (terrain.js), levelled under everything that stands on the
 * ground: its obstacles, set pieces and raised floors, its helipads, bases and painted
 * pads. Cached per map (the sim and the renderer share it). Null on a flat map.
 */
const cache = new WeakMap()

export function mapTerrain(map) {
  if (!map.terrain) return null
  let T = cache.get(map)
  if (T) return T
  const standing = mapObstacles(map).map((o) => ({ x: o.x, z: o.z, w: o.w, d: o.d }))
  for (const p of helipadsOf(map)) standing.push({ x: p.x, z: p.z, w: PAD_SIZE + 3, d: PAD_SIZE + 3 })
  for (const b of map.bases || []) standing.push({ x: b.x, z: b.z, w: 10, d: 10 })
  for (const p of map.pads || []) standing.push({ x: p.x, z: p.z, w: p.w, d: p.d })
  // Enterable buildings: level all through, not just under their walls.
  for (const [kind, x, z, rot = 0, o = {}] of map.sets || []) {
    if (kind !== 'bldg') continue
    const w = o.w || 12
    const d = o.d || 8
    standing.push({ x, z, w: rot & 1 ? d : w, d: rot & 1 ? w : d })
  }
  T = buildTerrain(map, standing)
  cache.set(map, T)
  return T
}
