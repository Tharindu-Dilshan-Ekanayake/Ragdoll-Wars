import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorTerrain, scatterTrees } from './mapKit.js'

/**
 * Sunscar Village - a desert town round a market square. Flat-roofed adobe houses line
 * the main street, some two storeys, with walled yards and awnings; market stalls ring
 * the well in the square, a domed house and a water tower stand over it, and a palm
 * oasis pool lies on the north edge. Out in the dunes each army holds a fortified
 * outpost. Close streets, rooftops' shade, walls to fight over.
 */

const mirrorPad = (p) => ({ ...p, x: -p.x })

const WEST = [
  // Yard walls round the houses (mud brick).
  box('lowwall', -40, 15.5, 8, 0.5, 1.6, 0, { color: '#bfa077' }),
  box('lowwall', -44, 21, 0.5, 11, 1.6, 0, { color: '#bfa077' }),
  box('lowwall', -40, -15.5, 8, 0.5, 1.6, 0, { color: '#bfa077' }),
  box('lowwall', -44, -21, 0.5, 11, 1.6, 0, { color: '#bfa077' }),
  box('wall', -22, 34, 10, 0.6, 2.6, 0, { color: '#c4a57c' }),
  box('wall', -22, -34, 10, 0.6, 2.6, 0, { color: '#c4a57c' }),
  // A burnt-out pickup and a few crates in the street.
  box('crate', -12, -3, 1.25, 1.25),
  box('crate', -32, 3, 1.25, 1.25, 2.5),
  // The outpost out west.
  box('tent', -76, -14, 4.2, 3.6),
  box('tent', -76, 14, 4.2, 3.6),
  box('tent', -82, 0, 4.2, 3.6),
  box('sandbag', -62, -6, 0.9, 6),
  box('sandbag', -62, 6, 0.9, 6),
  box('container', -80, -26, 6.1, 2.5, 2.6, 3),
]

const WEST_PIECES = [
  ['sandwall', -65, -14, 1],
  ['sandwall', -65, -16.5, 1],
  ['sandwall', -65, 14, 1],
  ['sandwall', -65, 16.5, 1],
  ['tower', -66, -24],
  ['tower', -66, 24],
  ['floodlight', -70, -4],
  ['radiomast', -84, -40],
  ['carwreck', -26, 2, 0],
  ['dune', -52, -40, 1],
  ['dune', -54, 42],
  ['dune', -46, 0, 1],
  ['rock', -50, -26],
  ['rock', -50, 30],
  ['cactus', -56, -14],
  ['cactus', -40, 46],
  ['palm', -9, 46],
  ['palm', -6, 52],
  ['drum', -30, -12],
  ['fuel', -72, 22],
]

const WEST_SETS = [
  // North side of the main street (doors facing it: rot 2), south side (rot 0).
  ['house', -36, 9, 2, { w: 8, d: 7 }],
  ['house', -26, 10, 2, { w: 7, d: 8, floors: 2, awning: '#a8433a' }],
  ['house', -17, 9, 2, { w: 7, d: 7 }],
  ['house', -36, -9, 0, { w: 8, d: 7, floors: 2 }],
  ['house', -26, -10, 0, { w: 7, d: 8, awning: '#3f6f99' }],
  ['house', -17, -9, 0, { w: 7, d: 7, floors: 2 }],
  // Second row.
  ['house', -36, 26, 2, { w: 9, d: 8 }],
  ['house', -36, -26, 0, { w: 9, d: 8, floors: 2 }],
  ['house', -12, 26, 2, { w: 7, d: 7 }],
  ['house', -12, -26, 0, { w: 7, d: 7 }],
  // Market stalls along the square's west side.
  ['stall', -8, -5, 1, {}],
  ['stall', -8, 5, 1, {}],
  ['watertower', -24, 44, 0],
]

const CENTRE_SETS = [
  ['well', 0, 0, 0],
  ['stall', -3, -7, 0, {}],
  ['stall', 3, 7, 2, {}],
  ['domehouse', 0, 22, 2, {}],
  ['domehouse', 0, -22, 0, { dome: '#5f8fb8' }],
]

