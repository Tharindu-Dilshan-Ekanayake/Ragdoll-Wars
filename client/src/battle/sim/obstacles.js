import { slabAt } from './levels.js'
import { groundAt, rayTerrain } from './terrain.js'

/**
 * Static battlefield geometry: the obstacle boxes, packed for fast queries.
 *
 * - `segmentHit3D`: where a bullet's path first hits cover (slab test per box).
 * - `segmentClear2D`: can a soldier walk straight there (boxes grown by the body radius).
 * - `collideCircle`: pushes a soldier out of any box it walked into.
 * - `pushOutSphere`: the same for ragdoll joints, including standing on top of a box.
 *
 * On a map with terrain, `obs.terrain` (set by the world) adds the ground to the line of
 * fire and to the walker's floor.
 *
 * Collision queries go through an 8 m bucket grid so each looks at a handful of boxes.
 * Line-of-fire queries test every box with a cheap 2D bounding-box reject first: a map
 * has ~100 boxes, and that beats walking a grid for the long sight lines fights use.
 */

const BUCKET = 8
/** Boxes lower than this are low cover: you can stand and shoot over them. */
export const LOW_COVER = 1.4

export function buildObstacles(map) {
  const list = map.obstacles
  const n = list.length
  // minX, minZ, maxX, maxZ, height per box.
  const data = new Float32Array(n * 5)
  /** Rampart boxes (rampart.js): no cover against anyone standing up on top of them. */
  const deck = new Uint8Array(n)
  /** Water basins (setpieces.js): flat, but nobody walks on them. */
  const water = new Uint8Array(n)
  /** Platforms and ramp steps (levels.js): soldiers walk on them, not into them. */
  const level = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    const o = list[i]
    if (o.deck) deck[i] = 1
    if (o.water) water[i] = 1
    if (o.level) level[i] = 1
    data[i * 5] = o.x - o.w / 2
    data[i * 5 + 1] = o.z - o.d / 2
    data[i * 5 + 2] = o.x + o.w / 2
    data[i * 5 + 3] = o.z + o.d / 2
    data[i * 5 + 4] = o.h
  }

  const halfW = map.width / 2 + 4
  const halfD = map.depth / 2 + 4
  const cols = Math.ceil((halfW * 2) / BUCKET)
  const rows = Math.ceil((halfD * 2) / BUCKET)
  const buckets = Array.from({ length: cols * rows }, () => [])
  for (let i = 0; i < n; i += 1) {
    const c0 = Math.max(0, Math.floor((data[i * 5] - 1 + halfW) / BUCKET))
    const c1 = Math.min(cols - 1, Math.floor((data[i * 5 + 2] + 1 + halfW) / BUCKET))
    const r0 = Math.max(0, Math.floor((data[i * 5 + 1] - 1 + halfD) / BUCKET))
    const r1 = Math.min(rows - 1, Math.floor((data[i * 5 + 3] + 1 + halfD) / BUCKET))
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) buckets[r * cols + c].push(i)
  }

  return {
    list,
    count: n,
    data,
    deck,
    water,
    level,
    buckets,
    cols,
    rows,
    halfW,
    halfD,
    /** Soldiers stay inside this (the fence, less a body). */
    limitX: map.width / 2 - 1,
    limitZ: map.depth / 2 - 1,
  }
}

function bucketAt(obs, x, z) {
  const c = Math.floor((x + obs.halfW) / BUCKET)
  const r = Math.floor((z + obs.halfD) / BUCKET)
  if (c < 0 || r < 0 || c >= obs.cols || r >= obs.rows) return null
  return obs.buckets[r * obs.cols + c]
}

/**
 * First hit of the segment A -> B with any box, as a fraction 0..1 along it, or
 * Infinity. A box the segment starts inside is ignored (a soldier pressed against
 * cover), and so is low cover within `lipSkip` metres of A: you shoot over the lip of
 * the sandbags you crouch behind. A rampart box is ignored by a segment starting near or
 * above its top: troops on the wall fire over the parapet and down its face.
 */
