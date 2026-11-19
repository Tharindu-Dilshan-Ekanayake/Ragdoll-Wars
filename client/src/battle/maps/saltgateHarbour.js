import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Saltgate Harbour - a working container port. Three piers run out into the basins
 * along the south edge, cargo ships moored between them under ship-to-shore cranes; the
 * quay behind is a container terminal laid out in blocks and lanes, then a rail line,
 * warehouses, the harbour office and a tank farm. Each army holds a camp at its end of
 * the port. Soldiers can't swim: the piers and quay are the only ways round the water.
 */

const mirrorPad = (p) => ({ ...p, x: -p.x })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })

// --- West half ---------------------------------------------------------------------------

const WEST = [
  // Container terminal: blocks of stacks with lanes between.
  ...[-62, -55, -48].flatMap((x, i) => [
    box('container', x, -16, 6.1, 2.5, 5.2, i),
    box('container', x, -13.4, 6.1, 2.5, 2.6, i + 2),
    box('container', x, -10.8, 6.1, 2.5, 5.2, i + 1),
  ]),
  ...[-34, -27, -20].flatMap((x, i) => [
    box('container', x, -16, 6.1, 2.5, 2.6, i + 3),
    box('container', x, -13.4, 6.1, 2.5, 5.2, i),
    box('container', x, -2, 6.1, 2.5, 5.2, i + 2),
    box('container', x, 0.6, 6.1, 2.5, 2.6, i + 1),
  ]),
  box('container', -62, 0, 6.1, 2.5, 2.6, 3),
  box('container', -55, 0, 6.1, 2.5, 5.2, 0),
  // Warehouses behind the rail line.
  box('warehouse', -46, 38, 24, 12, 7.5, 0, { color: '#8a9298', roof: '#5f666c' }),
  box('warehouse', -18, 40, 14, 10, 6.5, 0, { color: '#9a8f7c', roof: '#6b6255' }),
  // The army camp at the west end.
  box('tent', -78, 14, 4.2, 3.6),
  box('tent', -78, 22, 4.2, 3.6),
  box('tent', -72, 30, 4.2, 3.6),
  box('sandbag', -66, 8, 3, 0.9),
  box('sandbag', -66, -4, 0.9, 6),
  box('crate', -70, 4, 1.25, 1.25, 2.5),
  // Cover on the quay.
  box('barrier', -40, -22, 2.6, 0.7),
  box('barrier', -12.5, -22, 2.6, 0.7),
]

const WEST_PIECES = [
  ['sandwall', -82, 6, 0],
  ['sandwall', -79.5, 6, 0],
  ['tower', -68, 36],
  ['floodlight', -66, 18],
  ['ammocrate', -70, 10],
  ['pipes', -40, 8],
  ['drum', -30, 24.5],
  ['drum', -31, 25.1],
]

const WEST_SETS = [
  // Ships between the piers, a tug in the outer basin.
  ['ship', -25, -44, 0, { len: 34, seed: 2 }],
  ['tug', -70, -45, 0],
  ['crane', -31, -27, 0],
  ['crane', -16, -27, 0],
  ['lighthouse', -50, -51, 0],
  // Trucks in the lanes.
  ['truck', -41, -6, 0],
  ['truck', -14, -8, 2],
  // Rail line and wagons.
  ['rail', -55, 21, 0, { len: 110 }],
  ['railcar', -60, 21, 0, { seed: 0.1 }],
  ['railcar', -46, 21, 0, { type: 'tanker' }],
  ['railcar', -32, 21, 0, { seed: 0.7 }],
  // Tank farm and the harbour office.
  ['tank', -72, 46, 0, { r: 5, h: 9 }],
  ['tank', -60, 48, 0, { r: 4, h: 7, color: '#c9c3b2' }],
  ['office', -24, 30, 2, { w: 12, d: 8, floors: 2, h: 7 }],
  ['lamp', -40, -21, 2],
  ['lamp', -10, -21, 2],
  ['lamp', -60, -21, 2],
  ['fence', -60, 52, 0, { len: 40 }],
]

const CENTRE_SETS = [
  ['crane', 0, -27, 0],
  ['lamp', 2, 26, 0],
]

// --- The bigger port (220 x 130) ---------------------------------------------------
// The camp moves 25 m back; the quay, basins and ships 10 m south (the apron between is
// new paving), the rail yard and warehouses 10 m north. The ground opened up behind the
// terminal gets a customs house and a dockers' shed you can fight through.
const fx = (x) => (x < -64 ? x - 25 : x)
const fz = (z) => (z > 26 ? z + 10 : z < -20 ? z - 10 : z)
const mv = (o) => ({ ...o, x: fx(o.x), z: fz(o.z) })
const mvPiece = ([k, x, z, r]) => [k, fx(x), fz(z), r]
// South-side sets keep their x (the basins and quay are stretched to the new edge instead).
const mvSet = ([k, x, z, r, o]) => [k, z < -20 ? x : fx(x), fz(z), r, o]

