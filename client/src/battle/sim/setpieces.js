/**
 * Set pieces: the big, detailed scenery a map is built from - gantry cranes and cargo
 * ships, storage tanks, hangars and parked aircraft, a control tower, adobe houses and
 * market stalls - placed with `map.sets = [[kind, x, z, rot, opts]]` (rot: quarter
 * turns, 0-3). This file holds only what the simulation needs, each kind's collision
 * boxes in its own frame (x along its length); render/setPieceModels.js draws them in
 * the same frame. Plain data, no three.js, so the server runs it too.
 *
 * `water` maps also get basins (`map.water`: [{ x, z, w, d }]): flat boxes that stop
 * anyone walking in but not a bullet flying over (`bank: true` draws a river's natural
 * banks; `ford: true` is shallow water anyone can wade).
 */

const B = (x, z, w, d, h, extra) => ({ x, z, w, d, h, ...extra })

/** Enterable buildings ('bldg'): wall thickness, doorway and window sizes (m). */
export const BLDG = { t: 0.3, door: 2.2, doorH: 2.4, win: 1.3, sill: 1.0, winTop: 2.3, storey: 3.0, stairW: 2.0, stairRun: 7.0 }

/**
 * An enterable building's plan in its own frame (x along w, z along d), shared by the
 * collision (KINDS.bldg) and the looks (setPieceModels.js): wall runs, the openings in
 * them, a partition with its own doorway, and furniture.
 *   o.w, o.d, o.h      footprint and wall height (12 x 8, 3.2)
 *   o.doors            [[side, offset], ...] on 'n' (-z), 's' (+z), 'w' (-x), 'e' (+x),
 *                      offset along the side from its middle (default one in the front)
 *   o.split            partition across x at this offset from the middle (null: none;
 *                      default: one room a third of the way along when w >= 10)
 *   o.windows          false for none (default: every ~2.8 m clear of doors and corners)
 *   o.furnish          false for an empty shell
 *   o.floors           2 for an upstairs: walls twice the height, a stair up the inside
 *                      of the north wall (-z) to an upper floor with a stairwell, the
 *                      windows repeated above (they're one column of open wall in the
 *                      sim: shoot out of either floor). `levels` then lists the floor
 *                      and stair (levels.js) in the building's frame.
 * Returns { walls: [{x, z, w, d, h, sill?, door?}], openings: [{side, x, z, along, kind}],
 * furniture: [{x, z, w, d, h, kind}] } - walls include sill boxes under windows (sill:
 * true, low cover you fire over) and lintel-less doorway gaps.
 */
