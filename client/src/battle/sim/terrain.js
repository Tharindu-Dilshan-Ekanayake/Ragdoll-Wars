/**
 * Terrain: the battlefield's ground height - rolling hills, ridges and berms, dug
 * trenches - as a 1 m heightfield. Plain data and lookups, no three.js (the server runs it).
 *
 * A map describes it in `map.terrain`:
 *   hills:    [{ x, z, r, h }]                 smooth mounds (h < 0: a hollow)
 *   ridges:   [{ points: [[x, z], ...], w, h }] long banks along a line (berms, ridges)
 *   trenches: [{ points, w, d, ramp }]          flat-bottomed cuts d deep, walls about a
 *                                               metre wide, a ramp out at each end
 *   rough:    amplitude (m) of a gentle undulation over the open ground
 *
 * Wherever something stands - every obstacle box, set piece, raised floor, basin, helipad
 * and base - the ground is levelled back to 0 (blending out over a few metres), so the
 * rest of the game keeps its flat-floored boxes. Mirrored maps stay fair because the
 * features are mirrored by the map like everything else.
 */

/** Heightfield cell (m), the coarse cell for ray early-outs, and the flattening blend (m). */
const RES = 1
const COARSE = 8
const BLEND = 3.5
/** Bank width either side of a trench's flat floor. */
const WALL = 1.1

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

function distToPolyline(x, z, pts) {
  let best = Infinity
  let along = 0
  let bestAlong = 0
  let total = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1
    const len = Math.sqrt(l2)
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2))
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t)
    if (d < best) {
      best = d
      bestAlong = along + t * len
    }
    along += len
    total += len
  }
  return [best, bestAlong, total]
}

/** Low-cost value noise for the undulation (deterministic). */
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** The raw height of the features at (x, z), before levelling. */
function rawHeight(T, x, z) {
  let h = 0
  for (const hl of T.hills) {
    const d = Math.hypot(x - hl.x, z - hl.z) / hl.r
    if (d < 1) {
      const c = Math.cos(d * Math.PI * 0.5)
      h += hl.h * c * c
    }
  }
  for (const rg of T.ridges) {
    const [d] = distToPolyline(x, z, rg.points)
    const t = d / (rg.w / 2)
    if (t < 1) {
      const c = Math.cos(t * Math.PI * 0.5)
      h += rg.h * c * c
    }
  }
  if (T.rough) h += (vnoise(x * 0.06, z * 0.06) - 0.5) * 2 * T.rough + (vnoise(x * 0.17 + 9, z * 0.17) - 0.5) * T.rough * 0.5
  return h
}

/** Trench depth at (x, z): 0 outside, down to -d on the floor, ramped at the ends. */
function trenchCut(T, x, z) {
  let cut = 0
  for (const tr of T.trenches) {
    const [d, along, total] = distToPolyline(x, z, tr.points)
    const half = tr.w / 2
    if (d > half + WALL) continue
    const wall = d <= half ? 1 : 1 - smooth((d - half) / WALL)
    const ramp = tr.ramp ?? 3
    const ends = ramp > 0 ? smooth(Math.min(along, total - along) / ramp) : 1
    cut = Math.min(cut, -tr.d * wall * ends)
  }
  return cut
}

/**
 * Builds the heightfield for `map` (null if it has no terrain). `standing`: boxes
 * [{x, z, w, d}] where the ground must be level (obstacles, raised floors, pads...).
 */
export function buildTerrain(map, standing) {
  const src = map.terrain
  if (!src) return null
  const T = {
    hills: src.hills || [],
    ridges: src.ridges || [],
    trenches: src.trenches || [],
    rough: src.rough || 0,
  }
  const halfW = map.width / 2 + 10
  const halfD = map.depth / 2 + 10
  const cols = Math.ceil((halfW * 2) / RES) + 1
  const rows = Math.ceil((halfD * 2) / RES) + 1
  const h = new Float32Array(cols * rows)
  // How strongly each cell is held level (1 = flat), from the standing boxes.
  const hold = new Float32Array(cols * rows)
  for (const b of standing) {
    const x0 = b.x - b.w / 2 - BLEND
    const x1 = b.x + b.w / 2 + BLEND
    const z0 = b.z - b.d / 2 - BLEND
    const z1 = b.z + b.d / 2 + BLEND
    const c0 = Math.max(0, Math.floor((x0 + halfW) / RES))
    const c1 = Math.min(cols - 1, Math.ceil((x1 + halfW) / RES))
    const r0 = Math.max(0, Math.floor((z0 + halfD) / RES))
    const r1 = Math.min(rows - 1, Math.ceil((z1 + halfD) / RES))
    for (let r = r0; r <= r1; r += 1) {
      const z = -halfD + r * RES
      const dz = Math.max(0, Math.abs(z - b.z) - b.d / 2 - 0.6)
      for (let c = c0; c <= c1; c += 1) {
        const x = -halfW + c * RES
        const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2 - 0.6)
        const k = 1 - smooth(Math.hypot(dx, dz) / BLEND)
        const i = r * cols + c
        if (k > hold[i]) hold[i] = k
      }
    }
  }
  // The fence line stays at ground level too.
  for (let r = 0; r < rows; r += 1) {
    const z = -halfD + r * RES
    for (let c = 0; c < cols; c += 1) {
      const x = -halfW + c * RES
      const i = r * cols + c
      const edge = Math.min(map.width / 2 - Math.abs(x), map.depth / 2 - Math.abs(z))
      const k = edge < 2 ? 1 : 1 - smooth((edge - 2) / 6)
      // Trenches are dug through the levelling (but not under the boxes themselves).
      const keep = 1 - Math.max(hold[i], k)
      const cut = trenchCut(T, x, z)
      h[i] = rawHeight(T, x, z) * keep + cut * (hold[i] > 0.98 ? 0 : 1 - k)
    }
  }
  // Coarse max/min per COARSE cell for ray early-outs.
  const cc = Math.ceil(cols / COARSE)
  const cr = Math.ceil(rows / COARSE)
  const maxH = new Float32Array(cc * cr).fill(-Infinity)
  let top = -Infinity
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = h[r * cols + c]
      const k = Math.floor(r / COARSE) * cc + Math.floor(c / COARSE)
      if (v > maxH[k]) maxH[k] = v
      if (v > top) top = v
    }
  }
  // Coarse cells with a steep bit in them (a trench wall, a steep bank): where walking
  // straight needs checking (steepAlong).
  const steep = new Uint8Array(cc * cr)
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const i = r * cols + c
      if (Math.abs(h[i + 1] - h[i]) > 0.4 * RES || Math.abs(h[i + cols] - h[i]) > 0.4 * RES) steep[Math.floor(r / COARSE) * cc + Math.floor(c / COARSE)] = 1
    }
  }
  return { halfW, halfD, cols, rows, h, cc, cr, maxH, top, steep }
}