// --- The bigger town (220 x 140) ---------------------------------------------------
// Each outpost moves 25 m out into the dunes, the back rows of houses, the walls, the
// water tower and the oasis 12 m out from the street. On the town's edge, a police post
// and a shop you can go inside; dunes, a dry wadi and wind-rippled sand around.
const fx = (x) => (x < -55 ? x - 25 : x)
const fz = (z) => (Math.abs(z) > 22 ? z + Math.sign(z) * 12 : z)
const mv = (o) => ({ ...o, x: fx(o.x), z: fz(o.z) })
const mvPiece = ([k, x, z, r]) => [k, fx(x), fz(z), r]
const mvSet = ([k, x, z, r, o]) => [k, fx(x), fz(z), r, o]
const ADOBE = '#c9a57a'

const NEW_WEST = [
  box('lowwall', -60, -21, 0.5, 8, 1.4, 0, { color: '#bfa077' }),
  box('lowwall', -60, 22, 0.5, 8, 1.4, 0, { color: '#bfa077' }),
  box('crate', -70, -3, 1.25, 1.25),
  box('sandbag', -76, 0, 0.9, 5),
]
const NEW_PIECES = [
  ['carwreck', -54, -30, 1],
  ['drum', -72, 18],
  ['drum', -72.8, 18.6],
  ['cactus', -80, 34],
]
const NEW_SETS = [
  ['bldg', -66, 12, 0, { w: 10, d: 7, doors: [['s', -2], ['e', 0]], color: ADOBE, roof: '#b9966a', floor: '#a88c66' }],
  ['bldg', -66, -12, 0, { w: 9, d: 7, doors: [['n', 2]], split: null, color: '#c4a074', roof: '#b4916a', floor: '#a88c66' }],
]

const WEST_ALL = [...WEST.map(mv), ...NEW_WEST]
const WEST_PIECES_ALL = [...WEST_PIECES.map(mvPiece), ...NEW_PIECES]
const WEST_SETS_ALL = [...WEST_SETS.map(mvSet), ...NEW_SETS]

const TERRAIN = mirrorTerrain({
  hills: [
    { x: -50, z: -52, r: 12, h: 3 },
    { x: -46, z: 54, r: 10, h: 2.6 },
    { x: -92, z: -46, r: 11, h: 3.4 },
    { x: -94, z: 46, r: 9, h: 2.6 },
    { x: -30, z: 60, r: 7, h: 1.6 },
  ],
  // A dry wadi winding across the south.
  trenches: [{ points: [[-110, -38], [-88, -34], [-70, -40], [-56, -36]], w: 5, d: 0.9, ramp: 6 }],
  rough: 0.45,
})

const { obstacles, pieces } = mirrored(WEST_ALL, WEST_PIECES_ALL, [], [['palm', 0, 64], ['palm', 8, 60]])

export const SUNSCAR_VILLAGE = {
  id: 'desert',
  name: 'Sunscar Village',
  width: 220,
  depth: 140,
  terrain: TERRAIN,
  bases: [
    { x: -99, z: 0 },
    { x: 99, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS_ALL, ...WEST_SETS_ALL.map(mirrorSet), ...CENTRE_SETS],
  water: [{ x: 0, z: 58, w: 12, d: 6 }],
  pads: [
    // The square's flagstones and the street paving.
    { x: 0, z: 0, w: 20, d: 20, color: '#c7b291', joints: 2 },
    ...[{ x: -27, z: 0, w: 34, d: 6, color: '#cdb895', joints: 3 }].flatMap((p) => [p, mirrorPad(p)]),
  ],
  roads: [{ width: 2.6, points: [[-118, 0], [-44, 0]] }, { width: 2.6, points: [[44, 0], [118, 0]] }, { width: 2.4, points: [[0, -76], [0, -10]] }],
  mud: [[-30, 0, 6], [0, 58, 9], [-58, 0, 6], [-83, 0, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(46, 51, 110, 70),
  hills: [150, 250],
  hillScale: 1.2,
  theme: {
    grassA: '#cfae74',
    grassB: '#dbbd85',
    dry: '#c29b62',
    outside: '#c8a46a',
    mud: [120, 104, 70],
    road: [184, 160, 120],
    rut: [150, 124, 88],
    hillNear: '#c09060',
    hillFar: '#dcbf92',
    tree: 'palm',
    trunk: '#8a6a44',
    fence: '#8a6a48',
    peak: '#e9d2a2',
    scatter: 'desert',
    clouds: 0.12,
    ao: [104, 70, 36],
    sun: '#ffe2b8',
    sunIntensity: 2.4,
    skyLight: '#fff0d6',
    groundLight: '#a8844e',
    ambient: 1.15,
  },
  sky: { top: '#4f8fd2', horizon: '#f1dcb4', ground: '#cba46a' },
  fog: '#ecd8b2',
}

export default SUNSCAR_VILLAGE
