import { buildLevels, floorAt } from './levels.js'

/**
 * Ground navigation: a walkability grid over the map and cached flow fields on it.
 *
 * A flow field is one Dijkstra pass outward from a goal cell. Every soldier heading for
 * that goal (or one close to it) then just steps to its cheapest neighbouring cell, so a
 * hundred soldiers routing around the same wall cost one search, not a hundred.
 * Goals are snapped to a coarse key so nearby goals share a field; the cache keeps the
 * most recently used ones and at most `budget` new fields are built per tick.
 */

const CELL = 1.25
const INFLATE = 0.45
const ORTHO = 10
const DIAG = 14
const UNREACHED = 0xffffffff

/** Neighbouring cells further apart in floor height than this aren't connected. */
const STEP = 0.6

/**
 * The walkability grid. On maps with raised floors (levels.js) each cell also has its
 * floor height, and cells whose floors differ by more than a step aren't neighbours:
 * the way onto a platform is up its ramp.
 */
export function createNavGrid(map, obstacles) {
  const halfW = map.width / 2
  const halfD = map.depth / 2
  const cols = Math.ceil((halfW * 2) / CELL)
  const rows = Math.ceil((halfD * 2) / CELL)
  const blocked = new Uint8Array(cols * rows)
  const d = obstacles.data
  for (let i = 0; i < obstacles.count; i += 1) {
    if (obstacles.level[i]) continue
    const o = i * 5
    const x0 = d[o] - INFLATE
    const z0 = d[o + 1] - INFLATE
    const x1 = d[o + 2] + INFLATE
    const z1 = d[o + 3] + INFLATE
    const c0 = Math.max(0, Math.floor((x0 + halfW) / CELL))
    const c1 = Math.min(cols - 1, Math.floor((x1 + halfW) / CELL))
    const r0 = Math.max(0, Math.floor((z0 + halfD) / CELL))
    const r1 = Math.min(rows - 1, Math.floor((z1 + halfD) / CELL))
    for (let r = r0; r <= r1; r += 1) {
      const cz = -halfD + (r + 0.5) * CELL
      if (cz < z0 || cz > z1) continue
      for (let c = c0; c <= c1; c += 1) {
        const cx = -halfW + (c + 0.5) * CELL
        if (cx >= x0 && cx <= x1) blocked[r * cols + c] = 1
      }
    }
  }
  const L = buildLevels(map)
  let floor = null
  if (L) {
    floor = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) floor[r * cols + c] = floorAt(L, -halfW + (c + 0.5) * CELL, -halfD + (r + 0.5) * CELL)
    }
  }
  return { cols, rows, halfW, halfD, cell: CELL, blocked, floor }
}

/** The grid for ground vehicles: ramps and platforms blocked (null on a flat map). */
export function vehicleGrid(grid) {
  if (!grid.floor) return null
  const blocked = grid.blocked.slice()
  for (let i = 0; i < blocked.length; i += 1) if (grid.floor[i] > 0.05) blocked[i] = 1
  return { ...grid, blocked, floor: null }
}

/** Whether cells a and b (neighbours) are on floors a step apart or less. */
const joined = (floor, a, b) => !floor || Math.abs(floor[a] - floor[b]) <= STEP

export const cellIndex = (grid, x, z) => {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((x + grid.halfW) / grid.cell)))
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((z + grid.halfD) / grid.cell)))
  return r * grid.cols + c
}

const cellX = (grid, i) => -grid.halfW + ((i % grid.cols) + 0.5) * grid.cell
const cellZ = (grid, i) => -grid.halfD + (Math.floor(i / grid.cols) + 0.5) * grid.cell

/** Nearest walkable cell to `start` (spiral search) on the same floor as it, or -1. */
function nearestOpen(grid, start) {
  if (!grid.blocked[start]) return start
  const floor = grid.floor
  const f = floor ? floor[start] : 0
  const sc = start % grid.cols
  const sr = Math.floor(start / grid.cols)
  for (let rad = 1; rad < 12; rad += 1) {
    for (let dr = -rad; dr <= rad; dr += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue
        const r = sr + dr
        const c = sc + dc
        if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue
        const i = r * grid.cols + c
        if (!grid.blocked[i] && (!floor || Math.abs(floor[i] - f) <= STEP)) return i
      }
    }
  }
  return -1
}

