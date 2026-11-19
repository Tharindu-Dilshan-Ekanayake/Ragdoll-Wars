import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch } from './mapKit.js'

/**
 * Training Grounds - Floppy Front's first battlefield: an army training base.
 *
 * Each side's camp has barracks blocks round a concrete parade ground and its flag, the
 * HQ, Nissen huts, a motor pool of lorries under a shelter, a water tower and fuel. Out
 * in the muddy yard are the assault course (climbing walls, hurdles, tyres), the rifle
 * range with its earth berm and targets, sandbag nests, barrier lines and containers.
 * The middle is the killhouse: two buildings you go inside, rooms and windows to fight
 * through.
 *
 * Every obstacle is an axis-aligned box `{ x, z, w, d, h, kind, tint }` (centre, size
 * along x and z, height). `kind` picks how it looks and how it counts as cover:
 * anything under 1.4 m is low cover you can shoot over by standing up.
 */

const WEST = [
  // Forward emplacement: a sandbag U opening towards home.
  box('sandbag', -58, 0, 0.9, 12),
  box('sandbag', -60.5, -6.45, 5.9, 0.9),
  box('sandbag', -60.5, 6.45, 5.9, 0.9),
  // Flank nests.
  box('sandbag', -54, -30, 0.9, 6),
  box('sandbag', -55.9, -33.45, 4.7, 0.9),
  box('sandbag', -54, 30, 0.9, 6),
  box('sandbag', -55.9, 33.45, 4.7, 0.9),
  // Broken barrier line.
  box('barrier', -43, -37, 0.7, 9),
  box('barrier', -43, -15, 0.7, 9),
  box('barrier', -43, 15, 0.7, 9),
  box('barrier', -43, 32, 0.7, 7),
  // Shipping containers.
  box('container', -33, -22, 2.5, 6.1, 2.6, 0),
  box('container', -33, 23, 6.1, 2.5, 2.6, 1),
  // Crates.
  box('crate', -25.2, -7.4, 1.25, 1.25),
  box('crate', -23.8, -7.4, 1.25, 1.25),
  box('crate', -24.5, -6.0, 1.25, 1.25),
  box('crate', -25, 9, 1.25, 1.25, 2.5),
  box('crate', -23.7, 9, 1.25, 1.25),
  box('crate', -47, 2.5, 1.25, 1.25),
  box('crate', -47, -24, 1.25, 1.25),
  // Midfield low walls.
  box('lowwall', -18, -33, 6, 0.6),
  box('lowwall', -18, 33, 6, 0.6),
  box('lowwall', -30, -48, 0.6, 5),
  box('sandbag', -16, -18, 4.5, 0.9),
  box('sandbag', -16, 18, 4.5, 0.9),
]

const WEST_PIECES = [
  ['floodlight', -66, -10],
  ['floodlight', -66, 10],
  ['ammocrate', -64, 36],
  ['fuel', -80, 38],
  ['fuel', -80.9, 38.6],
  ['drum', -78.8, 38.4],
]

const WEST_SETS = [
  // The camp: barracks either side of the parade ground, the HQ behind it.
  ['barracks', -74, -28, 0, { w: 16, d: 7 }],
  ['barracks', -74, 28, 2, { w: 16, d: 7, color: '#bdb496' }],
  ['office', -82, 0, 1, { w: 12, d: 6, floors: 1, h: 3.8, color: '#c9c0a4' }],
  ['flagpole', -79, -11, 0, { color: '#3f6fb0' }],
  ['hangar', -60, -44, 0, { w: 7, d: 12, h: 3.6, small: true, color: '#6f7a5a' }],
  ['hangar', -51, -44, 0, { w: 7, d: 12, h: 3.6, small: true, color: '#77805f' }],
  ['watertower', -76, -44, 0],
  // Motor pool.
  ['shelter', -62, 44, 0, { w: 14, d: 7 }],
  ['truck', -62, 42.3, 0, { color: '#5d6b4a' }],
  ['truck', -62, 45.7, 2, { color: '#4f5c40' }],
  ['tank', -82, 44, 0, { r: 2, h: 3.5, color: '#6f7a5a' }],
  // Assault course.
  ['climbwall', -38, -41, 0],
  ['climbwall', -30, -41, 0],
  ['hurdle', -38, -35, 0],
  ['hurdle', -34, -35, 0],
  ['hurdle', -30, -35, 0],
  ['tyres', -24, -42, 0],
  // Rifle range: firing point shelter facing the berm.
  ['range', -30, 50, 2, { len: 18 }],
  ['shelter', -30, 39, 0, { w: 10, d: 4, color: '#5d6650' }],
  ['lamp', -50, -3.5, 0],
  ['lamp', -26, 3.5, 2],
]

