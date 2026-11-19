import { floorAt, ladderAt, levelFloorAt, slabAt } from './levels.js'
import { groundAt } from './terrain.js'

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
export function createNavGrid(map, obstacles, L = null) {
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
  let floor = null
  let ladder = null
  let vblock = null
  // Upper floors (two-storey buildings): a second layer of cells, NaN where there's none.
  let upper = null
  if (L) {
    floor = new Float32Array(cols * rows)
    ladder = new Uint8Array(cols * rows)
    vblock = new Uint8Array(cols * rows)
    if (L.slabs) upper = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -halfW + (c + 0.5) * CELL
        const z = -halfD + (r + 0.5) * CELL
        const i = r * cols + c
        // The ground layer: everything but upper floors.
        floor[i] = floorAt(L, x, z, -Infinity)
        ladder[i] = ladderAt(L, x, z)
        if (upper) upper[i] = slabAt(L, x, z)
        // Vehicles keep off raised floors and out of trenches.
        vblock[i] = levelFloorAt(L, x, z) > 0.05 || groundAt(L.terrain, x, z) < -0.5 ? 1 : 0
      }
    }
  }
  const grid = { cols, rows, halfW, halfD, cell: CELL, blocked, floor, ladder, vblock, upper, levels: L, links: null, links1: null, up: null, down: null }
  grid.links = linkMask(grid)
  if (upper) upperLinks(grid)
  return grid
}

/** Whether v isn't NaN. */
const has = (v) => v === v

/**
 * The upper layer's links: between upper-floor cells a step apart (links1), and between
 * the ground layer and the upper one where the top of a stair meets the floor beside it
 * (up: ground cell -> upper neighbour, down: the reverse), orthogonal steps only.
 */
function upperLinks(g) {
  const { cols, rows, blocked, floor, upper } = g
  const n = cols * rows
  g.links1 = new Uint8Array(n)
  g.up = new Uint8Array(n)
  g.down = new Uint8Array(n)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cur = r * cols + c
      if (blocked[cur]) continue
      const hasUp = has(upper[cur])
      let m1 = 0
      let mu = 0
      let md = 0
      for (let k = 0; k < 8; k += 1) {
        const nb = NEIGHBOURS[k]
        const nc = c + nb[0]
        const nr = r + nb[1]
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = nr * cols + nc
        if (blocked[ni]) continue
        const nUp = has(upper[ni])
        if (hasUp && nUp && Math.abs(upper[cur] - upper[ni]) <= STEP) {
          const ca = r * cols + nc
          const cb = nr * cols + c
          if (k < 4 || (!blocked[ca] && !blocked[cb] && has(upper[ca]) && has(upper[cb]))) m1 |= 1 << k
        }
        if (k >= 4) continue
        if (nUp && Math.abs(floor[cur] - upper[ni]) <= STEP) mu |= 1 << k
        if (hasUp && Math.abs(upper[cur] - floor[ni]) <= STEP) md |= 1 << k
      }
      g.links1[cur] = m1
      g.up[cur] = mu
      g.down[cur] = md
    }
  }
}

/**
 * Per cell, a bit for each of the 8 neighbours you can step to (NEIGHBOURS order): open,
 * on a floor a step away or up a ladder, no corner cut past a wall or a drop. Worked out
 * once so flow-field searches only test a bit.
 */
function linkMask(g) {
  const { cols, rows, blocked, floor, ladder } = g
  const links = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cur = r * cols + c
      if (blocked[cur]) continue
      let m = 0
      for (let k = 0; k < 8; k += 1) {
        const nb = NEIGHBOURS[k]
        const nc = c + nb[0]
        const nr = r + nb[1]
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = nr * cols + nc
        if (blocked[ni] || !(joined(floor, cur, ni) || climbs(ladder, cur, ni, k))) continue
        if (k >= 4) {
          const a = r * cols + nc
          const b = nr * cols + c
          if (blocked[a] || blocked[b] || !joined(floor, cur, a) || !joined(floor, cur, b)) continue
        }
        m |= 1 << k
      }
      links[cur] = m
    }
  }
  return links
}

/** The grid for ground vehicles: ramps and platforms blocked (null on a flat map). */
export function vehicleGrid(grid) {
  if (!grid.vblock) return null
  const blocked = grid.blocked.slice()
  for (let i = 0; i < blocked.length; i += 1) if (grid.vblock[i]) blocked[i] = 1
  const v = { ...grid, blocked, floor: null, ladder: null, vblock: null, upper: null, levels: null, links: null, links1: null, up: null, down: null }
  v.links = linkMask(v)
  return v
}