export function bldgLayout(o) {
  const w = o.w || 12
  const d = o.d || 8
  const two = o.floors === 2
  const storey = two ? BLDG.storey : o.h || 3.2
  const h = two ? storey * 2 : storey
  const { t, door, win, sill, stairW, stairRun } = BLDG
  // The stair strip along the inside of the north wall (two storeys).
  const stairX0 = -w / 2 + t + 0.2
  const stripZ1 = -d / 2 + t + stairW
  const doors = o.doors || [['s', 0]]
  const walls = []
  const openings = []
  const sides = [
    ['n', -d / 2 + t / 2, true, w],
    ['s', d / 2 - t / 2, true, w],
    ['w', -w / 2 + t / 2, false, d - 2 * t],
    ['e', w / 2 - t / 2, false, d - 2 * t],
  ]
  for (const [side, fixed, alongX, len] of sides) {
    const holes = doors.filter((dr) => dr[0] === side).map(([, off]) => ({ c: off, half: door / 2, kind: 'door' }))
    if (o.windows !== false) {
      const n = Math.floor((len - 1.6) / 2.8)
      for (let k = 0; k < n; k += 1) {
        const c = -((n - 1) * 2.8) / 2 + k * 2.8
        if (holes.some((hl) => Math.abs(hl.c - c) < hl.half + win / 2 + 0.5)) continue
        holes.push({ c, half: win / 2, kind: 'win' })
      }
    }
    holes.sort((a, b2) => a.c - b2.c)
    let from = -len / 2
    const run = (a0, a1, hh, extra) => {
      if (a1 - a0 < 0.05) return
      const mid = (a0 + a1) / 2
      walls.push(alongX ? B(mid, fixed, a1 - a0, t, hh, extra) : B(fixed, mid, t, a1 - a0, hh, extra))
    }
    for (const hl of holes) {
      run(from, hl.c - hl.half, h)
      if (hl.kind === 'win') run(hl.c - hl.half, hl.c + hl.half, sill, { sill: true })
      openings.push({ side, kind: hl.kind, x: alongX ? hl.c : fixed, z: alongX ? fixed : hl.c, along: hl.half * 2 })
      from = hl.c + hl.half
    }
    run(from, len / 2, h)
  }
  // A partition across the building with a doorway in it (stopping short of the stairs).
  const split = o.split !== undefined ? o.split : w >= 10 ? -w / 6 : null
  if (split !== null) {
    const lo = two ? stripZ1 : -d / 2 + t
    const hi = d / 2 - t
    const dz = o.splitDoor !== undefined ? o.splitDoor : (lo + hi) / 2
    if (dz - door / 2 - lo > 0.05) walls.push(B(split, (lo + dz - door / 2) / 2, t, dz - door / 2 - lo, h))
    if (hi - (dz + door / 2) > 0.05) walls.push(B(split, (dz + door / 2 + hi) / 2, t, hi - (dz + door / 2), h))
    openings.push({ side: 'in', kind: 'door', x: split, z: dz, along: door })
  }
  // Furniture: a table and shelves in the big room, crates in the small one (cover inside).
  const furniture = []
  if (o.furnish !== false) {
    const big = split === null ? 0 : (split + w / 2) / 2
    furniture.push({ kind: 'table', x: big, z: 0, w: 1.8, d: 0.9, h: 0.8 })
    furniture.push({ kind: 'shelf', x: big + Math.min(2.2, w * 0.15), z: -d / 2 + t + 0.3, w: 1.8, d: 0.5, h: 1.9 })
    if (split !== null) furniture.push({ kind: 'crate', x: (split - w / 2) / 2, z: d / 2 - t - 0.8, w: 1.1, d: 1.1, h: 1.1 })
  }
  // Upstairs: the floor (in two pieces round the stairwell) and the stair.
  const levels = []
  if (two) {
    const xi0 = -w / 2 + t
    const xi1 = w / 2 - t
    const zi1 = d / 2 - t
    levels.push({ slab: true, x: 0, z: (stripZ1 + zi1) / 2, w: xi1 - xi0, d: zi1 - stripZ1, h: storey })
    const land0 = stairX0 + stairRun
    levels.push({ slab: true, x: (land0 + xi1) / 2, z: (-d / 2 + t + stripZ1) / 2, w: xi1 - land0, d: stairW, h: storey })
    levels.push({ ramp: 'x+', stair: true, x: stairX0 + stairRun / 2, z: (-d / 2 + t + stripZ1) / 2, w: stairRun, d: stairW, h: storey })
  }
  return { walls, openings, furniture, levels, w, d, h, storey, two, stairX0, stripZ1 }
}