/** In the middle: a pair of crates in the yard between the two killhouse buildings. */
const CENTRE = [box('crate', -2.5, 0, 1.25, 1.25), box('crate', 2.5, 0, 1.25, 1.25)]

/**
 * The killhouse: two enterable buildings either side of the crossroads (rooms, doorways,
 * windows to fire from), facing each other across a yard.
 */
// A door into each room from the yard; the end walls keep their windows to fire from.
const KILLHOUSE = { w: 14, d: 7, split: 0, floors: 2, doors: [['s', -4], ['s', 4]], color: '#cdc4ae' }
const CENTRE_SETS = [
  ['bldg', 0, -7.5, 0, KILLHOUSE],
  ['bldg', 0, 7.5, 2, { ...KILLHOUSE, color: '#c4bba4' }],
]

// --- The bigger field (220 x 140) ---------------------------------------------------
// The camp moves 25 m back and the far ends 12 m out; the forward area this opens up
// gets its own buildings, nests, lorries and knolls.
const SHIFT_X = 25
const SHIFT_Z = 12
const fx = (x) => (x < -40 ? x - SHIFT_X : x)
const fz = (z) => (Math.abs(z) > 26 ? z + Math.sign(z) * SHIFT_Z : z)
const movePt = ([x, z]) => [fx(x), fz(z)]
const moveBox = (o) => ({ ...o, x: fx(o.x), z: fz(o.z) })
const movePiece = ([k, x, z, r]) => [k, fx(x), fz(z), r]
const moveSet = ([k, x, z, r, o]) => [k, fx(x), fz(z), r, o]

/** The forward area: an armoury and a guard post you can go inside, nests and lorries. */
const FORWARD = [
  box('sandbag', -46, -30, 0.9, 5),
  box('sandbag', -47.9, -32.95, 4.7, 0.9),
  box('sandbag', -46, 30, 0.9, 5),
  box('sandbag', -47.9, 32.95, 4.7, 0.9),
  box('crate', -60, -6.5, 1.25, 1.25, 2.5),
  box('crate', -61.35, -6.5, 1.25, 1.25),
  box('crate', -60.6, 23.5, 1.25, 1.25),
  box('barrier', -44, -2, 0.7, 2.6),
  box('barrier', -44, 2, 0.7, 2.6),
  box('lowwall', -50, -44, 6, 0.6),
  box('lowwall', -50, 44, 6, 0.6),
]
const FORWARD_PIECES = [
  ['drum', -64, -21],
  ['drum', -64.8, -20.4],
  ['ammocrate', -64, 21],
  ['fuel', -70, 27],
  ['floodlight', -48, -12],
  ['floodlight', -48, 12],
]
const FORWARD_SETS = [
  ['bldg', -56, -14, 0, { w: 10, d: 7, doors: [['w', 0]], split: null, color: '#c9c0a4' }],
  ['bldg', -56, 15, 0, { w: 8, d: 6, doors: [['w', 1.2]], split: null, color: '#bfb59a' }],
  ['truck', -63, 33, 1, { color: '#5d6b4a' }],
  ['truck', -67, 33, 1, { color: '#4f5c40' }],
]

const WEST_ALL = [...WEST.map(moveBox), ...FORWARD]
const WEST_PIECES_ALL = [...WEST_PIECES.map(movePiece), ...FORWARD_PIECES]
const WEST_SETS_ALL = [...WEST_SETS.map(moveSet), ...FORWARD_SETS]

const { obstacles, pieces } = mirrored(WEST_ALL, WEST_PIECES_ALL, CENTRE, [])
// Terrain (sim/terrain.js): a firing trench across each side's half (broken for the
// road), grassy knolls, a low bank by the north fence and a gently rolling field.
const WEST_HILLS = [
  { x: -36, z: -30, r: 13, h: 3.2 },
  { x: -24, z: 40, r: 10, h: 2.6 },
  { x: -46, z: 22, r: 8, h: 1.8 },
  { x: -7, z: -28, r: 7, h: 1.6 },
]
const WEST_TRENCHES = [
  { points: [[-24, -24], [-22, -14], [-24, -5]], w: 2.8, d: 1.4, ramp: 4 },
  { points: [[-24, 5], [-22, 14], [-24, 24]], w: 2.8, d: 1.4, ramp: 4 },
]
const WEST_RIDGES = [{ points: [[-44, -52], [-34, -51]], w: 6, h: 1.2 }]
const mirrorPts = (pts) => pts.map(([x, z]) => [-x, z])
const WEST_HILLS_ALL = [
  ...WEST_HILLS.map((h) => ({ ...h, x: fx(h.x), z: fz(h.z) })),
  // Knolls out on the wings of the forward area, and a long rise behind the trenches.
  { x: -40, z: -54, r: 9, h: 2.4 },
  { x: -42, z: 56, r: 9, h: 2.2 },
  { x: -86, z: -30, r: 10, h: 2.6 },
]
const WEST_TRENCHES_ALL = WEST_TRENCHES.map((t) => ({ ...t, points: t.points.map(movePt) }))
const WEST_RIDGES_ALL = [...WEST_RIDGES.map((r) => ({ ...r, points: r.points.map(movePt) })), { points: [[-34, -20], [-33, 0], [-34, 20]], w: 7, h: 0.9 }]
const TERRAIN = {
  hills: [...WEST_HILLS_ALL, ...WEST_HILLS_ALL.map((h) => ({ ...h, x: -h.x }))],
  trenches: [...WEST_TRENCHES_ALL, ...WEST_TRENCHES_ALL.map((t) => ({ ...t, points: mirrorPts(t.points) }))],
  ridges: [...WEST_RIDGES_ALL, ...WEST_RIDGES_ALL.map((r) => ({ ...r, points: mirrorPts(r.points) }))],
  rough: 0.35,
}

