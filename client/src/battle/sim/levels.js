/**
 * Raised floors: platforms troops stand on and ramps up to them. Plain data and lookups
 * only, so the sim, the renderer and the input layer can all use them.
 *
 * A map lists them in `map.levels`:
 *   { x, z, w, d, h, open: [[side, centre, width], ...] }  - a platform, h high, with a
 *       railing round its edge except the openings (side 'n' -z, 's' +z, 'w' -x, 'e' +x;
 *       centre along that side, in world coordinates).
 *   { ramp: 'x+' | 'x-' | 'z+' | 'z-', x, z, w, d, h }      - a ramp, rising from the
 *       ground to h towards the named direction.
 *
 * Soldiers walk up ramps and about on platforms (their floor height is `floorAt`), but
 * never step off an edge or up a sheer side. The obstacle boxes from `levelObstacles`
 * make them solid for bullets, vehicles, ragdolls and the walker: platforms as one box,
 * ramps as a flight of shallow steps, railings as thin walls standing on the platform.
 */

/** The most a soldier steps up or down in one go. */
export const STEP = 0.6
/** Railing: height above the platform and thickness. */
export const RAIL_H = 1.0
export const RAIL_T = 0.4

/** Mirrors a level across x = 0 (maps are written as a west half). */
export function mirrorLevel(l) {
  const out = { ...l, x: -l.x }
  if (l.ramp === 'x+') out.ramp = 'x-'
  else if (l.ramp === 'x-') out.ramp = 'x+'
  if (l.open) out.open = l.open.map(([side, c, wd]) => [side === 'w' ? 'e' : side === 'e' ? 'w' : side, side === 'n' || side === 's' ? -c : c, wd])
  return out
}

/** The map's levels prepared for lookups, or null if it has none. */
export function buildLevels(map) {
  const list = map.levels
  if (!list || !list.length) return null
  const items = list.map((l) => ({
    x0: l.x - l.w / 2,
    x1: l.x + l.w / 2,
    z0: l.z - l.d / 2,
    z1: l.z + l.d / 2,
    h: l.h,
    ramp: l.ramp || null,
  }))
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const it of items) {
    x0 = Math.min(x0, it.x0)
    x1 = Math.max(x1, it.x1)
    z0 = Math.min(z0, it.z0)
    z1 = Math.max(z1, it.z1)
  }
  return { items, x0, x1, z0, z1 }
}

/** Floor height of one level at (x, z) (assumed inside it). */
function heightOf(it, x, z) {
  if (!it.ramp) return it.h
  if (it.ramp === 'x+') return (it.h * (x - it.x0)) / (it.x1 - it.x0)
  if (it.ramp === 'x-') return (it.h * (it.x1 - x)) / (it.x1 - it.x0)
  if (it.ramp === 'z+') return (it.h * (z - it.z0)) / (it.z1 - it.z0)
  return (it.h * (it.z1 - z)) / (it.z1 - it.z0)
}

/** Height of the floor at (x, z): a platform's top, partway up a ramp, or 0. */
export function floorAt(L, x, z) {
  if (!L || x < L.x0 || x > L.x1 || z < L.z0 || z > L.z1) return 0
  let f = 0
  const items = L.items
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue
    const h = heightOf(it, x, z)
    if (h > f) f = h
  }
  return f
}

/**
 * Whether walking straight from A to B would climb or drop more than a step somewhere
 * (over a railing-less edge, up a platform's side): then the flow field must lead. Only
 * the stretches of the segment over a level are sampled.
 */
export function touchesLevels(L, ax, az, bx, bz, pad) {
  if (!L) return false
  const minX = Math.min(ax, bx) - pad
  const maxX = Math.max(ax, bx) + pad
  const minZ = Math.min(az, bz) - pad
  const maxZ = Math.max(az, bz) + pad
  if (maxX < L.x0 || minX > L.x1 || maxZ < L.z0 || minZ > L.z1) return false
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz) || 1
  let f = floorAt(L, ax, az)
  for (const it of L.items) {
    if (maxX < it.x0 || minX > it.x1 || maxZ < it.z0 || minZ > it.z1) continue
    // The part of the segment inside this level's box (grown by pad).
    let t0 = 0
    let t1 = 1
    for (const [o, d, lo, hi] of [
      [ax, dx, it.x0 - pad, it.x1 + pad],
      [az, dz, it.z0 - pad, it.z1 + pad],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) t1 = -1
        continue
      }
      let u0 = (lo - o) / d
      let u1 = (hi - o) / d
      if (u0 > u1) [u0, u1] = [u1, u0]
      t0 = Math.max(t0, u0)
      t1 = Math.min(t1, u1)
    }
    if (t1 < t0) continue
    const n = Math.max(2, Math.ceil(((t1 - t0) * len) / 0.4))
    let prev = floorAt(L, ax + dx * t0, az + dz * t0)
    if (Math.abs(prev - f) > STEP) return true
    for (let k = 1; k <= n; k += 1) {
      const t = t0 + ((t1 - t0) * k) / n
      const h = floorAt(L, ax + dx * t, az + dz * t)
      if (Math.abs(h - prev) > STEP) return true
      prev = h
    }
    f = prev
  }
  return false
}