export function segmentHit3D(obs, ax, ay, az, bx, by, bz, lipSkip = 0) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const minX = Math.min(ax, bx)
  const maxX = Math.max(ax, bx)
  const minZ = Math.min(az, bz)
  const maxZ = Math.max(az, bz)
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
  const d = obs.data
  let best = Infinity
  for (let i = 0, o = 0; i < obs.count; i += 1, o += 5) {
    const x0 = d[o]
    const z0 = d[o + 1]
    const x1 = d[o + 2]
    const z1 = d[o + 3]
    if (x1 < minX || x0 > maxX || z1 < minZ || z0 > maxZ) continue
    const h = d[o + 4]
    if (obs.deck[i] && ay > h - 1.25) continue
    let tmin = 0
    let tmax = 1
    // X slab
    if (Math.abs(dx) < 1e-9) {
      if (ax < x0 || ax > x1) continue
    } else {
      let t1 = (x0 - ax) / dx
      let t2 = (x1 - ax) / dx
      if (t1 > t2) {
        const t = t1
        t1 = t2
        t2 = t
      }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    // Y slab (ground to the top of the box)
    if (Math.abs(dy) < 1e-9) {
      if (ay < 0 || ay > h) continue
    } else {
      let t1 = (0 - ay) / dy
      let t2 = (h - ay) / dy
      if (t1 > t2) {
        const t = t1
        t1 = t2
        t2 = t
      }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) {
      if (az < z0 || az > z1) continue
    } else {
      let t1 = (z0 - az) / dz
      let t2 = (z1 - az) / dz
      if (t1 > t2) {
        const t = t1
        t1 = t2
        t2 = t
      }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) continue
    }
    if (tmin <= 0) continue // started inside this box
    if (lipSkip > 0 && h < LOW_COVER && tmin * len < lipSkip) continue
    if (tmin < best) best = tmin
  }
  // The ground itself, on maps with hills and trenches (terrain.js).
  if (obs.terrain) {
    const t = rayTerrain(obs.terrain, ax, ay, az, bx, by, bz)
    if (t < best) best = t
  }
  return best
}

/** True when nothing (boxes grown by `inflate`) lies between A and B on the ground. */
export function segmentClear2D(obs, ax, az, bx, bz, inflate, solidLevels = false) {
  const dx = bx - ax
  const dz = bz - az
  const minX = Math.min(ax, bx) - inflate
  const maxX = Math.max(ax, bx) + inflate
  const minZ = Math.min(az, bz) - inflate
  const maxZ = Math.max(az, bz) + inflate
  const d = obs.data
  for (let i = 0, o = 0; i < obs.count; i += 1, o += 5) {
    if (obs.level[i] && !solidLevels) continue
    const x0 = d[o] - inflate
    const z0 = d[o + 1] - inflate
    const x1 = d[o + 2] + inflate
    const z1 = d[o + 3] + inflate
    if (x1 < minX || x0 > maxX || z1 < minZ || z0 > maxZ) continue
    let tmin = 0
    let tmax = 1
    if (Math.abs(dx) < 1e-9) {
      if (ax < x0 || ax > x1) continue
    } else {
      let t1 = (x0 - ax) / dx
      let t2 = (x1 - ax) / dx
      if (t1 > t2) {
        const t = t1
        t1 = t2
        t2 = t
      }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) continue
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < z0 || az > z1) continue
    } else {
      let t1 = (z0 - az) / dz
      let t2 = (z1 - az) / dz
      if (t1 > t2) {
        const t = t1
        t1 = t2
        t2 = t
      }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) continue
    }
    return false
  }
  return true
}

/**
 * Pushes the circle at `p` ({x, z}) out of every box it overlaps and keeps it inside
 * the fence. Returns true if it was pushed (the soldier bumped into something).
 */