const mirrorPad = (p) => ({ ...p, x: -p.x })
const movePad = (p) => ({ ...p, x: fx(p.x), z: fz(p.z) })
const moveLine = (l) => ({ ...l, points: l.points.map(movePt) })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })

const WEST_PADS = [
  // Parade ground, motor pool and firing point hardstanding.
  { x: -71, z: 0, w: 16, d: 40, color: '#a19d93', joints: 4 },
  { x: -62, z: 44, w: 16, d: 9, color: '#8d8a82', joints: 4 },
  { x: -30, z: 39, w: 12, d: 6, color: '#8d8a82' },
]
const WEST_LINES = [
  // The parade ground's painted rectangle and marker lines.
  { points: [[-78, -18], [-64, -18], [-64, 18], [-78, 18], [-78, -18]], width: 0.25, color: 'rgba(240,238,228,0.85)' },
  ...[-8, 0, 8].map((z) => ({ points: [[-76, z], [-66, z]], width: 0.2, color: 'rgba(240,238,228,0.75)', dash: [1, 1] })),
  // Firing lanes down the range.
  ...[-36, -30, -24].map((x) => ({ points: [[x, 42], [x, 48]], width: 0.2, color: 'rgba(240,238,228,0.6)' })),
]

/** Trees outside the fence: scenery only, never collide. Deterministic. */
function scatterTrees(count, seed = 7) {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const out = []
  while (out.length < count) {
    const x = (rand() * 2 - 1) * 160
    const z = (rand() * 2 - 1) * 112
    // Keep a clear band just outside the fence.
    if (Math.abs(x) < 118 && Math.abs(z) < 77) continue
    out.push({ x, z, s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2 })
  }
  return out
}

export const TRAINING_GROUNDS = {
  id: 'training',
  name: 'Training Grounds',
  blurb: 'An army training base: barracks round a parade ground, an assault course, a rifle range and a two-building killhouse to fight through in the middle.',
  /** Playable area (the fence). */
  width: 220,
  depth: 140,
  terrain: TERRAIN,
  /** Where each team's units tend to form up. */
  bases: [
    { x: -95, z: 0 },
    { x: 95, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS_ALL, ...WEST_SETS_ALL.map(mirrorSet), ...CENTRE_SETS],
  pads: [...WEST_PADS.map(movePad), ...WEST_PADS.map(movePad).map(mirrorPad), { x: 0, z: 0, w: 24, d: 24, color: '#9a968c', joints: 3 }],
  lines: [...WEST_LINES.map(moveLine), ...WEST_LINES.map(moveLine).map(mirrorLine)],
  /** Dirt roads painted on the ground: polylines of [x, z], with a half width. */
  roads: [
    { width: 3.2, points: [[-118, 0], [-12, 0], [12, 0], [118, 0]] },
    { width: 2.6, points: [[0, -76], [0, -12], [0, 12], [0, 76]] },
    { width: 2.2, points: [[-56, -6], [-56, -30], [-50, -38]].map(movePt) },
    { width: 2.2, points: [[56, 6], [56, 30], [50, 38]].map(([x, z]) => [-fx(-x), fz(z)]) },
    // Tracks out to the forward buildings.
    { width: 1.8, points: [[-81, -14], [-61, -14]] },
    { width: 1.8, points: [[81, -14], [61, -14]] },
  ],
  /** Muddy patches: [x, z, radius]. */
  mud: [[-34, -38, 8], [-30, -30, 7], [-22, 26, 6], [-46, 0, 6]].map(([x, z, r]) => [fx(x), fz(z), r]).concat([[-52, 0, 5], [-40, 38, 6]]).flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(100),
  sky: { top: '#5b9bd8', horizon: '#cfe3ee', ground: '#8a9a6a' },
  fog: '#c9d9df',
}

export default TRAINING_GROUNDS