/**
 * Moves p ({x, z}, already moved from (ox, oz), where the floor is f0) back where a step
 * would climb or drop more than STEP: slides along whichever axis still works, else
 * stays put.
 */
export function stepOnLevels(L, ox, oz, p, f0 = floorAt(L, ox, oz)) {
  if (Math.abs(floorAt(L, p.x, p.z) - f0) <= STEP) return
  if (Math.abs(floorAt(L, p.x, oz) - f0) <= STEP) p.z = oz
  else if (Math.abs(floorAt(L, ox, p.z) - f0) <= STEP) p.x = ox
  else {
    p.x = ox
    p.z = oz
  }
}

/** A platform's railing runs: [x, z, w, d] per stretch of side, leaving the openings. */
export function railRuns(l) {
  const out = []
  const sides = [
    ['n', l.z - l.d / 2 + RAIL_T / 2, true],
    ['s', l.z + l.d / 2 - RAIL_T / 2, true],
    ['w', l.x - l.w / 2 + RAIL_T / 2, false],
    ['e', l.x + l.w / 2 - RAIL_T / 2, false],
  ]
  for (const [side, fixed, alongX] of sides) {
    const a0 = alongX ? l.x - l.w / 2 : l.z - l.d / 2
    const a1 = alongX ? l.x + l.w / 2 : l.z + l.d / 2
    const gaps = (l.open || []).filter((o) => o[0] === side).map(([, c, wd]) => [c - wd / 2, c + wd / 2])
    gaps.sort((a, b) => a[0] - b[0])
    let from = a0
    const cut = [...gaps, [a1, a1]]
    for (const [g0, g1] of cut) {
      const to = Math.min(g0, a1)
      if (to - from > 0.3) {
        const mid = (from + to) / 2
        const len = to - from
        out.push(alongX ? [mid, fixed, len, RAIL_T, side] : [fixed, mid, RAIL_T, len, side])
      }
      from = Math.max(from, g1)
    }
  }
  return out
}

/** Steps per ramp for the obstacle boxes (the walker climbs them, ragdolls lie on them). */
const rampSteps = (h) => Math.max(4, Math.ceil(h / 0.3))

/**
 * Obstacle boxes for the map's levels. Platform and step boxes are flagged `level` (soldiers
 * don't collide with them, their floor height handles that) and `deck` (no cover against
 * anyone standing on or near their top). Railings are ordinary walls from the ground to the
 * top of the rail, flagged `deck` and carrying their platform's height in `base` and the
 * way onto the platform in `inX`/`inZ` (cover spots go on that side).
 */
export function levelObstacles(map) {
  const out = []
  for (const l of map.levels || []) {
    if (l.ramp) {
      const n = rampSteps(l.h)
      const alongX = l.ramp[0] === 'x'
      const up = l.ramp[1] === '+' ? 1 : -1
      const len = alongX ? l.w : l.d
      for (let k = 0; k < n; k += 1) {
        // Step k from the low end; its top at the ramp's height at the step's far edge.
        const a = (k + 0.5) / n - 0.5
        const top = (l.h * (k + 1)) / n
        const c = up * a * len
        out.push({
          kind: 'level',
          level: true,
          deck: true,
          x: alongX ? l.x + c : l.x,
          z: alongX ? l.z : l.z + c,
          w: alongX ? len / n : l.w,
          d: alongX ? l.d : len / n,
          h: top,
        })
      }
    } else {
      out.push({ kind: 'level', level: true, deck: true, x: l.x, z: l.z, w: l.w, d: l.d, h: l.h })
      for (const [x, z, w, d, side] of railRuns(l)) {
        out.push({
          kind: 'rail',
          deck: true,
          base: l.h,
          inX: side === 'w' ? 1 : side === 'e' ? -1 : 0,
          inZ: side === 'n' ? 1 : side === 's' ? -1 : 0,
          x,
          z,
          w,
          d,
          h: l.h + RAIL_H,
        })
      }
    }
  }
  return out
}

/**
 * First point where the ray o + t*d (t in [0, tMax]) meets a platform top or a ramp
 * surface: writes { t, y } to out and returns true, else false. (Picking the ground under
 * the pointer.)
 */
export function rayLevels(L, ox, oy, oz, dx, dy, dz, tMax, out) {
  if (!L) return false
  let best = tMax
  let hit = false
  for (const it of L.items) {
    let t
    if (!it.ramp) {
      if (Math.abs(dy) < 1e-9) continue
      t = (it.h - oy) / dy
    } else {
      // The ramp's surface is a plane: y = h * (s - s0) / len along its axis.
      const alongX = it.ramp[0] === 'x'
      const up = it.ramp[1] === '+'
      const s0 = alongX ? (up ? it.x0 : it.x1) : up ? it.z0 : it.z1
      const len = (alongX ? it.x1 - it.x0 : it.z1 - it.z0) * (up ? 1 : -1)
      const k = it.h / len
      const os = alongX ? ox : oz
      const ds = alongX ? dx : dz
      const den = dy - k * ds
      if (Math.abs(den) < 1e-9) continue
      t = (k * (os - s0) - oy) / den
    }
    if (t < 0 || t >= best) continue
    const x = ox + dx * t
    const z = oz + dz * t
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue
    best = t
    out.t = t
    out.y = oy + dy * t
    hit = true
  }
  return hit
}
