import { buildObstacles, segmentClear2D } from './obstacles.js'
import { mapObstacles } from './pieces.js'

/**
 * Each side's helipad, where you fly in at the start of a battle (walk/arrivalFlight.js):
 * the map's own (`map.helipads`), else the nearest open square round its base with room
 * to walk off towards the front. Worked out from the map alone (so the grass scatter can
 * keep off them too) and cached per map.
 */

/** Pad size (m) and the clear ground round its middle it needs (half-width) for the rotor. */
export const PAD_SIZE = 9
const PAD_CLEAR = 6.5
/** Clearance for hopping out and jogging towards the front. */
const WALK_CLEAR = 0.7

const cache = new WeakMap()

/** Whether a square of half-width r round (x, z) is clear of every box (and inside the fence). */
function clearSquare(obs, x, z, r) {
  if (Math.abs(x) > obs.limitX - r || Math.abs(z) > obs.limitZ - r) return false
  const d = obs.data
  for (let i = 0, o = 0; i < obs.count; i += 1, o += 5) {
    if (d[o + 4] < 0.25 && !obs.water[i]) continue
    if (d[o + 2] < x - r || d[o] > x + r || d[o + 3] < z - r || d[o + 1] > z + r) continue
    return false
  }
  return true
}

/** [blue pad, red pad], each { x, z, ahead } (ahead: +1 / -1, the way to the front along x). */
export function helipadsOf(map) {
  const hit = cache.get(map)
  if (hit) return hit
  const obs = buildObstacles({ ...map, obstacles: mapObstacles(map) })
  const pads = [0, 1].map((team) => {
    const base = map.bases[team] || { x: 0, z: 0 }
    const ahead = team === 0 ? 1 : -1
    const own = map.helipads?.[team]
    if (own) return { x: own.x, z: own.z, ahead }
    for (const along of [-6, 0, -12, 6, -18, 12]) {
      for (const side of [12, -12, 18, -18, 6, -6, 24, -24, 0, 30, -30]) {
        const x = base.x + ahead * along
        const z = base.z + side
        if (!clearSquare(obs, x, z, PAD_CLEAR)) continue
        if (!segmentClear2D(obs, x, z - 1.3, x + ahead * 9, z - 1.3, WALK_CLEAR, true)) continue
        return { x, z, ahead }
      }
    }
    return { x: base.x, z: base.z, ahead }
  })
  cache.set(map, pads)
  return pads
}
