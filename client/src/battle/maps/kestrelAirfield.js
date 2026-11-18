import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, scatterTrees } from './mapKit.js'

/**
 * Kestrel Airfield - a military air base. A long runway crosses the south of the field
 * with its markings and numbers; a taxiway and a concrete apron run parallel to it.
 * A four-engined transport is parked in the middle under the control tower; each side
 * has its hangars, fighters in hesco revetments, a fuel point and a camp. The runway
 * itself is wide open - the fight is for the hangars, revetments and the apron.
 */

const mirrorPad = (p) => ({ ...p, x: -p.x })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })

const WEST = [
  // Blast walls and cover round the apron.
  box('wall', -36, 2, 5, 0.7, 2.6, 0, { color: '#b9b5aa' }),
  box('wall', -24, 2, 5, 0.7, 2.6, 0, { color: '#b9b5aa' }),
  box('barrier', -50, 2, 2.6, 0.7),
  box('barrier', -12, 2, 2.6, 0.7),
  box('crate', -30, 6, 1.25, 1.25, 2.5),
  box('crate', -28.6, 6, 1.25, 1.25),
  // The camp behind the hangars.
  box('tent', -80, 42, 4.2, 3.6),
  box('tent', -74, 46, 4.2, 3.6),
  box('tent', -80, 34, 4.2, 3.6),
  box('sandbag', -84, 22, 0.9, 6),
  box('container', -54, 46, 6.1, 2.5, 2.6, 2),
  box('container', -54, 49, 6.1, 2.5, 2.6, 0),
  // AA nests south of the runway.
  box('sandbag', -50, -46, 3, 0.9),
  box('sandbag', -50, -50, 3, 0.9),
  box('sandbag', -51.6, -48, 0.9, 3),
  box('sandbag', -20, -46, 3, 0.9),
  box('sandbag', -20, -50, 3, 0.9),
  box('sandbag', -21.6, -48, 0.9, 3),
]

const WEST_PIECES = [
  ['sandwall', -84, 28, 1],
  ['sandwall', -84, 30.5, 1],
  ['tower', -66, 50],
  ['floodlight', -62, 4],
  ['floodlight', -30, 34],
  ['ammocrate', -46, 36],
  ['fuel', -66, 36],
  ['fuel', -66.9, 36.6],
  ['drum', -64.8, 37],
  ['bunker', -36, -48],
  ['camonet', -76, 52],
]

const WEST_SETS = [
  ['hangar', -46, 22, 2, { w: 26, d: 20 }],
  ['hangar', -32, 42, 2, { w: 18, d: 14, color: '#868f86' }],
  ['revetment', -72, 14, 2],
  ['fighter', -72, 13, 1],
  ['revetment', -72, -2, 0],
  ['fighter', -72, -1, 3],
  ['tank', -60, 44, 0, { r: 3, h: 5 }],
  ['truck', -29.5, 14, 1, { color: '#d8a22c' }],
  ['windsock', -40, -44, 0],
  ['lamp', -50, 30, 2],
  ['lamp', -18, 30, 2],
  ['fence', -64, 54, 0, { len: 40 }],
  ['fence', -24, 54, 0, { len: 36 }],
]

const CENTRE_SETS = [
  ['plane', 0, 16, 0],
  ['ctower', 0, 42, 0],
  ['office', 13, 44, 2, { w: 12, d: 7, floors: 1, h: 3.8 }],
  ['radar', -11, 46, 0],
  ['lamp', 0, 30, 2],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [box('barrier', 0, 2, 2.6, 0.7)], [])

// The runway, taxiway and apron with their markings.
const RUNWAY_Z = -30
const runwayLines = []
for (const end of [-1, 1]) {
  for (let k = 0; k < 8; k += 1) {
    const z = RUNWAY_Z - 8 + k * 2.3
    runwayLines.push({ points: [[end * 80, z], [end * 72, z]], width: 1.1, color: 'rgba(238,238,232,0.92)' })
  }
  runwayLines.push({ points: [[end * 60, RUNWAY_Z - 4], [end * 52, RUNWAY_Z - 4]], width: 1.6, color: 'rgba(238,238,232,0.9)' })
  runwayLines.push({ points: [[end * 60, RUNWAY_Z + 4], [end * 52, RUNWAY_Z + 4]], width: 1.6, color: 'rgba(238,238,232,0.9)' })
}

const WEST_PADS = [
  { x: -55, z: 16, w: 50, d: 30, color: '#a8a49a', joints: 5 },
  { x: -40, z: -16, w: 10, d: 12, color: '#45484b' },
]
const WEST_LINES = [
  // Parking boxes on the apron.
  ...[-56, -44].map((x) => ({ points: [[x, 4], [x, 12]], width: 0.25, color: 'rgba(230,196,70,0.9)' })),
  { points: [[-40, -10], [-40, -21]], width: 0.25, color: 'rgba(230,196,70,0.9)' },
]

export const KESTREL_AIRFIELD = {
  id: 'airbase',
  name: 'Kestrel Airfield',
  width: 170,
  depth: 110,
  bases: [
    { x: -74, z: -10 },
    { x: 74, z: -10 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  pads: [
    { x: 0, z: RUNWAY_Z, w: 170, d: 22, color: '#3d3f42' },
    { x: 0, z: -8, w: 150, d: 10, color: '#45484b' },
    { x: 0, z: 18, w: 60, d: 34, color: '#a8a49a', joints: 5 },
    { x: 0, z: 44, w: 36, d: 14, color: '#a8a49a', joints: 4 },
    ...WEST_PADS,
    ...WEST_PADS.map(mirrorPad),
  ],
  lines: [
    { points: [[-52, RUNWAY_Z], [52, RUNWAY_Z]], width: 0.7, color: 'rgba(240,240,235,0.9)', dash: [7, 6] },
    { points: [[-85, RUNWAY_Z - 10.3], [85, RUNWAY_Z - 10.3]], width: 0.4, color: 'rgba(240,240,235,0.85)' },
    { points: [[-85, RUNWAY_Z + 10.3], [85, RUNWAY_Z + 10.3]], width: 0.4, color: 'rgba(240,240,235,0.85)' },
    { points: [[-75, -8], [75, -8]], width: 0.3, color: 'rgba(230,196,70,0.9)' },
    ...runwayLines,
    ...WEST_LINES,
    ...WEST_LINES.map(mirrorLine),
  ],
  texts: [
    { x: -64, z: RUNWAY_Z, text: '09', size: 7, rot: 0 },
    { x: 64, z: RUNWAY_Z, text: '27', size: 7, rot: 0 },
  ],
  roads: [{ width: 3, points: [[0, 60], [0, 50]] }],
  mud: [],
  trees: scatterTrees(60, 31, 85, 55),
  hills: [150, 250],
  hillScale: 1.1,
  theme: {
    grassA: '#6a8a45',
    grassB: '#7a9a50',
    dry: '#9a9a62',
    outside: '#5a7a3c',
    mud: [92, 80, 60],
    road: [62, 64, 66],
    rut: [70, 72, 74],
    hillNear: '#56703a',
    hillFar: '#7f9a88',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#86a35e',
    scatter: 'meadow',
    clouds: 0.45,
  },
  sky: { top: '#5b9bd8', horizon: '#cfe3ee', ground: '#8a9a6a' },
  fog: '#c9d9df',
}

export default KESTREL_AIRFIELD
