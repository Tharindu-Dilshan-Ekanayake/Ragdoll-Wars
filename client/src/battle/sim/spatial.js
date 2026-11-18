/**
 * Uniform hash grid over living soldiers, rebuilt every tick with a counting sort (no
 * allocation). Used for separation (who is too close) and for finding which soldiers a
 * bullet might pass through.
 */
const CELL = 4

export function createSpatial(map, maxItems) {
  const halfW = map.width / 2 + 2
  const halfD = map.depth / 2 + 2
  const cols = Math.ceil((halfW * 2) / CELL)
  const rows = Math.ceil((halfD * 2) / CELL)
  return {
    cols,
    rows,
    halfW,
    halfD,
    start: new Int32Array(cols * rows + 1),
    items: new Int32Array(maxItems),
    cellOf: new Int32Array(maxItems),
    count: 0,
  }
}

const cellFor = (sp, x, z) => {
  const c = Math.min(sp.cols - 1, Math.max(0, Math.floor((x + sp.halfW) / CELL)))
  const r = Math.min(sp.rows - 1, Math.max(0, Math.floor((z + sp.halfD) / CELL)))
  return r * sp.cols + c
}

/** Rebuilds from `soldiers` (an array of soldier objects with x, z, slot). */
export function rebuildSpatial(sp, soldiers) {
  const n = sp.cols * sp.rows
  const start = sp.start
  start.fill(0)
  for (let i = 0; i < soldiers.length; i += 1) {
    const s = soldiers[i]
    const c = cellFor(sp, s.x, s.z)
    sp.cellOf[i] = c
    start[c + 1] += 1
  }
  for (let c = 0; c < n; c += 1) start[c + 1] += start[c]
  // Fill using a moving cursor per cell (reuse cellOf as scratch once read).
  const cursor = sp._cursor || (sp._cursor = new Int32Array(n))
  cursor.set(start.subarray(0, n))
  for (let i = 0; i < soldiers.length; i += 1) {
    const c = sp.cellOf[i]
    sp.items[cursor[c]++] = i
  }
  sp.count = soldiers.length
}

/**
 * Calls fn(index) for every soldier index (into the array given to rebuildSpatial) whose
 * cell lies within `radius` of (x, z). Callers do the exact distance test.
 */
export function forNear(sp, x, z, radius, fn) {
  const c0 = Math.max(0, Math.floor((x - radius + sp.halfW) / CELL))
  const c1 = Math.min(sp.cols - 1, Math.floor((x + radius + sp.halfW) / CELL))
  const r0 = Math.max(0, Math.floor((z - radius + sp.halfD) / CELL))
  const r1 = Math.min(sp.rows - 1, Math.floor((z + radius + sp.halfD) / CELL))
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const cell = r * sp.cols + c
      for (let k = sp.start[cell]; k < sp.start[cell + 1]; k += 1) fn(sp.items[k])
    }
  }
}
