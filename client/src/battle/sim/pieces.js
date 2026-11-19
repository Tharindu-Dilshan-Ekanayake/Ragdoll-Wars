import { levelObstacles } from './levels.js'
import { buildObstacles } from './obstacles.js'
import { bldgLayout, rotLocal, setBoxes, setObstacles } from './setpieces.js'

/**
 * The build-mode catalogue and map scenery pieces, as plain data with no imports, so the
 * lobby (map previews) can use it without pulling the battle simulation into the
 * start-up bundle. structures.js builds on it.
 *
 * `boxes` are relative to the piece's centre with its long side along X; rotation 1
 * turns the piece a quarter turn.
 */

const b = (kind, x, z, w, d, h, extra = {}) => ({ kind, x, z, w, d, h, ...extra })

export const BUILD_TYPES = {
  trench: { name: 'Trench', role: 'Dig in', hp: 500, size: [6, 2.6], boxes: [b('mound', 0, -1.0, 6, 0.7, 0.6), b('mound', 0, 1.0, 6, 0.7, 0.6)] },
  sandbags: { name: 'Sandbags', role: 'Cover', hp: 170, size: [3, 0.9], boxes: [b('sandbag', 0, 0, 3, 0.9, 0.95)] },
  barrier: { name: 'Barrier', role: 'Concrete', hp: 280, size: [2.6, 0.7], boxes: [b('barrier', 0, 0, 2.6, 0.7, 1.05)] },
  blastwall: { name: 'Blast Wall', role: 'Tall cover', hp: 450, size: [3.6, 0.6], boxes: [b('wall', 0, 0, 3.6, 0.6, 2.6)] },
  sandwall: { name: 'Sand Wall', role: 'Gabions', hp: 320, size: [2.5, 1.25], boxes: [b('hesco', -0.62, 0, 1.24, 1.24, 1.4), b('hesco', 0.62, 0, 1.24, 1.24, 1.4)] },
  pipes: { name: 'Concrete Pipes', role: 'Cover', hp: 380, size: [2.6, 1.7], boxes: [b('pipes', 0, 0, 2.6, 1.7, 1.25)] },
  tanktrap: { name: 'Tank Trap', role: 'Stops vehicles', hp: 320, size: [1.3, 1.3], scatter: 2.6, boxes: [b('tanktrap', 0, 0, 1.2, 1.2, 1.1)] },
  // Gaps of 0.9 m: a soldier fits through, a vehicle doesn't.
  teeth: { name: "Dragon's Teeth", role: 'Stops vehicles', hp: 420, size: [5.4, 1], boxes: [b('tooth', -1.8, 0, 0.9, 0.9, 0.85), b('tooth', 0, 0, 0.9, 0.9, 0.85), b('tooth', 1.8, 0, 0.9, 0.9, 0.85)] },
  wire: { name: 'Barbed Wire', role: 'Slows troops', hp: 70, crush: true, size: [4, 1.3], wire: true, boxes: [] },
  cwall: { name: 'Concrete Wall', role: 'Building', hp: 520, size: [4, 0.4], boxes: [b('post', 0, 0, 4, 0.4, 3, { color: '#bfbab0' })] },
  bunker: { name: 'Bunker', role: 'Pillbox', hp: 950, size: [5, 4], boxes: [b('bunker', 0, 0, 5, 4, 2.2)] },
  tower: {
    name: 'Watchtower',
    role: 'Lookout',
    hp: 260,
    size: [2.6, 2.6],
    boxes: [b('post', -1.1, -1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', 1.1, -1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', -1.1, 1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', 1.1, 1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' })],
  },
  helipad: { name: 'Helipad', role: 'Air base', hp: Infinity, size: [8, 8], boxes: [] },
  container: { name: 'Container', role: 'Shipping', hp: 650, size: [6.1, 2.5], boxes: [b('container', 0, 0, 6.1, 2.5, 2.6, { tint: 0 })] },
  tent: { name: 'Tent', role: 'Camp', hp: 120, crush: true, size: [4.2, 3.6], boxes: [b('tent', 0, 0, 4.2, 3.6, 0.9)] },
  camonet: {
    name: 'Camo Net',
    role: 'Concealment',
    hp: 90,
    crush: true,
    size: [5, 4],
    boxes: [b('post', -2.3, -1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', 2.3, -1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', -2.3, 1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', 2.3, 1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' })],
  },
  floodlight: { name: 'Floodlight', role: 'Lighting', hp: 130, size: [0.6, 0.6], scatter: 6, boxes: [b('post', 0, 0, 0.2, 0.2, 5, { color: '#6b7076' })] },
  radiomast: { name: 'Radio Mast', role: 'Comms', hp: 220, size: [0.8, 0.8], scatter: 8, boxes: [b('post', 0, 0, 0.35, 0.35, 12, { color: '#8a8f94' })] },
  crate: { name: 'Supply Crate', role: 'Supplies', hp: 90, crush: true, size: [1.25, 1.25], scatter: 1.6, boxes: [b('crate', 0, 0, 1.25, 1.25, 1.25)] },
  ammocrate: { name: 'Ammo Crate', role: 'Explosive', hp: 60, crush: true, explosive: { radius: 3.2, damage: 100 }, size: [1.4, 0.9], scatter: 1.8, boxes: [b('ammo', 0, 0, 1.4, 0.9, 0.75)] },
  drum: { name: 'Oil Drum', role: 'Supplies', hp: 70, crush: true, size: [0.8, 0.8], scatter: 1.1, boxes: [b('drum', 0, 0, 0.8, 0.8, 1.1)] },
  fuel: { name: 'Fuel Barrel', role: 'Explosive', hp: 35, crush: true, explosive: { radius: 5, damage: 170 }, size: [0.8, 0.8], scatter: 1.4, boxes: [b('fuel', 0, 0, 0.8, 0.8, 1.1)] },
  hay: { name: 'Hay Bale', role: 'Farm', hp: 90, crush: true, size: [1.6, 1.2], scatter: 2, boxes: [b('hay', 0, 0, 1.6, 1.2, 1.2)] },
  fence: { name: 'Fence', role: 'Farm', hp: 55, crush: true, size: [4, 0.2], boxes: [b('fence', 0, 0, 4, 0.2, 1.1)] },
  tree: { name: 'Pine Tree', role: 'Nature', hp: 160, size: [0.7, 0.7], scatter: 3.5, boxes: [b('ptree', 0, 0, 0.7, 0.7, 6)] },
  bush: { name: 'Bush', role: 'Nature', hp: 45, crush: true, size: [1.4, 1.4], scatter: 1.8, boxes: [b('bush', 0, 0, 1.4, 1.4, 1.0)] },
  rock: { name: 'Rock', role: 'Nature', hp: 650, size: [1.8, 1.6], scatter: 2.4, boxes: [b('rock', 0, 0, 1.8, 1.6, 1.2)] },
  remove: { name: 'Remove', role: 'Take down', tool: true, hp: 0, size: [1, 1], boxes: [] },

  // Map scenery only (not in the build dock).
  carwreck: { name: 'Car Wreck', role: 'Scenery', hp: 500, size: [4.2, 1.9], boxes: [b('car', 0, 0, 4.2, 1.9, 1.4)] },
  rubble: { name: 'Rubble', role: 'Scenery', hp: 500, size: [2.8, 2.4], boxes: [b('rubble', 0, 0, 2.6, 2.2, 0.9)] },
  ruin: {
    name: 'Ruined House',
    role: 'Scenery',
    hp: 2000,
    size: [10, 8],
    // Four broken walls, a doorway front and back, a gap in one side.
    boxes: [
      b('wall', -3.4, -3.75, 3.2, 0.5, 3.2),
      b('wall', 3.4, -3.75, 3.2, 0.5, 2.6),
      b('wall', -3.4, 3.75, 3.2, 0.5, 2.4),
      b('wall', 3.4, 3.75, 3.2, 0.5, 3.0),
      b('wall', -4.75, 0, 0.5, 7, 3.1),
      b('wall', 4.75, -2, 0.5, 3, 2.8),
    ],
  },
  palm: { name: 'Palm', role: 'Scenery', hp: 160, size: [0.6, 0.6], boxes: [b('ptree', 0, 0, 0.6, 0.6, 6)] },
  deadtree: { name: 'Dead Tree', role: 'Scenery', hp: 160, size: [0.6, 0.6], boxes: [b('ptree', 0, 0, 0.6, 0.6, 5)] },
  cactus: { name: 'Cactus', role: 'Scenery', hp: 160, size: [0.7, 0.7], boxes: [b('ptree', 0, 0, 0.7, 0.7, 3)] },
  dune: { name: 'Dune', role: 'Scenery', hp: 2000, size: [7, 2.6], boxes: [b('mound', 0, 0, 6, 2, 0.9)] },
  snowpine: { name: 'Snowy Pine', role: 'Scenery', hp: 160, size: [0.7, 0.7], boxes: [b('ptree', 0, 0, 0.7, 0.7, 6)] },
}