export function collideCircle(obs, p, r, solidLevels = false) {
  let pushed = false
  const list = bucketAt(obs, p.x, p.z)
  if (list) {
    const d = obs.data
    for (let k = 0; k < list.length; k += 1) {
      if (obs.level[list[k]] && !solidLevels) continue
      const o = list[k] * 5
      const cx = Math.max(d[o], Math.min(p.x, d[o + 2]))
      const cz = Math.max(d[o + 1], Math.min(p.z, d[o + 3]))
      const ox = p.x - cx
      const oz = p.z - cz
      const dist2 = ox * ox + oz * oz
      if (dist2 >= r * r) continue
      if (dist2 > 1e-10) {
        const dist = Math.sqrt(dist2)
        p.x = cx + (ox / dist) * r
        p.z = cz + (oz / dist) * r
      } else {
        // Centre inside the box: out through the nearest face.
        const left = p.x - d[o]
        const right = d[o + 2] - p.x
        const back = p.z - d[o + 1]
        const front = d[o + 3] - p.z
        const m = Math.min(left, right, back, front)
        if (m === left) p.x = d[o] - r
        else if (m === right) p.x = d[o + 2] + r
        else if (m === back) p.z = d[o + 1] - r
        else p.z = d[o + 3] + r
      }
      pushed = true
    }
  }
  if (p.x < -obs.limitX) {
    p.x = -obs.limitX
    pushed = true
  } else if (p.x > obs.limitX) {
    p.x = obs.limitX
    pushed = true
  }
  if (p.z < -obs.limitZ) {
    p.z = -obs.limitZ
    pushed = true
  } else if (p.z > obs.limitZ) {
    p.z = obs.limitZ
    pushed = true
  }
  return pushed
}

/**
 * Pushes a ragdoll joint (sphere of radius r at arr[i..i+2]) out of any box, through the
 * face it is least deep behind - which can be the top, so a body can drape over
 * sandbags. Returns true if it touched a box.
 */
export function pushOutSphere(obs, arr, i, r) {
  const list = bucketAt(obs, arr[i], arr[i + 2])
  if (!list) return false
  const d = obs.data
  let touched = false
  for (let k = 0; k < list.length; k += 1) {
    const o = list[k] * 5
    const x = arr[i]
    const y = arr[i + 1]
    const z = arr[i + 2]
    const x0 = d[o] - r
    const z0 = d[o + 1] - r
    const x1 = d[o + 2] + r
    const z1 = d[o + 3] + r
    const top = d[o + 4] + r
    if (x <= x0 || x >= x1 || z <= z0 || z >= z1 || y >= top) continue
    const left = x - x0
    const right = x1 - x
    const back = z - z0
    const front = z1 - z
    const up = top - y
    const m = Math.min(left, right, back, front, up)
    if (m === up) arr[i + 1] = top
    else if (m === left) arr[i] = x0
    else if (m === right) arr[i] = x1
    else if (m === back) arr[i + 2] = z0
    else arr[i + 2] = z1
    touched = true
  }
  return touched
}

/**
 * Walk mode's body: pushes the circle at `p` out of the boxes that stand higher than
 * `stepTop` (anything lower you step up onto or are already standing above), and keeps
 * it inside the fence. Returns true if it bumped something.
 */
export function collideWalker(obs, p, r, stepTop) {
  let pushed = false
  const list = bucketAt(obs, p.x, p.z)
  if (list) {
    const d = obs.data
    for (let k = 0; k < list.length; k += 1) {
      const o = list[k] * 5
      if (d[o + 4] <= stepTop && !obs.water[list[k]]) continue
      const cx = Math.max(d[o], Math.min(p.x, d[o + 2]))
      const cz = Math.max(d[o + 1], Math.min(p.z, d[o + 3]))
      const ox = p.x - cx
      const oz = p.z - cz
      const dist2 = ox * ox + oz * oz
      if (dist2 >= r * r) continue
      if (dist2 > 1e-10) {
        const dist = Math.sqrt(dist2)
        p.x = cx + (ox / dist) * r
        p.z = cz + (oz / dist) * r
      } else {
        const left = p.x - d[o]
        const right = d[o + 2] - p.x
        const back = p.z - d[o + 1]
        const front = d[o + 3] - p.z
        const m = Math.min(left, right, back, front)
        if (m === left) p.x = d[o] - r
        else if (m === right) p.x = d[o + 2] + r
        else if (m === back) p.z = d[o + 1] - r
        else p.z = d[o + 3] + r
      }
      pushed = true
    }
  }
  const lx = obs.limitX + 1
  const lz = obs.limitZ + 1
  if (p.x < -lx || p.x > lx || p.z < -lz || p.z > lz) pushed = true
  p.x = Math.max(-lx, Math.min(lx, p.x))
  p.z = Math.max(-lz, Math.min(lz, p.z))
  return pushed
}

