import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, mirrorTerrain, scatterTrees } from './mapKit.js'

/**
 * Rustline Yard - a working scrapyard turned battlefield. Each half is a yard behind
 * rusted sheet-metal walls: aisles of crushed cars stacked three and four high, scrap
 * heaps worked by magnet cranes, a car crusher by the main road, the rusting works shed
 * and a rail spur of scrap wagons, portacabin offices, tyre stacks and old fuel tanks.
 * Each army's camp sits behind hesco at its end of the yard.
 */

const RUST = '#8a5a3c'
const RUST_ROOF = '#6a4630'

const WEST = [
  // The works shed.
  box('warehouse', -46, -38, 20, 11, 6.5, 0, { color: RUST, roof: RUST_ROOF, door: '#5a4434' }),
  // Containers by the gate and in the middle aisle.
  box('container', -50, -10, 6.1, 2.5, 5.2, 0),
  box('container', -50, 10, 6.1, 2.5, 2.6, 3),
  box('container', -16, -14, 2.5, 6.1, 2.6, 0),
  // The camp.
  box('tent', -76, -24, 4.2, 3.6),
  box('tent', -76, 24, 4.2, 3.6),
  box('tent', -82, -14, 4.2, 3.6),
  box('tent', -82, 14, 4.2, 3.6),
  box('sandbag', -62, -8, 0.9, 6),
  box('sandbag', -62, 8, 0.9, 6),
  box('barrier', -66, 0, 0.7, 2.6),
  box('crate', -70, -6, 1.25, 1.25, 2.5),
  box('crate', -70, 6, 1.25, 1.25),
]

const WEST_PIECES = [
  ['sandwall', -64, -14, 1],
  ['sandwall', -64, -16.5, 1],
  ['sandwall', -64, -19, 1],
  ['sandwall', -64, 14, 1],
  ['sandwall', -64, 16.5, 1],
  ['sandwall', -64, 19, 1],
  ['tower', -66, -24],
  ['tower', -66, 24],
  ['floodlight', -70, -12],
  ['floodlight', -70, 12],
  ['radiomast', -84, -40],
  ['camonet', -78, 38],
  ['pipes', -26, -28],
  ['pipes', -8, 22],
  ['drum', -38, -26],
  ['drum', -38.9, -25.5],
  ['fuel', -20, -48],
  ['fuel', -20.9, -47.4],
  ['carwreck', -12, 4, 1],
  ['tanktrap', -6, -36],
  ['tanktrap', -6, 40],
  ['deadtree', -58, 52],
]

// Aisles of crushed-car stacks, three rows across the north yard.
const stacks = []
for (const [z, i0] of [[20, 0], [28, 1], [36, 2]]) {
  ;[-52, -47.5, -43, -33, -28.5].forEach((x, i) => stacks.push(['carstack', x, z, 0, { n: 2 + ((i + i0) % 3) }]))
}

const WEST_SETS = [
  // The yard's walls: rusted sheet panels, the gate on the main road.
  ['sheetwall', -33, 50, 0, { len: 54 }],
  ['sheetwall', -33, -52, 0, { len: 54 }],
  ['sheetwall', -60, 32, 1, { len: 36 }],
  ['sheetwall', -60, -33, 1, { len: 38 }],
  ...stacks,
  // Scrap heaps and the magnet cranes working them.
  ['scrapheap', -16, 32, 0, { r: 5 }],
  ['magnet', -28, 32, 0, { flip: true }],
  ['scrapheap', -24, -40, 0, { r: 4.5 }],
  ['magnet', -12, -40, 2, { flip: true }],
  // The crusher on the main road and its output.
  ['crusher', -32, -7, 0],
  ['carstack', -40, -7, 1, { n: 2 }],
  ['carstack', -24, -7, 1, { n: 3 }],
  // Rail spur with scrap wagons.
  ['rail', -41, -20, 0, { len: 80 }],
  ['railcar', -48, -20, 0, { color: '#6e4a34' }],
  ['railcar', -34, -20, 0, { seed: 0.1 }],
  // Site offices, tyres, tanks, lamps.
  ['cabin', -52, 5, 2, {}],
  ['cabin', -40, 6, 2, { color: '#8a5a3c' }],
  ['tyres', -36, 44, 0],
  ['tyres', -48, 44, 0],
  ['tyres', -10, -46, 0],
  ['tank', -54, -48, 0, { r: 2.4, h: 4, color: '#7a5a42' }],
  ['tank', -48, -48, 0, { r: 2, h: 3.4, color: '#8a6a4a' }],
  ['lamp', -44, -3, 0],
  ['lamp', -22, 3, 2],
  ['lamp', -56, 24, 1],
]

const CENTRE = [box('container', 0, -10, 2.5, 6.1, 5.2, 0), box('container', 0, 12, 2.5, 6.1, 2.6, 3)]
const CENTRE_SETS = [
  ['scrapheap', 0, -32, 0, { r: 5 }],
  ['scrapheap', 0, 32, 0, { r: 4 }],
  ['tyres', 3, 22, 0],
]

