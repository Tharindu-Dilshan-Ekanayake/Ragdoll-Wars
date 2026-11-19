import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored } from './mapKit.js'

/**
 * Steelbay Warehouse - a fight inside a distribution warehouse. A tiled floor under tall
 * corrugated walls and open roof trusses; rows of pallet racking make long aisles between
 * the two loading bays, where each army comes in by the roller doors. The middle is the
 * staging area: forklifts, pallets and stacked crates round a glass site office. Close
 * quarters - the racks are cover you can't see through, the aisles are kill zones.
 */

const W = 150
const D = 100
const HX = W / 2 - 0.4
const HZ = D / 2 - 0.4

const RACK_ROWS = [-40, -30, -20, 20, 30, 40]
const RACK_X = [-46, -28, -10]
const DOORS = [-30, -15, 15, 30]

const WEST = [
  // Jersey barriers and crates at the bay; crate stacks through the staging area.
  box('barrier', -56, -4, 0.7, 2.6),
  box('barrier', -56, 4, 0.7, 2.6),
  box('container', -61, 43, 6.1, 2.5, 2.6, 2),
  box('crate', -24, 3, 1.25, 1.25, 2.5),
  box('crate', -25.35, 3, 1.25, 1.25),
  box('crate', -24.6, 4.35, 1.25, 1.25),
  box('crate', -9, -7, 1.25, 1.25, 2.5),
  box('crate', -9, -8.35, 1.25, 1.25),
  box('crate', -32, -9, 1.25, 1.25),
  box('crate', -36, 8, 1.25, 1.25, 2.5),
  box('crate', -44, -2, 1.25, 1.25),
  box('sandbag', -48, 11, 3, 0.9),
  box('sandbag', -48, -11, 3, 0.9),
]

const WEST_PIECES = [
  ['fuel', -54, -42],
  ['fuel', -54.9, -41.4],
  ['drum', -55, -43],
  ['ammocrate', -61, 5],
  ['drum', -16, 10],
]

const racks = []
for (const z of RACK_ROWS) for (const x of RACK_X) racks.push(['rack', x, z, 0, { len: 12 }])

const WEST_SETS = [
  // The building: long walls, the west end wall with its four roller doors.
  ['shedwall', -W / 4, -HZ, 0, { len: W / 2 }],
  ['shedwall', -W / 4, HZ, 2, { len: W / 2 }],
  ['shedwall', -HX, 0, 1, { len: D, doors: DOORS }],
  ...[-65, -52, -39, -26, -13].map((x) => ['truss', x, 0, 1, { len: D }]),
  ...racks,
  // The loading bay: lorries backed in at the doors, pallets staged, forklifts, the bay
  // office.
  ['truck', -66, -30, 0, { color: '#3f6b9a', flip: true }],
  ['truck', -66, 30, 0, { flip: true }],
  ['pallets', -59, -22, 0],
  ['pallets', -57.5, -22, 0],
  ['pallets', -59, 23, 0],
  ['forklift', -58, -15, 0, { flip: true }],
  ['forklift', -59, 16, 0, { color: '#d8a22c', flip: true }],
  ['cabin', -71.5, 9, 1, { color: '#d6d2c4' }],
  // Staging area.
  ['forklift', -17, 6, 0, { color: '#d8a22c', flip: true }],
  ['pallets', -21, -5, 0],
  ['pallets', -19.5, -5, 0],
  ['pallets', -30, 0, 0],
  ['pallets', -38, -6, 0],
]

const CENTRE_SETS = [
  ['truss', 0, 0, 1, { len: D }],
  ['office', 0, 0, 0, { w: 10, d: 6, floors: 1, h: 3.4, color: '#c9c4b8' }],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [], [])

// Floor markings: yellow lines along the rack fronts and the staging area, hatched bays at
// the doors, walkway lines by the walls.
const Y = 'rgba(230,190,40,0.95)'
const WEST_LINES = []
for (const z of RACK_ROWS) for (const x of RACK_X) for (const dz of [-0.95, 0.95]) WEST_LINES.push({ points: [[x - 6.2, z + dz], [x + 6.2, z + dz]], width: 0.12, color: Y })
WEST_LINES.push({ points: [[-71, -13], [0, -13]], width: 0.15, color: Y }, { points: [[-71, 13], [0, 13]], width: 0.15, color: Y })
for (const zc of DOORS) {
  WEST_LINES.push({ points: [[-74, zc - 2.4], [-68, zc - 2.4], [-68, zc + 2.4], [-74, zc + 2.4]], width: 0.15, color: Y })
  for (let k = -2; k <= 2; k += 1) WEST_LINES.push({ points: [[-74, zc + k - 0.6], [-68.5, zc + k + 0.6]], width: 0.2, color: 'rgba(230,190,40,0.55)' })
}
WEST_LINES.push({ points: [[-73, -48.2], [0, -48.2]], width: 0.12, color: 'rgba(70,160,80,0.85)' }, { points: [[-73, 48.2], [0, 48.2]], width: 0.12, color: 'rgba(70,160,80,0.85)' })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })

export const STEELBAY_WAREHOUSE = {
  id: 'warehouse',
  name: 'Steelbay Warehouse',
  width: W,
  depth: D,
  bases: [
    { x: -62, z: 0 },
    { x: 62, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  // A tiled floor wall to wall.
  floor: { x: 0, z: 0, w: W, d: D, tile: 1.6, colors: ['#bdb9b0', '#ada99f'], grout: 'rgba(60,58,54,0.4)' },
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  texts: [
    { x: -62, z: -40, text: 'BAY 1', size: 2.4, color: 'rgba(230,190,40,0.85)' },
    { x: 62, z: -40, text: 'BAY 2', size: 2.4, color: 'rgba(230,190,40,0.85)' },
    // Aisle letters at the cross aisles, in the aisle on the wall side of each row.
    ...['A', 'B', 'C'].flatMap((text, i) => [-37, -19, 19, 37].map((x) => ({ x, z: RACK_ROWS[i] - 5, text, size: 1.8, color: 'rgba(40,40,40,0.55)' }))),
  ],
  roads: [],
  mud: [],
  trees: [],
  hills: [150, 250],
  hillScale: 0.8,
  theme: {
    grassA: '#8a8b88',
    grassB: '#93948f',
    dry: '#83847f',
    outside: '#5d6062',
    mud: [80, 78, 74],
    road: [60, 62, 64],
    rut: [60, 62, 64],
    hillNear: '#5f6b5c',
    hillFar: '#8f9a92',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#9aa49a',
    scatter: 'none',
    clouds: 0.5,
    ao: [26, 26, 28],
    sun: '#fff2dc',
    sunIntensity: 1.9,
    skyLight: '#e2e8ee',
    groundLight: '#6a6a66',
    ambient: 1.35,
  },
  sky: { top: '#6a9ccb', horizon: '#d2dde2', ground: '#7d7f78' },
  fog: '#cdd6d9',
}

export default STEELBAY_WAREHOUSE