/**
 * The floor under a body of radius `r` at (x, z): the highest box top no higher than
 * `maxTop` that it overlaps, or 0 on open ground.
 */
export function floorUnder(obs, x, z, r, maxTop) {
  // The ground, or an upper floor (two-storey buildings) you're up at.
  let ground = groundAt(obs.terrain, x, z)
  if (obs.levels && obs.levels.slabs) {
    const up = slabAt(obs.levels, x, z)
    if (up === up && up <= maxTop && up > ground) ground = up
  }
  const list = bucketAt(obs, x, z)
  if (!list) return ground
  const d = obs.data
  let h = ground
  const m = r * 0.5
  for (let k = 0; k < list.length; k += 1) {
    const o = list[k] * 5
    const top = d[o + 4]
    if (top <= h || top > maxTop) continue
    if (x > d[o] - m && x < d[o + 2] + m && z > d[o + 1] - m && z < d[o + 3] + m) h = top
  }
  return h
}

/** Height of the top of whatever box is under (x, z), or 0 on open ground. */
export function supportHeight(obs, x, z) {
  const list = bucketAt(obs, x, z)
  if (!list) return 0
  const d = obs.data
  let h = 0
  for (let k = 0; k < list.length; k += 1) {
    const o = list[k] * 5
    if (x > d[o] && x < d[o + 2] && z > d[o + 1] && z < d[o + 3] && d[o + 4] > h) h = d[o + 4]
  }
  return h
}

/**
 * Spots right behind low cover where a soldier can crouch: along each long face of
 * every low box, every ~1.3 m, 0.6 m out from the face. Each records the outward
 * normal (the side it shelters from is the opposite one).
 */
export function buildCoverSpots(obs) {
  const spots = []
  const d = obs.data
  for (let i = 0; i < obs.count; i += 1) {
    if (obs.level[i]) continue
    const o = i * 5
    // A railing counts from the platform it stands on, and only shelters that side.
    const src = obs.list[i]
    const h = d[o + 4] - (src.base || 0)
    if (h < 0.7 || h >= LOW_COVER) continue
    const x0 = d[o]
    const z0 = d[o + 1]
    const x1 = d[o + 2]
    const z1 = d[o + 3]
    const w = x1 - x0
    const dep = z1 - z0
    const off = 0.62
    const along = (from, to, fixed, axis, nx, nz) => {
      const len = to - from
      const n = Math.max(1, Math.floor(len / 1.3))
      for (let k = 0; k < n; k += 1) {
        const t = from + ((k + 0.5) / n) * len
        const x = axis === 'x' ? t : fixed
        const z = axis === 'x' ? fixed : t
        if (Math.abs(x) > obs.limitX || Math.abs(z) > obs.limitZ) continue
        spots.push({ x, z, nx, nz, box: i, taken: -1 })
      }
    }
    const rail = src.base > 0
    if (w >= dep) {
      if (!rail || src.inZ < 0) along(x0, x1, z0 - off, 'x', 0, -1)
      if (!rail || src.inZ > 0) along(x0, x1, z1 + off, 'x', 0, 1)
    }
    if (dep >= w) {
      if (!rail || src.inX < 0) along(z0, z1, x0 - off, 'z', -1, 0)
      if (!rail || src.inX > 0) along(z0, z1, x1 + off, 'z', 1, 0)
    }
  }
  return spots
}