const mapPieceCache = new WeakMap()

/**
 * A map's fixed scenery pieces (`map.pieces`: [key, x, z, rot]) as piece objects with
 * their boxes in world space - the same shape as built pieces, so the renderer and the
 * obstacle builder treat them alike. Cached per map.
 */
export function mapPieces(map) {
  if (!map.pieces) return []
  let out = mapPieceCache.get(map)
  if (!out) {
    out = map.pieces.map(([key, x, z, rot = 0], i) => ({ id: -1 - i, key, x, z, rot, seed: ((x * 13.1 + z * 7.7) % 1 + 1) % 1, boxes: pieceBoxes(key, x, z, rot) }))
    mapPieceCache.set(map, out)
  }
  return out
}

/** The map's own obstacles plus its scenery pieces', set pieces' and basins' boxes. */
function baseObstacles(map) {
  const out = map.obstacles.slice()
  for (const p of mapPieces(map)) for (const o of p.boxes) out.push(o)
  for (const o of setObstacles(map)) out.push(o)
  return out
}

/**
 * Everything solid on the map: baseObstacles plus the raised floors' boxes (levels.js).
 * A building with a climbable roof keeps its box, flagged as a level (troops stand on
 * top of it rather than bump into it) and a deck (no cover from it for those up there).
 */