/** Binary min-heap over (cost, cell) in typed arrays; reused between searches. */
class Heap {
  constructor(cap) {
    this.cost = new Uint32Array(cap)
    this.item = new Int32Array(cap)
    this.size = 0
  }
  push(cost, item) {
    if (this.size >= this.cost.length) return
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.cost[p] <= cost) break
      this.cost[i] = this.cost[p]
      this.item[i] = this.item[p]
      i = p
    }
    this.cost[i] = cost
    this.item[i] = item
  }
  pop() {
    const top = this.item[0]
    const last = --this.size
    const lc = this.cost[last]
    const li = this.item[last]
    let i = 0
    for (;;) {
      let c = i * 2 + 1
      if (c >= last) break
      if (c + 1 < last && this.cost[c + 1] < this.cost[c]) c += 1
      if (this.cost[c] >= lc) break
      this.cost[i] = this.cost[c]
      this.item[i] = this.item[c]
      i = c
    }
    this.cost[i] = lc
    this.item[i] = li
    return top
  }
}

const NEIGHBOURS = [
  [1, 0, ORTHO],
  [-1, 0, ORTHO],
  [0, 1, ORTHO],
  [0, -1, ORTHO],
  [1, 1, DIAG],
  [1, -1, DIAG],
  [-1, 1, DIAG],
  [-1, -1, DIAG],
]

export class FlowFields {
  constructor(grid, { maxFields = 28, budget = 1 } = {}) {
    this.grid = grid
    this.maxFields = maxFields
    this.budget = budget
    this.left = budget
    this.cache = new Map()
    this.heap = new Heap(grid.cols * grid.rows * 4)
    this.builds = 0
  }

  /** Call once per sim tick: refills the build budget. */
  tick() {
    this.left = this.budget
  }

  /** Goals within ~5 m share a field. */
  keyFor(x, z) {
    const g = this.grid
    const c = Math.floor((x + g.halfW) / (g.cell * 4))
    const r = Math.floor((z + g.halfD) / (g.cell * 4))
    // Up on a platform is a different goal from the ground beside it.
    const up = g.floor ? Math.round(g.floor[cellIndex(g, x, z)] * 2) : 0
    return up * 1e8 + r * 10000 + c
  }

  /** The field leading to (x, z), or null if it isn't built yet and the budget is spent. */
  get(x, z) {
    const key = this.keyFor(x, z)
    const hit = this.cache.get(key)
    if (hit) {
      // Refresh recency.
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    if (this.left <= 0) return null
    this.left -= 1
    const field = this.build(x, z)
    if (this.cache.size >= this.maxFields) this.cache.delete(this.cache.keys().next().value)
    this.cache.set(key, field)
    return field
  }

  build(x, z) {
    const g = this.grid
    const n = g.cols * g.rows
    const cost = new Uint32Array(n).fill(UNREACHED)
    const goal = nearestOpen(g, cellIndex(g, x, z))
    this.builds += 1
    if (goal < 0) return { cost, goal }
    const heap = this.heap
    heap.size = 0
    cost[goal] = 0
    heap.push(0, goal)
    const { cols, rows, blocked, floor } = g
    while (heap.size > 0) {
      const cur = heap.pop()
      const cc = cost[cur]
      const c = cur % cols
      const r = (cur - c) / cols
      for (let k = 0; k < 8; k += 1) {
        const nb = NEIGHBOURS[k]
        const nc = c + nb[0]
        const nr = r + nb[1]
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = nr * cols + nc
        if (blocked[ni] || !joined(floor, cur, ni)) continue
        // No cutting corners past a wall (or a drop).
        if (k >= 4 && (blocked[r * cols + nc] || blocked[nr * cols + c] || !joined(floor, cur, r * cols + nc) || !joined(floor, cur, nr * cols + c))) continue
        const nextCost = cc + nb[2]
        if (nextCost < cost[ni]) {
          cost[ni] = nextCost
          heap.push(nextCost, ni)
        }
      }
    }
    return { cost, goal }
  }

  /**
   * Direction to walk from (x, z) along `field`, written to out.x / out.z (unit length).
   * Returns false at the goal or where the field can't help (walk straight then).
   */
  direction(field, x, z, out) {
    const g = this.grid
    const { cols, rows, blocked, floor } = g
    const i = cellIndex(g, x, z)
    const here = field.cost[i]
    if (here === 0) return false
    const c = i % cols
    const r = (i - c) / cols
    let best = here === UNREACHED || blocked[i] ? UNREACHED : here
    let bestI = -1
    for (let k = 0; k < 8; k += 1) {
      const nb = NEIGHBOURS[k]
      const nc = c + nb[0]
      const nr = r + nb[1]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = nr * cols + nc
      if (blocked[ni] || !joined(floor, i, ni)) continue
      if (k >= 4 && (blocked[r * cols + nc] || blocked[nr * cols + c] || !joined(floor, i, r * cols + nc) || !joined(floor, i, nr * cols + c))) continue
      if (field.cost[ni] < best) {
        best = field.cost[ni]
        bestI = ni
      }
    }
    if (bestI < 0) return false
    const dx = cellX(g, bestI) - x
    const dz = cellZ(g, bestI) - z
    const len = Math.hypot(dx, dz) || 1
    out.x = dx / len
    out.z = dz / len
    return true
  }
}