/** Collision boxes per kind, local frame. `o` = the set's options. */
const KINDS = {
  crane: () => [B(-6, -5, 1.2, 1.2, 26), B(6, -5, 1.2, 1.2, 26), B(-6, 5, 1.2, 1.2, 26), B(6, 5, 1.2, 1.2, 26)],
  ship: (o) => [B(0, 0, o.len || 56, 11, 7)],
  tug: () => [B(0, 0, 13, 4.6, 3)],
  tank: (o) => [B(0, 0, (o.r || 5.5) * 1.8, (o.r || 5.5) * 1.8, o.h || 10)],
  lighthouse: () => [B(0, 0, 3.4, 3.4, 18)],
  office: (o) => [B(0, 0, o.w || 14, o.d || 9, o.h || 7)],
  truck: () => [B(0, 0, 10, 2.6, 3.4)],
  railcar: () => [B(0, 0, 13, 3, 3.6)],
  hangar: (o) => [B(0, 0, o.w || 30, o.d || 24, o.h || 11)],
  ctower: () => [B(0, 0, 6, 6, 16)],
  plane: () => [B(0, 0, 32, 4.6, 5.5), B(1.5, 0, 5, 36, 4.0), B(-14.5, 0, 3, 12, 7.5)],
  fighter: () => [B(0, 0, 11, 9, 3.2)],
  radar: () => [B(0, 0, 3, 3, 12)],
  revetment: () => [B(0, -7, 16, 1.2, 3.2), B(-7.4, 0, 1.2, 14, 3.2), B(7.4, 0, 1.2, 14, 3.2)],
  windsock: () => [B(0, 0, 0.4, 0.4, 6)],
  house: (o) => [B(0, 0, o.w || 8, o.d || 8, (o.h || 3.6) * (o.floors || 1))],
  domehouse: (o) => [B(0, 0, o.w || 9, o.d || 9, 4.5)],
  stall: () => [B(0, 0.6, 3, 1.2, 0.95)],
  watertower: () => [B(-1.8, -1.8, 0.45, 0.45, 11), B(1.8, -1.8, 0.45, 0.45, 11), B(-1.8, 1.8, 0.45, 0.45, 11), B(1.8, 1.8, 0.45, 0.45, 11)],
  well: () => [B(0, 0, 2.2, 2.2, 0.9)],
  loaddock: (o) => [B(0, 0, o.w || 20, 4, 1.2)],
  pallets: () => [B(0, 0, 1.4, 1.2, 0.9)],
  // Chain-link: you can't walk through it but you can shoot through it.
  fence: (o) => [B(0, 0, o.len || 20, 0.2, 0.05)],
  lamp: () => [B(0, 0, 0.3, 0.3, 7.5)],
  rail: () => [],
  // Jungle.
  // A bridge's railings only: the deck is walked on (it spans a gap left between basins).
  bridge: (o) => [B(0, -(o.w || 6) / 2, o.len || 16, 0.25, 1.1), B(0, (o.w || 6) / 2, o.len || 16, 0.25, 1.1)],
  stilthut: (o) => [B(0, 0.8, (o.w || 6) + 0.4, (o.d || 5) + 2, 6.4)],
  palisade: (o) => [B(0, 0, o.len || 10, 0.7, 2.8)],
  ruins: () => [
    B(-4.5, -4.5, 1.2, 1.2, 4.2),
    B(4.5, -4.5, 1.2, 1.2, 2),
    B(-4.5, 4.5, 1.2, 1.2, 1.2),
    B(4.5, 4.5, 1.2, 1.2, 3.4),
    B(-1.5, -5.2, 3, 0.9, 2.6),
    B(1.5, -5.2, 3, 0.9, 1.8),
    B(-5.2, 0.5, 0.9, 5, 1.6),
    B(1.5, 1.5, 3, 1, 1),
  ],
  boat: () => [B(0, 0, 9, 3, 2.2)],
  // Scrapyard.
  sheetwall: (o) => [B(0, 0, o.len || 12, 0.3, 2.8)],
  scrapheap: (o) => [B(0, 0, (o.r || 4) * 1.6, (o.r || 4) * 1.6, (o.r || 4) * 0.8)],
  carstack: (o) => [B(0, 0, 4.2, 2, 0.72 * (o.n || 3))],
  crusher: () => [B(0, 0, 9, 3.6, 3.4)],
  magnet: () => [B(0, 0, 5, 3.6, 4.2)],
  cabin: () => [B(0, 0, 6.2, 2.6, 2.9)],
  tyres: () => [B(0, 0, 2.6, 2.6, 1.6)],
  // Army base.
  barracks: (o) => [B(0, 0, o.w || 16, o.d || 7, 5)],
  flagpole: () => [B(0, 0, 0.3, 0.3, 10)],
  climbwall: () => [B(0, 0, 4, 0.35, 3)],
  hurdle: () => [B(0, 0, 3, 0.3, 0.9)],
  range: (o) => [B(0, 0, o.len || 20, 3, 2.5)],
  shelter: (o) => {
    const w = o.w || 12
    const d = o.d || 6
    const out = []
    for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) out.push(B(x, z, 0.25, 0.25, 4))
    return out
  },
  // Desert fort: walls with a gate in each side, round towers at the corners.
  fort: (o) => {
    const L = (o.s || 26) / 2
    const g = 2
    const out = []
    const seg = (L - g) / 2 + g
    for (const s of [-1, 1]) {
      out.push(B(-seg, s * L, L - g, 1.2, 5), B(seg, s * L, L - g, 1.2, 5))
      out.push(B(s * L, -seg, 1.2, L - g, 5), B(s * L, seg, 1.2, L - g, 5))
    }
    for (const x of [-L, L]) for (const z of [-L, L]) out.push(B(x, z, 4.4, 4.4, 7))
    return out
  },
  bigtent: (o) => [B(0, 0, o.w || 9, o.d || 6, 2.6)],
  // Snow.
  logcabin: (o) => [B(0, 0, o.w || 8, o.d || 6, 5)],
  radome: () => [B(0, 0, 7, 7, 6.5)],
  snowcat: () => [B(0, 0, 5, 2.8, 2.8)],
  // Coast. A landing craft is walls round an open deck: walk in up the ramp (+x).
  casemate: () => [B(0, 0, 8, 6, 3)],
  landingcraft: () => [B(0, -2.1, 12, 0.4, 2), B(0, 2.1, 12, 0.4, 2), B(-5.8, 0, 0.4, 4.6, 3.2)],
  wire: (o) => [B(0, 0, o.len || 10, 0.6, 0.05)],
  // Town ruins: four broken walls (a doorway in the front, +z) you can get inside.
  ruinblock: (o) => {
    const w = o.w || 10
    const d = o.d || 8
    const h = o.h || 7
    const fw = w / 2 - 1.3
    return [
      B(0, -d / 2, w, 0.4, h),
      B(-w / 2, 0, 0.4, d, h * 0.8),
      B(w / 2, 0, 0.4, d, h * 0.5),
      B(-(fw / 2 + 1.3), d / 2, fw, 0.4, h * 0.7),
      B(fw / 2 + 1.3, d / 2, fw, 0.4, h * 0.4),
    ]
  },
  church: () => [B(0, -2, 10, 16, 7), B(0, 8, 4.4, 4.4, 14)],
  bus: () => [B(0, 0, 11, 2.6, 3)],
  // Warehouse interiors.
  shedwall: (o) => [B(0, 0, o.len || 20, 0.6, o.h || 8)],
  truss: () => [],
  rack: (o) => [B(0, 0, o.len || 12, 1.1, 4.6)],
  forklift: () => [B(0, 0, 2.7, 1.25, 2.2)],
  // Enterable: walls with doorways and windows, a partition, furniture (bldgLayout).
  bldg: (o) => {
    const L = bldgLayout(o)
    return [...L.walls, ...L.furniture.map((f) => B(f.x, f.z, f.w, f.d, f.h))]
  },
}

