/**
 * Set pieces: the big, detailed scenery a map is built from - gantry cranes and cargo
 * ships, storage tanks, hangars and parked aircraft, a control tower, adobe houses and
 * market stalls - placed with `map.sets = [[kind, x, z, rot, opts]]` (rot: quarter
 * turns, 0-3). This file holds only what the simulation needs, each kind's collision
 * boxes in its own frame (x along its length); render/setPieceModels.js draws them in
 * the same frame. Plain data, no three.js, so the server runs it too.
 *
 * `water` maps also get basins (`map.water`: [{ x, z, w, d }]): flat boxes that stop
 * anyone walking in but not a bullet flying over.
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
  hangar: (o) => [B(0, 0, o.w || 30, o.d || 24, 11)],
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
  for (const r of map.water || []) out.push(waterBox(r))
  return out
}
