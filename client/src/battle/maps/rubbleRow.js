import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Rubble Row - a shelled town. Blocks of gutted apartment buildings line the main street
 * and the cross streets: broken walls you can get inside, floors hanging off, rebar and
 * rubble spilled across the pavement. A church with its tower shot off stands in each
 * half, a burnt-out bus blocks the road, and each army holds a barricaded square at its
 * end of the main street.
 */

const WEST = [
  // Barricaded square.
  box('sandbag', -60, -6, 0.9, 6),
  box('sandbag', -60, 6, 0.9, 6),
  box('barrier', -64, -12, 2.6, 0.7),
  box('barrier', -64, 12, 2.6, 0.7),
  box('container', -72, -18, 6.1, 2.5, 2.6, 2),
  box('container', -72, 18, 6.1, 2.5, 2.6, 0),
  box('crate', -66, 0, 1.25, 1.25, 2.5),
  // Roadblocks.
  box('barrier', -28, -3, 0.7, 2.6),
  box('barrier', -10, 3, 0.7, 2.6),
  box('lowwall', -60, -30, 0.6, 6),
  box('lowwall', -60, 30, 0.6, 6),
]

const WEST_PIECES = [
  ['carwreck', -46, 3],
  ['carwreck', -27, -20, 1],
  ['carwreck', -8, 20],
  ['rubble', -48, -19],
  ['rubble', -44, 20],
  ['rubble', -24, 22],
  ['rubble', -8, -10],
  ['rubble', -30, 46],
  ['deadtree', -70, 42],
  ['deadtree', -70, -42],
  ['drum', -56, 0],
  ['fuel', -66, 10],
]

const WEST_SETS = [
  // Apartment blocks facing the main street, a second row behind.
  ['ruinblock', -50, 12, 2, { w: 10, d: 8, h: 7 }],
  ['ruinblock', -39, 13, 2, { w: 8, d: 9, h: 10 }],
  ['ruinblock', -50, -12, 0, { w: 10, d: 8, h: 7 }],
  ['ruinblock', -39, -13, 0, { w: 8, d: 9, h: 4 }],
  ['ruinblock', -18, 12, 2, { w: 10, d: 8, h: 10 }],
  ['ruinblock', -18, -12, 0, { w: 10, d: 8, h: 7 }],
  ['ruinblock', -16, 38, 2, { w: 12, d: 8, h: 7 }],
  ['ruinblock', -48, 40, 2, { w: 10, d: 8, h: 4 }],
  ['ruinblock', -16, -40, 0, { w: 10, d: 8, h: 4 }],
  ['church', -46, -40, 0],
  ['bus', -36, -3, 0],
  ['lamp', -56, 4.5, 2],
  ['lamp', -26, -4.5, 0],
  ['lamp', -8, 4.5, 2],
]

const CENTRE = [box('wall', 0, -20, 6, 0.8), box('wall', 0, 20, 6, 0.8)]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['rubble', 0, 0], ['carwreck', 0, -40], ['carwreck', 3, 40, 1]])
const westRoads = [{ width: 3.6, points: [[-30, -60], [-30, 60]] }]
const mirrorPad = (p) => ({ ...p, x: -p.x })
const mirrorLine = (l) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]) })
const WEST_PADS = [
  // Pavements along the main street.
  { x: -45, z: 6, w: 26, d: 2.4, color: '#8e8a82', edge: 'rgba(60,60,62,0.6)' },
  { x: -45, z: -6, w: 26, d: 2.4, color: '#8e8a82', edge: 'rgba(60,60,62,0.6)' },
  { x: -15, z: 6, w: 24, d: 2.4, color: '#8e8a82', edge: 'rgba(60,60,62,0.6)' },
  { x: -15, z: -6, w: 24, d: 2.4, color: '#8e8a82', edge: 'rgba(60,60,62,0.6)' },
]
const WEST_LINES = [
  { points: [[-90, 0], [-34, 0]], width: 0.25, color: 'rgba(235,230,210,0.7)', dash: [3, 3] },
  { points: [[-26, 0], [-3, 0]], width: 0.25, color: 'rgba(235,230,210,0.7)', dash: [3, 3] },
  // Zebra crossing over the cross street.
  ...[-2, -1, 0, 1, 2].map((k) => ({ points: [[-33, 9 + k * 0.9 + 3], [-27, 9 + k * 0.9 + 3]], width: 0.45, color: 'rgba(235,230,210,0.6)' })),
]

export const RUBBLE_ROW = {
  id: 'rubble',
  name: 'Rubble Row',
  width: 170,
  depth: 110,
  bases: [
    { x: -70, z: 0 },
    { x: 70, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet)],
  pads: [...WEST_PADS, ...WEST_PADS.map(mirrorPad)],
  lines: [...WEST_LINES, ...WEST_LINES.map(mirrorLine)],
  roads: [{ width: 4.2, points: [[-90, 0], [90, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad), { width: 3, points: [[0, -60], [0, 60]] }],
  // Shell craters.
  mud: [[-52, 0, 4], [-30, -28, 5], [-30, 28, 4], [-8, -30, 5], [-60, 44, 4]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(40, 41, 85, 55),
  hills: [150, 250],
  hillScale: 0.8,
  theme: {
    grassA: '#8e8b85',
    grassB: '#9b9891',
    dry: '#7c7973',
    outside: '#86837d',
    mud: [92, 88, 84],
    road: [64, 64, 68],
    rut: [210, 196, 120],
    hillNear: '#6f6c68',
    hillFar: '#a3a09a',
    tree: 'dead',
    fence: '#55595e',
    peak: '#b7b3ab',
    scatter: 'ruins',
    clouds: 0.72,
    cloudColor: '#d5d8dc',
    ao: [28, 28, 30],
    sun: '#ece8df',
    sunIntensity: 1.65,
    skyLight: '#dde2e8',
    groundLight: '#6a6660',
    ambient: 1.45,
  },
  sky: { top: '#7d97b3', horizon: '#d8d4ca', ground: '#8e8b85' },
  fog: '#cac7bf',
}

export default RUBBLE_ROW