export function mapObstacles(map) {
  const levels = mapLevels(map)
  const roofs = levels.filter((l) => l.roof)
  const out = baseObstacles(map).map((o) => (roofs.some((r) => isRoofOf(r, o)) ? { ...o, level: true, deck: true } : o))
  for (const o of levelObstacles(levels)) out.push(o)
  return out
}

const isRoofOf = (r, o) => Math.abs(r.x - o.x) < 0.05 && Math.abs(r.z - o.z) < 0.05 && Math.abs(r.w - o.w) < 0.05 && Math.abs(r.d - o.d) < 0.05 && Math.abs(r.h - o.h) < 0.05

// --- Roofs and ladders -------------------------------------------------------------

/** Flat-roofed set pieces troops can climb onto (and which of their boxes is the roof). */
const ROOF_SETS = {
  office: () => true,
  house: (o) => !o.floors || o.floors === 1,
  casemate: () => true,
  cabin: () => true,
  // A fort's corner towers (not its walls).
  fort: (o, box) => box.h >= 6.9,
}
/** How far a ladder stands out from the wall, and its width. */
const LADDER_DEPTH = 2.5
const LADDER_W = 1.3
/** Containers with a ladder, per half of the map. */
const CONTAINER_PERCHES = 3
/** Roofs higher than this get no ladder (towers, hangars). */
const MAX_ROOF = 8

const levelCache = new WeakMap()

/**
 * The map's raised floors: its own (`map.levels`) plus a roof on every flat-topped
 * building and container with room for a ladder, the ladder on the side facing its own
 * half's base where that's clear. Cached per map.
 */
export function mapLevels(map) {
  let out = levelCache.get(map)
  if (out) return out
  out = (map.levels || []).slice()
  // Two-storey buildings' upper floors and stairs, turned into place.
  for (const [kind, x, z, rot = 0, opts = {}] of map.sets || []) {
    if (kind !== 'bldg' || opts.floors !== 2) continue
    for (const l of bldgLayout(opts).levels) {
      const [rx, rz] = rotLocal(l.x, l.z, rot)
      const odd = rot & 1
      const lv = { ...l, x: x + rx, z: z + rz, w: odd ? l.d : l.w, d: odd ? l.w : l.d }
      if (l.ramp) {
        const [dx, dz] = rotLocal(l.ramp[1] === '+' ? 1 : -1, 0, rot)
        lv.ramp = dx ? `x${dx > 0 ? '+' : '-'}` : `z${dz > 0 ? '+' : '-'}`
      }
      out.push(lv)
    }
  }
  const base = baseObstacles(map)
  const roofs = []
  for (const [kind, x, z, rot, opts = {}] of map.sets || []) {
    const ok = ROOF_SETS[kind]
    if (!ok) continue
    for (const bx of setBoxes(kind, x, z, rot, opts)) if (ok(opts, bx)) roofs.push(bx)
  }
  // Containers: a few perches a side (stacks first, those nearer the base first), not a
  // ladder on every box in a container yard.
  for (const half of [-1, 1]) {
    const cans = map.obstacles.filter((o) => o.kind === 'container' && Math.sign(o.x || 1) === half)
    cans.sort((p, q) => q.h - p.h || Math.abs(q.x) - Math.abs(p.x) || p.z - q.z)
    let n = 0
    for (const o of cans) {
      if (n >= CONTAINER_PERCHES) break
      roofs.push(o)
      n += 1
    }
  }
  const obs = buildObstacles({ ...map, obstacles: base })
  for (const r of roofs) {
    if (r.h > MAX_ROOF || r.h < 2 || r.w < 2 || r.d < 2) continue
    const ladder = placeLadder(obs, r)
    if (!ladder) continue
    out.push({ roof: true, x: r.x, z: r.z, w: r.w, d: r.d, h: r.h }, ladder)
  }
  levelCache.set(map, out)
  return out
}

