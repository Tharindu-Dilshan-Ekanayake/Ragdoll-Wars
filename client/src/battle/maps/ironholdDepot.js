import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, mirrorTerrain, scatterTrees } from './mapKit.js'

/**
 * Ironhold Depot - an army supply depot laid out like the real thing. Each side holds a
 * walled compound behind a hesco wall: two steel warehouses on concrete hardstanding with
 * loading docks and trucks backed up to them, an ordered container yard, a rail spur with
 * its wagons along the north fence, the depot office and car park, barracks, a fuel point
 * and a helipad. The middle is a checkpoint of barriers and blast walls round a container.
 */

const WEST = [
  // The warehouses (their loading docks are set pieces below).
  box('warehouse', -54, -34, 26, 12, 7, 0, { color: '#8d949a', roof: '#646b71' }),
  box('warehouse', -54, 34, 26, 12, 7, 0, { color: '#97907f', roof: '#6b665c' }),
  // The container yard: two ordered blocks, stacked one to three high.
  ...[-31, -23].flatMap((x, i) => [
    box('container', x, 9, 6.1, 2.5, 2.6, i),
    box('container', x, 11.6, 6.1, 2.5, 5.2, i + 2),
    box('container', x, 14.2, 6.1, 2.5, 2.6, i + 4),
    box('container', x, -9, 6.1, 2.5, 5.2, i + 1),
    box('container', x, -11.6, 6.1, 2.5, 2.6, i + 3),
    box('container', x, -14.2, 6.1, 2.5, 5.2, i + 5),
  ]),
  // The compound gate.
  box('barrier', -66, -4, 0.7, 2.6),
  box('barrier', -66, 4, 0.7, 2.6),
  box('sandbag', -61, -8, 3, 0.9),
  box('sandbag', -61, 8, 3, 0.9),
  // Barracks behind the wall.
  box('shed', -80, -20, 7, 4.5, 3.4, 0, { color: '#7b8270', roof: '#4f5548' }),
  box('shed', -80, 20, 7, 4.5, 3.4, 0, { color: '#7b8270', roof: '#4f5548' }),
  box('tent', -76, -40, 4.2, 3.6),
  box('tent', -76, 40, 4.2, 3.6),
  // Road blocks on the main road and cover in the yard.
  box('barrier', -40, -4, 2.6, 0.7),
  box('barrier', -40, 4, 2.6, 0.7),
  box('sandbag', -14, -30, 0.9, 6),
  box('sandbag', -14, 30, 0.9, 6),
]

const WEST_PIECES = [
  // Hesco wall down the compound's front, a gate in the middle.
  ['sandwall', -67, -12, 1],
  ['sandwall', -67, -14.5, 1],
  ['sandwall', -67, -17, 1],
  ['sandwall', -67, -19.5, 1],
  ['sandwall', -67, 12, 1],
  ['sandwall', -67, 14.5, 1],
  ['sandwall', -67, 17, 1],
  ['sandwall', -67, 19.5, 1],
  ['tower', -68, -24],
  ['tower', -68, 24],
  ['floodlight', -72, -8],
  ['floodlight', -72, 8],
  ['radiomast', -84, -34],
  ['camonet', -62, -48],
  ['fuel', -38, -50],
  ['fuel', -38.9, -49.4],
  ['drum', -40, -50.5],
  ['ammocrate', -64, -4],
  ['ammocrate', -64, 4, 1],
  ['pipes', -16, 44],
  ['blastwall', -8, -8, 1],
  ['blastwall', -8, 8, 1],
]

const WEST_SETS = [
  // Loading docks along the warehouse fronts, trucks backed up to them.
  ['loaddock', -54, -26, 0, { w: 22 }],
  ['loaddock', -54, 26, 2, { w: 22 }],
  ['truck', -58, -18.8, 1, { color: '#3f6b9a' }],
  ['truck', -48, 18.8, 3],
  ['pallets', -46, -22.6, 0],
  ['pallets', -44.4, -22.6, 0],
  ['pallets', -62, 22.6, 0],
  // The rail spur along the north fence with its wagons.
  ['rail', -55, 47.5, 0, { len: 110 }],
  ['railcar', -60, 47.5, 0, { seed: 0.2 }],
  ['railcar', -45, 47.5, 0, { type: 'tanker' }],
  ['railcar', -30, 47.5, 0, { seed: 0.8 }],
  // The depot office and its car park.
  ['office', -24, -45, 0, { w: 13, d: 8, floors: 2, h: 7, color: '#b9b4a6' }],
  ['truck', -31, -31, 1, { color: '#d8a22c' }],
  ['truck', -26, -31, 1],
  ['tank', -82, 46, 0, { r: 2.6, h: 5 }],
  // Fences and lamps.
  ['fence', -50, -54, 0, { len: 60 }],
  ['fence', -50, 53, 0, { len: 60 }],
  ['lamp', -48, -3.5, 0],
  ['lamp', -30, 3.5, 2],
  ['lamp', -14, -3.5, 0],
  ['lamp', -38, -26, 1],
  ['lamp', -38, 26, 1],
]

/** The checkpoint in the middle. */
const CENTRE = [
  box('container', 0, 0, 2.5, 6.1, 5.2, 0),
  box('barrier', 0, -12, 2.6, 0.7),
  box('barrier', 0, 12, 2.6, 0.7),
  box('lowwall', 0, -36, 6, 0.6),
  box('lowwall', 0, 36, 6, 0.6),
]