/**
 * Whether walking straight from A to B on the ground would climb or drop more than
 * `step` somewhere (down a trench wall): only steep coarse cells are sampled.
 */
export function steepAlong(T, ax, az, bx, bz, step) {
  if (!T) return false
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return false
  const n = Math.ceil(len / (COARSE * 0.5))
  let prev = null
  for (let s = 0; s < n; s += 1) {
    const t0 = s / n
    const t1 = (s + 1) / n
    const mx = ax + dx * (t0 + t1) * 0.5
    const mz = az + dz * (t0 + t1) * 0.5
    const c = Math.floor((mx + T.halfW) / RES / COARSE)
    const r = Math.floor((mz + T.halfD) / RES / COARSE)
    if (c < 0 || r < 0 || c >= T.cc || r >= T.cr || !T.steep[r * T.cc + c]) {
      prev = null
      continue
    }
    const m = Math.max(2, Math.ceil(((t1 - t0) * len) / 0.4))
    for (let k = 0; k <= m; k += 1) {
      const t = t0 + ((t1 - t0) * k) / m
      const g = groundAt(T, ax + dx * t, az + dz * t)
      if (prev !== null && Math.abs(g - prev) > step) return true
      prev = g
    }
  }
  return false
}

/** Ground height at (x, z) (bilinear; 0 outside the field). */
export function groundAt(T, x, z) {
  if (!T) return 0
  const fx = (x + T.halfW) / RES
  const fz = (z + T.halfD) / RES
  if (fx < 0 || fz < 0 || fx >= T.cols - 1 || fz >= T.rows - 1) return 0
  const c = Math.floor(fx)
  const r = Math.floor(fz)
  const u = fx - c
  const v = fz - r
  const i = r * T.cols + c
  const h = T.h
  const a = h[i]
  const b = h[i + 1]
  const d = h[i + T.cols]
  const e = h[i + T.cols + 1]
  return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v
}

/** The ground's slope at (x, z) as { x, z } (rise per metre), written to out. */
export function slopeAt(T, x, z, out) {
  out.x = (groundAt(T, x + 0.5, z) - groundAt(T, x - 0.5, z)) / 1
  out.z = (groundAt(T, x, z + 0.5) - groundAt(T, x, z - 0.5)) / 1
  return out
}

/**
 * First hit of segment A -> B with the ground, as a fraction 0..1, or Infinity. Walks the
 * coarse cells and only samples where the segment dips to the top of the ground in them.
 * The first 0.3 m are ignored (a shooter lying on a slope).
 */
export function rayTerrain(T, ax, ay, az, bx, by, bz) {
  if (!T) return Infinity
  if (ay > T.top && by > T.top) return Infinity
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-6) return Infinity
  const n = Math.ceil(len / (COARSE * 0.5))
  const skip = 0.3 / len
  for (let s = 0; s < n; s += 1) {
    const t0 = s / n
    const t1 = (s + 1) / n
    // The coarse cell under this stretch's middle (stretches are half a coarse cell).
    const mx = ax + dx * (t0 + t1) * 0.5
    const mz = az + dz * (t0 + t1) * 0.5
    const yLow = Math.min(ay + dy * t0, ay + dy * t1)
    const c = Math.floor((mx + T.halfW) / RES / COARSE)
    const r = Math.floor((mz + T.halfD) / RES / COARSE)
    if (c < 0 || r < 0 || c >= T.cc || r >= T.cr) continue
    // Neighbouring coarse cells too: the stretch can cross into them.
    let top = T.maxH[r * T.cc + c]
    if (c + 1 < T.cc) top = Math.max(top, T.maxH[r * T.cc + c + 1])
    if (c > 0) top = Math.max(top, T.maxH[r * T.cc + c - 1])
    if (r + 1 < T.cr) top = Math.max(top, T.maxH[(r + 1) * T.cc + c])
    if (r > 0) top = Math.max(top, T.maxH[(r - 1) * T.cc + c])
    if (yLow > top) continue
    // Sample this stretch every half metre.
    const m = Math.max(2, Math.ceil(((t1 - t0) * len) / 0.5))
    for (let k = 0; k <= m; k += 1) {
      const t = t0 + ((t1 - t0) * k) / m
      if (t < skip) continue
      if (ay + dy * t < groundAt(T, ax + dx * t, az + dz * t)) return t
    }
  }
  return Infinity
}