const NEW_WEST = [
  box('container', -82, -14, 6.1, 2.5, 5.2, 4),
  box('container', -82, -11.4, 6.1, 2.5, 2.6, 1),
  box('crate', -74, 4, 1.25, 1.25, 2.5),
  box('crate', -75.35, 4, 1.25, 1.25),
  box('barrier', -68, -20, 2.6, 0.7),
  box('barrier', -88, -20, 2.6, 0.7),
  box('sandbag', -70, 22, 3, 0.9),
]
const NEW_PIECES = [
  ['drum', -86, -4],
  ['drum', -86.8, -3.4],
  ['floodlight', -70, -4],
]
const NEW_SETS = [
  ['bldg', -78, -3, 0, { w: 12, d: 8, floors: 2, doors: [['n', 3], ['e', 0]], color: '#c9c4b8' }],
  ['bldg', -79, 13, 0, { w: 9, d: 6, doors: [['e', 0], ['s', -2]], split: null, color: '#b9b2a2' }],
  ['forklift', -71, -12, 0, { color: '#d8a22c', flip: true }],
  ['pallets', -86, 3, 0],
  ['truck', -88, 26, 0, { color: '#3f6b9a', flip: true }],
]

const WEST_ALL = [...WEST.map(mv), ...NEW_WEST]
const WEST_PIECES_ALL = [...WEST_PIECES.map(mvPiece), ...NEW_PIECES]
const WEST_SETS_ALL = [...WEST_SETS.map(mvSet), ...NEW_SETS]

const { obstacles, pieces } = mirrored(WEST_ALL, WEST_PIECES_ALL, [box('container', 0, 4, 2.5, 6.1, 5.2, 1)], [['pipes', 0, -10]])

const WEST_PADS = [
  // The quay (moved south), the new apron behind it, the terminal's asphalt, the pier.
  { x: -55, z: -36, w: 110, d: 12, color: '#a19d93', joints: 6 },
  { x: -55, z: -25, w: 110, d: 10, color: '#9a968c', joints: 6 },
  { x: -55, z: -5, w: 110, d: 30, color: '#55585b', joints: 0 },
  { x: -50, z: -53.5, w: 12, d: 23, color: '#a19d93', joints: 6 },
]
const WEST_LINES = [
  // Lane markings through the terminal and the quay's edge line.
  { points: [[-110, -8], [0, -8]], width: 0.25, color: 'rgba(230,200,80,0.85)', dash: [3, 3] },
  { points: [[-110, 6], [0, 6]], width: 0.25, color: 'rgba(230,200,80,0.85)', dash: [3, 3] },
  { points: [[-110, -31], [0, -31]], width: 0.35, color: 'rgba(230,200,80,0.9)' },
  // Ballast and sleepers under the rails.
  { points: [[-110, 21], [0, 21]], width: 3.2, color: '#6e6a62' },
  { points: [[-110, 21], [0, 21]], width: 2.6, color: '#4a3a2c', dash: [0.25, 0.55] },
]

export const SALTGATE_HARBOUR = {
  id: 'harbor',
  name: 'Saltgate Harbour',
  width: 220,
  depth: 130,
  bases: [
    { x: -99, z: 10 },
    { x: 99, z: 10 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS_ALL, ...WEST_SETS_ALL.map(mirrorSet), ...CENTRE_SETS.map(mvSet)],
  water: [
    { x: -83, z: -53.5, w: 54, d: 23, open: 'sw' },
    { x: -25.5, z: -53.5, w: 37, d: 23, open: 's' },
    { x: 25.5, z: -53.5, w: 37, d: 23, open: 's' },
    { x: 83, z: -53.5, w: 54, d: 23, open: 'se' },
  ],
  pads: [...WEST_PADS, ...WEST_PADS.map(mirrorPad), { x: 0, z: -53.5, w: 14, d: 23, color: '#a19d93', joints: 6 }],
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  texts: [{ x: 0, z: -56, text: 'PIER 2', size: 2.4, rot: -Math.PI / 2, color: 'rgba(240,235,220,0.75)' }],
  roads: [{ width: 3.4, points: [[-118, 30], [118, 30]] }, ...[{ width: 3, points: [[-40, 72], [-40, 30]] }].flatMap((r) => [r, mirrorRoad(r)])],
  mud: [],
  sea: { z: -67 },
  trees: scatterTrees(46, 91, 110, 65, (x, z) => z < -60),
  hills: [150, 250],
  hillScale: 0.9,
  theme: {
    grassA: '#6f7a5a',
    grassB: '#7b8462',
    dry: '#8a8a6a',
    outside: '#5d6b4c',
    mud: [80, 78, 70],
    road: [58, 60, 62],
    rut: [214, 186, 80],
    hillNear: '#5a6a52',
    hillFar: '#8a9a8e',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#9aa894',
    scatter: 'ruins',
    clouds: 0.5,
    ao: [24, 26, 28],
    sun: '#fff2dc',
    sunIntensity: 2.1,
    skyLight: '#dbe8f4',
    groundLight: '#5a5a54',
    ambient: 1.25,
  },
  sky: { top: '#5e98d2', horizon: '#d4e3ec', ground: '#7a7c74' },
  fog: '#ccdbe3',
}

export default SALTGATE_HARBOUR
