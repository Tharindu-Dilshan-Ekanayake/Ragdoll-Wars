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
