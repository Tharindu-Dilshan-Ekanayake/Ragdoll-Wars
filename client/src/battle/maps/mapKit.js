/**
 * Helpers for writing battlefields. Every map is mirrored across x = 0 so neither team
 * has an edge: write the west (blue) half, then mirror it.
 *
 * - `box(kind, x, z, w, d, h?)`: a cover box drawn by the cover renderer (sandbag,
 *   barrier, lowwall, wall, crate, container, shed, warehouse, tent, post, board,
 *   tree). Sheds and warehouses take `{ color, roof }` in `extra`.
 * - pieces `[key, x, z, rot]`: scenery made of build-mode pieces (rock, bunker, ruin,
 *   palm, dune, car wreck, ...), fixed in place.
 */

const KIND_HEIGHT = {
  sandbag: 0.95,
  barrier: 1.05,
  lowwall: 1.1,
  crate: 1.25,
  wall: 2.7,
  container: 2.6,
  shed: 3.4,
  warehouse: 7,
  tent: 0.9,
  tree: 6,
}

export const box = (kind, x, z, w, d, h = KIND_HEIGHT[kind], tint = 0, extra = {}) => ({ kind, x, z, w, d, h, tint, ...extra })

export const mirrorBox = (o) => ({ ...o, x: -o.x })
export const mirrorPiece = ([key, x, z, rot = 0]) => [key, -x, z, rot]

/** A west half plus its mirror image (boxes and pieces). */
export function mirrored(westBoxes, westPieces, centreBoxes = [], centrePieces = []) {
  return {
    obstacles: [...westBoxes, ...westBoxes.map(mirrorBox), ...centreBoxes],
    pieces: [...westPieces, ...westPieces.map(mirrorPiece), ...centrePieces],
  }
}

/** Mirrors road polylines and patches too. */
export const mirrorRoad = (r) => ({ ...r, points: r.points.map(([x, z]) => [-x, z]) })
export const mirrorPatch = ([x, z, r]) => [-x, z, r]

/** Scenery trees in a ring outside the fence (kept clear of a band just outside it). */
export function scatterTrees(count, seed, hx, hz, skip = () => false) {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const out = []
  let guard = 0
  while (out.length < count && guard < count * 20) {
    guard += 1
    const x = (rand() * 2 - 1) * (hx + 60)
    const z = (rand() * 2 - 1) * (hz + 50)
    if (Math.abs(x) < hx + 7 && Math.abs(z) < hz + 7) continue
    if (skip(x, z)) continue
    out.push({ x, z, s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2 })
  }
  return out
}

/**
 * Growing a map: moves everything past a line further out, as whole groups, so a
 * layout keeps its shape and opens up new ground in between. `x < -ax` moves `dx` further
 * west (write the west half), `|z| > az` moves `dz` further from the middle.
 * Returns movers for points, boxes, pieces, sets, pads, polylines and hills.
 */
export function grow({ ax = Infinity, dx = 0, az = Infinity, dz = 0 }) {
  const fx = (x) => (x < -ax ? x - dx : x)
  const fz = (z) => (Math.abs(z) > az ? z + Math.sign(z) * dz : z)
  const pt = ([x, z]) => [fx(x), fz(z)]
  return {
    fx,
    fz,
    pt,
    box: (o) => ({ ...o, x: fx(o.x), z: fz(o.z) }),
    piece: ([k, x, z, r]) => [k, fx(x), fz(z), r],
    set: ([k, x, z, r, o]) => [k, fx(x), fz(z), r, o],
    pad: (p) => ({ ...p, x: fx(p.x), z: fz(p.z) }),
    line: (l) => ({ ...l, points: l.points.map(pt) }),
    hill: (h) => ({ ...h, x: fx(h.x), z: fz(h.z) }),
  }
}

/** Mirrors map.terrain features (west half) to both halves. */
export function mirrorTerrain({ hills = [], ridges = [], trenches = [], rough = 0 }) {
  const mp = (pts) => pts.map(([x, z]) => [-x, z])
  return {
    hills: [...hills, ...hills.map((h) => ({ ...h, x: -h.x }))],
    ridges: [...ridges, ...ridges.map((r) => ({ ...r, points: mp(r.points) }))],
    trenches: [...trenches, ...trenches.map((t) => ({ ...t, points: mp(t.points) }))],
    rough,
  }
}