/** Whether cells a and b (neighbours) are on floors a step apart or less. */
const joined = (floor, a, b) => !floor || Math.abs(floor[a] - floor[b]) <= STEP

/**
 * Or joined by a ladder: neighbour k (0-1 along x, 2-3 along z, 4+ diagonal) along the
 * ladder of either cell.
 */
const climbs = (ladder, a, b, k) => ladder !== null && k < 4 && (ladder[a] === (k < 2 ? 1 : 2) || ladder[b] === (k < 2 ? 1 : 2))

export const cellIndex = (grid, x, z) => {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((x + grid.halfW) / grid.cell)))
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((z + grid.halfD) / grid.cell)))
  return r * grid.cols + c
}

const cellX = (grid, i) => -grid.halfW + ((i % grid.cols) + 0.5) * grid.cell
const cellZ = (grid, i) => -grid.halfD + (Math.floor(i / grid.cols) + 0.5) * grid.cell

/**
 * Nearest walkable cell to `start` (spiral search) on floor f (the goal's real floor: a
 * cell's centre can be off the roof whose edge it straddles), or -1.
 */
function nearestOpen(grid, start, f = 0, layer = 0) {
  const floor = layer ? grid.upper : grid.floor
  if (!grid.blocked[start] && (!floor || Math.abs(floor[start] - f) <= STEP)) return start
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

/** Which layer a point at height y over cell i is on: 1 on an upper floor, else 0. */
const layerOf = (g, i, y) => (g.upper !== null && y !== null && y !== undefined && has(g.upper[i]) && y > g.upper[i] - 1.2 ? 1 : 0)

export class FlowFields {
  constructor(grid, { maxFields = 28, budget = 1 } = {}) {
    this.grid = grid
    this.maxFields = maxFields
    this.budget = budget
    this.left = budget
    this.cache = new Map()
    // Nodes: one per cell, and a second per cell for the upper-floor layer.
    this.nodes = grid.cols * grid.rows * (grid.upper ? 2 : 1)
    this.heap = new Heap(this.nodes * 4)
    this.builds = 0
  }

  /** Call once per sim tick: refills the build budget. */
  tick() {
    this.left = this.budget
  }

  /** Goals within ~5 m share a field (y: the goal's height, for upstairs vs down). */
  keyFor(x, z, y) {
    const g = this.grid
    const c = Math.floor((x + g.halfW) / (g.cell * 4))
    const r = Math.floor((z + g.halfD) / (g.cell * 4))
    // Up on a platform (or down in a trench) is a different goal from the ground beside
    // it; over open hills it isn't. Upstairs is different again.
    let up = 0
    if (g.levels) {
      const lev = levelFloorAt(g.levels, x, z, -Infinity)
      up = lev > 0.05 ? Math.round(lev * 2) : groundAt(g.levels.terrain, x, z) < -0.5 ? -1 : 0
      if (layerOf(g, cellIndex(g, x, z), y)) up = 500
    }
    return up * 1e8 + r * 10000 + c
  }

  /** The field leading to (x, z) [at height y], or null if it isn't built yet and the budget is spent. */
  get(x, z, y = null) {
    const key = this.keyFor(x, z, y)
    const hit = this.cache.get(key)
    if (hit) {
      // Refresh recency.
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    if (this.left <= 0) return null
    this.left -= 1
    const field = this.build(x, z, y)
    if (this.cache.size >= this.maxFields) this.cache.delete(this.cache.keys().next().value)
    this.cache.set(key, field)
    return field
  }

  build(x, z, y = null) {
    const g = this.grid
    const n = g.cols * g.rows
    const cost = new Uint32Array(this.nodes).fill(UNREACHED)
    const start = cellIndex(g, x, z)
    const layer = layerOf(g, start, y)
    const goalCell = layer ? nearestOpen(g, start, g.upper[start], 1) : nearestOpen(g, start, g.levels ? floorAt(g.levels, x, z, -Infinity) : 0)
    this.builds += 1
    if (goalCell < 0) return { cost, goal: -1 }
    const goal = goalCell + layer * n
    const heap = this.heap
    heap.size = 0
    cost[goal] = 0
    heap.push(0, goal)
    const { cols, ladder, links, links1, up, down } = g
    while (heap.size > 0) {
      const node = heap.pop()
      const cc = cost[node]
      const upstairs = node >= n
      const cur = upstairs ? node - n : node
      // Same layer, then across (a stair's top and the floor beside it).
      for (let pass = 0; pass < 2; pass += 1) {
        let m
        if (pass === 0) m = upstairs ? links1[cur] : links[cur]
        else m = up ? (upstairs ? down[cur] : up[cur]) : 0
        if (!m) continue
        const base = (pass === 0) === upstairs ? n : 0
        for (let k = 0; k < 8; k += 1) {
          if (!(m & (1 << k))) continue
          const nb = NEIGHBOURS[k]
          const ni = cur + nb[1] * cols + nb[0]
          // Climbing is slow: a ladder cell costs three.
          const step = !upstairs && pass === 0 && ladder !== null && (ladder[ni] || ladder[cur]) ? nb[2] * 3 : nb[2]
          const nextCost = cc + step
          const nn = ni + base
          if (nextCost < cost[nn]) {
            cost[nn] = nextCost
            heap.push(nextCost, nn)
          }
        }
      }
    }
    return { cost, goal }
  }

  /**
   * Direction to walk from (x, z) along `field`, written to out.x / out.z (unit length).
   * Returns false at the goal or where the field can't help (walk straight then).
   * `fy`: the walker's own floor height: upstairs or down, and where a cell straddles a
   * roof's edge and its centre's floor isn't the one he's standing on, he heads for a
   * neighbour on his own floor instead.
   */
  direction(field, x, z, out, fy = null) {
    const g = this.grid
    const n = g.cols * g.rows
    const { cols, rows, blocked, floor, ladder } = g
    const i = cellIndex(g, x, z)
    if (layerOf(g, i, fy)) {
      const here = field.cost[n + i]
      if (here === 0) return false
      let best = here
      let bestI = -1
      for (let pass = 0; pass < 2; pass += 1) {
        const m = pass === 0 ? g.links1[i] : g.down[i]
        for (let k = 0; k < 8; k += 1) {
          if (!(m & (1 << k))) continue
          const nb = NEIGHBOURS[k]
          const ni = i + nb[1] * cols + nb[0]
          const cst = field.cost[ni + (pass === 0 ? n : 0)]
          if (cst < best) {
            best = cst
            bestI = ni
          }
        }
      }
      return aim(g, bestI, x, z, out)
    }
    const off = floor !== null && fy !== null && !ladder[i] && Math.abs(floor[i] - fy) > STEP
    const here = field.cost[i]
    if (here === 0 && !off) return false
    const c = i % cols
    const r = (i - c) / cols
    let best = off || here === UNREACHED || blocked[i] ? UNREACHED : here
    let bestI = -1
    for (let k = 0; k < 8; k += 1) {
      const nb = NEIGHBOURS[k]
      const nc = c + nb[0]
      const nr = r + nb[1]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = nr * cols + nc
      if (blocked[ni]) continue
      if (off ? Math.abs(floor[ni] - fy) > STEP && !ladder[ni] : !(joined(floor, i, ni) || climbs(ladder, i, ni, k))) continue
      if (k >= 4 && (blocked[r * cols + nc] || blocked[nr * cols + c] || !joined(floor, i, r * cols + nc) || !joined(floor, i, nr * cols + c))) continue
      if (field.cost[ni] < best) {
        best = field.cost[ni]
        bestI = ni
      }
    }
    // Off the top of a stair onto the floor above.
    if (!off && g.up) {
      const m = g.up[i]
      for (let k = 0; k < 4; k += 1) {
        if (!(m & (1 << k))) continue
        const nb = NEIGHBOURS[k]
        const ni = i + nb[1] * cols + nb[0]
        if (field.cost[n + ni] < best) {
          best = field.cost[n + ni]
          bestI = ni
        }
      }
    }
    return aim(g, bestI, x, z, out)
  }
}

/** Unit direction from (x, z) to cell i's centre into out; false if there's no cell. */
function aim(g, i, x, z, out) {
  if (i < 0) return false
  const dx = cellX(g, i) - x
  const dz = cellZ(g, i) - z
  const len = Math.hypot(dx, dz) || 1
  out.x = dx / len
  out.z = dz / len
  return true
}