// --- The bigger yard (220 x 140) ---------------------------------------------------
// Each camp and its yard's west wall move 22 m back, the north and south walls 12 m
// out (the walls re-laid to meet at the corners). Inside the ground that opens up: a
// yard office and a canteen you can go inside, more car stacks and tyres, spoil heaps.
const fx = (x) => (x < -58 ? x - 22 : x)
const fz = (z) => (Math.abs(z) > 44 ? z + Math.sign(z) * 12 : z)
const mv = (o) => ({ ...o, x: fx(o.x), z: fz(o.z) })
const mvPiece = ([k, x, z, r]) => [k, fx(x), fz(z), r]
const mvSet = ([k, x, z, r, o]) => [k, fx(x), fz(z), r, o]
const WALLS = [
  ['sheetwall', -44, 62, 0, { len: 76 }],
  ['sheetwall', -44, -64, 0, { len: 76 }],
  ['sheetwall', -82, 38, 1, { len: 48 }],
  ['sheetwall', -82, -39, 1, { len: 50 }],
]

const NEW_WEST = [
  box('container', -74, 4, 6.1, 2.5, 2.6, 2),
  box('crate', -66, -10, 1.25, 1.25, 2.5),
  box('crate', -67.35, -10, 1.25, 1.25),
]
const NEW_PIECES = [
  ['drum', -76, -14],
  ['drum', -76.8, -13.4],
  ['carwreck', -64, 44, 1],
  ['tanktrap', -62, -48],
]
const NEW_SETS = [
  ['bldg', -70, 27, 0, { w: 12, d: 7, floors: 2, doors: [['e', 0], ['s', -3]], color: '#9a8c74', roof: '#6a5a46', floor: '#6f6455' }],
  ['bldg', -70, -27, 0, { w: 9, d: 7, doors: [['e', 0]], split: null, color: '#8f8270', roof: '#6a5a46', floor: '#6f6455' }],
  ...[-76, -71.5, -67].map((x, i) => ['carstack', x, 44, 0, { n: 2 + (i % 2) }]),
  ...[-76, -71.5].map((x, i) => ['carstack', x, -44, 0, { n: 3 - i }]),
  ['tyres', -62, 12, 0],
  ['tyres', -62, -14, 0],
]

const WEST_ALL = [...WEST.map(mv), ...NEW_WEST]
const WEST_PIECES_ALL = [...WEST_PIECES.map(mvPiece), ...NEW_PIECES]
const WEST_SETS_ALL = [...WEST_SETS.filter((st) => st[0] !== 'sheetwall').map(mvSet), ...WALLS, ...NEW_SETS]

const TERRAIN = mirrorTerrain({
  hills: [
    { x: -70, z: -54, r: 6, h: 1.8 },
    { x: -100, z: -56, r: 9, h: 2.4 },
    { x: -100, z: 56, r: 9, h: 2.2 },
    { x: -18, z: 54, r: 5, h: 1.4 },
  ],
  rough: 0.25,
})

const { obstacles, pieces } = mirrored(WEST_ALL, WEST_PIECES_ALL, CENTRE, [['carwreck', 3, 0, 1]])
const westRoads = [{ width: 3, points: [[-56, -72], [-56, -26], [-38, -26]] }]
const mirrorPad = (p) => ({ ...p, x: -p.x })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })
const WEST_PADS = [
  // Old cracked concrete under the works shed, the rail spur and the crusher.
  { x: -40, z: -32, w: 36, d: 30, color: '#7d7466', joints: 6 },
  { x: -34, z: -7, w: 22, d: 8, color: '#77705f', joints: 4 },
]
const WEST_LINES = [
  { points: [[-81, -20], [-1, -20]], width: 3.2, color: '#5e5446' },
  { points: [[-81, -20], [-1, -20]], width: 2.6, color: '#3e3024', dash: [0.25, 0.55] },
]

export const RUSTLINE_YARD = {
  id: 'rustyard',
  name: 'Rustline Yard',
  width: 220,
  depth: 140,
  terrain: TERRAIN,
  bases: [
    { x: -96, z: 0 },
    { x: 96, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS_ALL, ...WEST_SETS_ALL.map(mirrorSet), ...CENTRE_SETS],
  pads: [...WEST_PADS, ...WEST_PADS.map(mirrorPad)],
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  roads: [{ width: 3.6, points: [[-118, 0], [118, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad)],
  mud: [[-30, 28, 7], [-16, 32, 7], [-24, -40, 6], [-10, 8, 5]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(56, 81, 110, 70),
  hills: [150, 250],
  hillScale: 1.1,
  theme: {
    grassA: '#7a5f44',
    grassB: '#86694b',
    dry: '#706a4f',
    outside: '#5f5a41',
    mud: [88, 60, 40],
    road: [98, 86, 72],
    rut: [70, 56, 44],
    hillNear: '#6e5a44',
    hillFar: '#a3917c',
    tree: 'dead',
    trunk: '#4e3e30',
    fence: '#6b4a34',
    peak: '#ad9a84',
    scatter: 'scrap',
    clouds: 0.38,
    cloudColor: '#efdcc4',
    ao: [40, 24, 14],
    sun: '#ffd9a8',
    sunIntensity: 2.1,
    skyLight: '#f4e2c8',
    groundLight: '#7a5a3c',
    ambient: 1.2,
  },
  sky: { top: '#7a9cc2', horizon: '#e4c9a4', ground: '#86694b' },
  fog: '#d6bc9c',
}

export default RUSTLINE_YARD