/** Whether the rectangle is clear of every box (touching edges allowed) and inside the fence. */
function clearRect(obs, x0, z0, x1, z1) {
  if (x0 < -obs.limitX || x1 > obs.limitX || z0 < -obs.limitZ || z1 > obs.limitZ) return false
  const d = obs.data
  for (let i = 0, o = 0; i < obs.count; i += 1, o += 5) {
    if (d[o + 4] < 0.25 && !obs.water[i]) continue
    if (d[o + 2] <= x0 || d[o] >= x1 || d[o + 3] <= z0 || d[o + 1] >= z1) continue
    return false
  }
  return true
}

/** A ladder up roof box r: on its side away from the front if clear, else another side. */
function placeLadder(obs, r) {
  const away = r.x <= 0 ? -1 : 1
  const sides = [
    ['x', away],
    ['z', 1],
    ['z', -1],
    ['x', -away],
  ]
  const apron = 1.2
  for (const [axis, s] of sides) {
    const along = axis === 'x' ? r.d : r.w
    if (along < LADDER_W + 0.4) continue
    const edge = axis === 'x' ? r.x + (s * r.w) / 2 : r.z + (s * r.d) / 2
    const mid = edge + (s * LADDER_DEPTH) / 2
    const far = edge + s * (LADDER_DEPTH + apron)
    const lo = Math.min(edge, far) + (s > 0 ? 0.02 : 0)
    const hi = Math.max(edge, far) - (s < 0 ? 0.02 : 0)
    const c = axis === 'x' ? r.z : r.x
    const ok = axis === 'x' ? clearRect(obs, lo, c - LADDER_W / 2 - 0.3, hi, c + LADDER_W / 2 + 0.3) : clearRect(obs, c - LADDER_W / 2 - 0.3, lo, c + LADDER_W / 2 + 0.3, hi)
    if (!ok) continue
    // It rises towards the wall.
    const ramp = `${axis}${s > 0 ? '-' : '+'}`
    return axis === 'x'
      ? { ramp, ladder: true, x: mid, z: c, w: LADDER_DEPTH, d: LADDER_W, h: r.h }
      : { ramp, ladder: true, x: c, z: mid, w: LADDER_W, d: LADDER_DEPTH, h: r.h }
  }
  return null
}

export const BUILD_GROUPS = [
  { label: 'Dig in', keys: ['trench'] },
  { label: 'Cover', keys: ['sandbags', 'barrier', 'blastwall', 'sandwall', 'pipes'] },
  { label: 'Obstacles', keys: ['tanktrap', 'teeth', 'wire'] },
  { label: 'Buildings', keys: ['cwall', 'bunker', 'tower'] },
  { label: 'Base', keys: ['helipad', 'container', 'tent', 'camonet', 'floodlight', 'radiomast'] },
  { label: 'Supplies', keys: ['crate', 'ammocrate', 'drum', 'fuel'] },
  { label: 'Farm', keys: ['hay', 'fence'] },
  { label: 'Nature', keys: ['tree', 'bush', 'rock'] },
  { label: 'Tools', keys: ['remove'] },
]

/** A piece's boxes in world space for centre (x, z) and rotation `rot` (0 or 1). */
export function pieceBoxes(key, x, z, rot, out = []) {
  const t = BUILD_TYPES[key]
  for (const o of t.boxes) {
    const rx = rot ? o.z : o.x
    const rz = rot ? -o.x : o.z
    out.push({ ...o, x: x + rx, z: z + rz, w: rot ? o.d : o.w, d: rot ? o.w : o.d })
  }
  return out
}

/** Where each of `count` pieces goes: in a line along the piece, or a small cluster. */
export function piecePositions(key, x, z, count, rot) {
  const t = BUILD_TYPES[key]
  const out = []
  if (t.scatter) {
    const cols = Math.ceil(Math.sqrt(count))
    for (let i = 0; i < count; i += 1) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const jitter = count > 1 ? (((i * 7919) % 97) / 97 - 0.5) * t.scatter * 0.4 : 0
      out.push({ x: x + (c - (cols - 1) / 2) * t.scatter + jitter, z: z + (r - (Math.ceil(count / cols) - 1) / 2) * t.scatter - jitter })
    }
    return out
  }
  const len = t.size[0] + 0.05
  for (let i = 0; i < count; i += 1) {
    const along = (i - (count - 1) / 2) * len
    out.push({ x: x + (rot ? 0 : along), z: z + (rot ? -along : 0) })
  }
  return out
}