export const SET_KINDS = Object.keys(KINDS)

/** Rotates local (x, z) by `rot` quarter turns (same as a Y rotation of rot * 90°). */
export function rotLocal(x, z, rot) {
  switch (rot & 3) {
    case 1:
      return [z, -x]
    case 2:
      return [-x, -z]
    case 3:
      return [-z, x]
    default:
      return [x, z]
  }
}

/** A set's collision boxes in world space. */
export function setBoxes(kind, x, z, rot = 0, opts = {}) {
  const make = KINDS[kind]
  if (!make) return []
  return make(opts).map((b) => {
    const [rx, rz] = rotLocal(b.x, b.z, rot)
    const odd = rot & 1
    return { kind: 'set', set: kind, x: x + rx, z: z + rz, w: odd ? b.d : b.w, d: odd ? b.w : b.d, h: b.h }
  })
}

/** A water basin's collision box. */
export const waterBox = (r) => ({ kind: 'water', water: true, x: r.x, z: r.z, w: r.w, d: r.d, h: 0.03 })

/**
 * Mirrors a set across x = 0 (for symmetric maps), keeping its front (local +z) facing
 * the same way along z: rot 1 <-> 3, 0 and 2 stay. `flip: true` in opts turns it end
 * for end instead (rot 0 <-> 2), for things whose length should point the other way.
 */
export const mirrorSet = ([kind, x, z, rot = 0, opts]) => [kind, -x, z, opts?.flip ? (rot + 2) & 3 : rot & 1 ? (rot + 2) & 3 : rot, opts]

/** Every set's and basin's boxes for `map`. */
export function setObstacles(map) {
  const out = []
  for (const [kind, x, z, rot, opts] of map.sets || []) for (const b of setBoxes(kind, x, z, rot, opts)) out.push(b)
  // A ford is shallow: drawn as water but walked through.
  for (const r of map.water || []) if (!r.ford) out.push(waterBox(r))
  return out
}