// --- The bigger depot (220 x 140) --------------------------------------------------
// The hesco wall and everything behind it move 22 m back, the rail spur, fences and the
// office 12 m out. Inside the compound that opens up: a vehicle workshop and a guardroom
// you can go inside, another container row, lorries; a fighting trench in front of the
// wall, a blast berm round the fuel point.
const fx = (x) => (x < -64 ? x - 22 : x)
const fz = (z) => (Math.abs(z) > 40 ? z + Math.sign(z) * 12 : z)
const mv = (o) => ({ ...o, x: fx(o.x), z: fz(o.z) })
const mvPiece = ([k, x, z, r]) => [k, fx(x), fz(z), r]
const mvSet = ([k, x, z, r, o]) => [k, fx(x), fz(z), r, o]

const NEW_WEST = [
  ...[-80, -72].flatMap((x, i) => [box('container', x, -30, 6.1, 2.5, 2.6, i + 2), box('container', x, -27.4, 6.1, 2.5, 5.2, i)]),
  box('barrier', -74, -4, 2.6, 0.7),
  box('barrier', -74, 4, 2.6, 0.7),
  box('crate', -68, 18, 1.25, 1.25, 2.5),
  box('crate', -69.35, 18, 1.25, 1.25),
]
const NEW_PIECES = [
  ['drum', -84, 12],
  ['drum', -84.8, 12.6],
  ['ammocrate', -70, 32],
  ['floodlight', -70, -14],
]
const NEW_SETS = [
  ['bldg', -76, 26, 0, { w: 14, d: 9, floors: 2, doors: [['e', -1.5], ['s', 4]], color: '#9aa09a', floor: '#6f726d' }],
  ['bldg', -77, -13, 0, { w: 8, d: 6, doors: [['e', 0]], split: null, color: '#b3ad9c' }],
  ['truck', -71, 10, 1, { color: '#4f5c40' }],
  ['forklift', -69, -19, 0, { flip: true }],
]

const WEST_ALL = [...WEST.map(mv), ...NEW_WEST]
const WEST_PIECES_ALL = [...WEST_PIECES.map(mvPiece), ...NEW_PIECES]
const WEST_SETS_ALL = [...WEST_SETS.map(mvSet), ...NEW_SETS]

const TERRAIN = mirrorTerrain({
  trenches: [
    { points: [[-62, -34], [-61, -22], [-62, -12]], w: 2.8, d: 1.4, ramp: 4 },
    { points: [[-62, 12], [-61, 22], [-62, 34]], w: 2.8, d: 1.4, ramp: 4 },
  ],
  ridges: [{ points: [[-46, -58], [-32, -58]], w: 5, h: 1.6 }],
  hills: [
    { x: -98, z: -56, r: 9, h: 2.2 },
    { x: -98, z: 50, r: 8, h: 2 },
    { x: -14, z: -58, r: 7, h: 1.6 },
  ],
  rough: 0.12,
})

const { obstacles, pieces } = mirrored(WEST_ALL, WEST_PIECES_ALL, CENTRE, [['floodlight', 3, -4], ['floodlight', -3, 4]])
const westRoads = [
  { width: 3.2, points: [[-40, -76], [-40, 76]] },
  { width: 2.4, points: [[-100, -30], [-100, 30]] },
]
const mirrorPad = (p) => ({ ...p, x: -p.x })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })
const WEST_PADS = [
  // Concrete hardstanding under the warehouses and docks, the container yard and car park.
  { x: -54, z: -33, w: 30, d: 20, color: '#a4a198', joints: 5 },
  { x: -54, z: 33, w: 30, d: 20, color: '#a4a198', joints: 5 },
  { x: -27, z: 0, w: 18, d: 36, color: '#9c9990', joints: 4 },
  { x: -26, z: -35, w: 16, d: 12, color: '#4d5053' },
]
const WEST_LINES = [
  // Parking bays in the car park, ballast and sleepers under the rails.
  ...[-33.5, -28.5, -23.5, -18.5].map((x) => ({ points: [[x, -30], [x, -38]], width: 0.2, color: 'rgba(235,235,230,0.85)' })),
  { points: [[-110, 59.5], [0, 59.5]], width: 3.2, color: '#6e6a62' },
  { points: [[-110, 59.5], [0, 59.5]], width: 2.6, color: '#4a3a2c', dash: [0.25, 0.55] },
  { points: [[-67, -22], [-41, -22]], width: 0.3, color: 'rgba(230,196,70,0.9)' },
  { points: [[-67, 22], [-41, 22]], width: 0.3, color: 'rgba(230,196,70,0.9)' },
]

export const IRONHOLD_DEPOT = {
  id: 'depot',
  name: 'Ironhold Depot',
  width: 220,
  depth: 140,
  terrain: TERRAIN,
  bases: [
    { x: -94, z: 0 },
    { x: 94, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS_ALL, ...WEST_SETS_ALL.map(mirrorSet)],
  pads: [...WEST_PADS, ...WEST_PADS.map(mirrorPad)],
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  roads: [{ width: 4.2, points: [[-118, 0], [118, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad)],
  mud: [[-10, -20, 4], [-92, 30, 4], [-64, 0, 4]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(70, 61, 110, 70),
  hills: [150, 250],
  hillScale: 0.9,
  theme: {
    grassA: '#787a75',
    grassB: '#83857e',
    dry: '#8e8b7d',
    outside: '#5f6c51',
    mud: [70, 68, 64],
    road: [56, 58, 60],
    rut: [214, 182, 72],
    hillNear: '#566650',
    hillFar: '#839580',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#8ea284',
    scatter: 'ruins',
    clouds: 0.5,
    ao: [24, 24, 26],
    sun: '#fff1dc',
    sunIntensity: 2.05,
    skyLight: '#dde8f2',
    groundLight: '#5c5a54',
    ambient: 1.25,
  },
  sky: { top: '#6a9ccb', horizon: '#d2dde2', ground: '#7d7f78' },
  fog: '#cdd6d9',
}

export default IRONHOLD_DEPOT
