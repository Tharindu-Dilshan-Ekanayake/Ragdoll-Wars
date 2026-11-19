import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored } from './mapKit.js'

/**
 * Steelbay Warehouse - a fight inside a distribution warehouse. A tiled floor under tall
 * corrugated walls and open roof trusses; rows of pallet racking make long aisles between
 * the two loading bays, where each army comes in by the roller doors. The middle is the
 * staging area: forklifts, pallets and stacked crates round a glass site office. Close
 * quarters - the racks are cover you can't see through, the aisles are kill zones.
 */

const W = 120
const D = 80
const HX = W / 2 - 0.4
const HZ = D / 2 - 0.4

const RACK_ROWS = [-32, -24, -16, 16, 24, 32]
const RACK_X = [-30, -10]

const WEST = [
  // Jersey barriers and crates at the bay; crate stacks through the staging area.
  box('barrier', -42, -4, 0.7, 2.6),
  box('barrier', -42, 4, 0.7, 2.6),
  box('container', -47, 33, 6.1, 2.5, 2.6, 2),
  box('crate', -20, 2.5, 1.25, 1.25, 2.5),
  box('crate', -21.35, 2.5, 1.25, 1.25),
  box('crate', -20.6, 3.85, 1.25, 1.25),
  box('crate', -8, -6, 1.25, 1.25, 2.5),
  box('crate', -8, -7.35, 1.25, 1.25),
  box('crate', -26, -8, 1.25, 1.25),
  box('crate', -27, 7, 1.25, 1.25, 2.5),
  box('sandbag', -36, 9, 3, 0.9),
  box('sandbag', -36, -9, 3, 0.9),
]

const WEST_PIECES = [
  ['fuel', -40, -30],
  ['fuel', -40.9, -29.4],
  ['drum', -41, -31],
  ['ammocrate', -47, 5],
  ['drum', -14, 9],
]

const racks = []
for (const z of RACK_ROWS) for (const x of RACK_X) racks.push(['rack', x, z, 0, { len: 12 }])

const WEST_SETS = [
  // The building: long walls, the west end wall with its four roller doors.
  ['shedwall', -W / 4, -HZ, 0, { len: W / 2 }],
  ['shedwall', -W / 4, HZ, 2, { len: W / 2 }],
  ['shedwall', -HX, 0, 1, { len: D, doors: [-24, -12, 12, 24] }],
  ...[-50, -40, -30, -20, -10].map((x) => ['truss', x, 0, 1, { len: D }]),
  ...racks,
  // The loading bay: lorries backed in at the doors, pallets staged, a forklift, the
  // bay office.
  ['truck', -52, -24, 0, { color: '#3f6b9a', flip: true }],
  ['truck', -52, 24, 0, { flip: true }],
  ['pallets', -45, -18, 0],
  ['pallets', -43.5, -18, 0],
  ['pallets', -45, 18.5, 0],
  ['forklift', -44, -12, 0, { flip: true }],
  ['cabin', -56.5, 9, 1, { color: '#d6d2c4' }],
  // Staging area.
  ['forklift', -14, 5, 0, { color: '#d8a22c', flip: true }],
  ['pallets', -18, -4, 0],
  ['pallets', -16.5, -4, 0],
  ['pallets', -24, 0, 0],
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
WEST_LINES.push({ points: [[-56, -10], [0, -10]], width: 0.15, color: Y }, { points: [[-56, 10], [0, 10]], width: 0.15, color: Y })
for (const zc of [-24, -12, 12, 24]) {
  WEST_LINES.push({ points: [[-59, zc - 2.4], [-53, zc - 2.4], [-53, zc + 2.4], [-59, zc + 2.4]], width: 0.15, color: Y })
  for (let k = -2; k <= 2; k += 1) WEST_LINES.push({ points: [[-59, zc + k - 0.6], [-53.5, zc + k + 0.6]], width: 0.2, color: 'rgba(230,190,40,0.55)' })
}
WEST_LINES.push({ points: [[-58, -38.2], [0, -38.2]], width: 0.12, color: 'rgba(70,160,80,0.85)' }, { points: [[-58, 38.2], [0, 38.2]], width: 0.12, color: 'rgba(70,160,80,0.85)' })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })

export const STEELBAY_WAREHOUSE = {
  id: 'warehouse',
  name: 'Steelbay Warehouse',
  width: W,
  depth: D,
  bases: [
    { x: -50, z: 0 },
    { x: 50, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  // A tiled floor wall to wall.
  floor: { x: 0, z: 0, w: W, d: D, tile: 1.6, colors: ['#bdb9b0', '#ada99f'], grout: 'rgba(60,58,54,0.4)' },
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  texts: [
    { x: -48, z: -30, text: 'BAY 1', size: 2.2, color: 'rgba(230,190,40,0.85)' },
    { x: 48, z: -30, text: 'BAY 2', size: 2.2, color: 'rgba(230,190,40,0.85)' },
    // Aisle letters at the cross aisles, in the aisle on the wall side of each row.
    ...['A', 'B', 'C'].flatMap((text, i) => [-20, 20].map((x) => ({ x, z: RACK_ROWS[i] - 4, text, size: 1.8, color: 'rgba(40,40,40,0.55)' }))),
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
