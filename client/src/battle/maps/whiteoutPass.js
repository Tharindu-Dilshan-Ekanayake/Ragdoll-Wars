import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Whiteout Pass - a snowbound mountain pass split by a frozen creek. Each army holds a
 * mountain station: log cabins with smoking chimneys under snow-laden roofs, a radar
 * dome, a fuel tank and a snowcat, a bunker and a watchtower behind sandbag lines. A
 * timber bridge carries the road over the creek; stands of snowy pines on the flanks
 * hide flanking runs, and dragon's teeth guard the other crossings.
 */

const WEST = [
  box('sandbag', -48, -6, 0.9, 7),
  box('sandbag', -48, 6, 0.9, 7),
  box('sandbag', -44, 10, 6, 0.9),
  box('lowwall', -30, -18, 8, 0.7),
  box('lowwall', -30, 18, 8, 0.7),
  box('crate', -60, 6, 1.25, 1.25, 2.5),
  box('crate', -60, 7.4, 1.25, 1.25),
  box('container', -38, 34, 6.1, 2.5, 2.6, 2),
  box('barrier', -18, -4, 0.7, 2.6),
  box('barrier', -18, 4, 0.7, 2.6),
]

const WEST_PIECES = [
  ['bunker', -56, 16],
  ['tower', -70, 6],
  ['rock', -36, -34],
  ['rock', -33, -36.5],
  ['rock', -24, 30],
  ['snowpine', -52, -44],
  ['snowpine', -47, -46],
  ['snowpine', -42, -42],
  ['snowpine', -60, 42],
  ['snowpine', -55, 46],
  ['snowpine', -22, 44],
  ['snowpine', -26, -46],
  ['teeth', -9, -26, 1],
  ['teeth', -9, 26, 1],
  ['tanktrap', -12, 0],
  ['drum', -62, -12],
  ['floodlight', -52, 0],
]

const WEST_SETS = [
  // The mountain station.
  ['logcabin', -68, -22, 0, { w: 8, d: 6 }],
  ['logcabin', -77, -6, 1, { w: 7, d: 5, color: '#7a5a3c' }],
  ['logcabin', -66, 26, 2, { w: 9, d: 6 }],
  ['radome', -80, 22, 0],
  ['tank', -80, -32, 0, { r: 2.2, h: 4, color: '#c9c4b8' }],
  ['snowcat', -58, -32, 0],
  ['fence', -70, -38, 0, { len: 22 }],
  ['lamp', -58, -3.5, 0],
]

const CENTRE = [box('wall', 0, -12, 0.8, 6), box('wall', 0, 12, 0.8, 6)]
const CENTRE_SETS = [['bridge', 1, 0, 0, { len: 10, w: 5 }]]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['rock', 2, -30], ['rubble', -3, 30]])
const westRoads = [{ width: 2.6, points: [[-88, -2], [-50, 0], [-20, 0], [-6, 0]] }]

export const WHITEOUT_PASS = {
  id: 'whiteout',
  name: 'Whiteout Pass',
  width: 170,
  depth: 110,
  bases: [
    { x: -70, z: 0 },
    { x: 70, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  roads: [...westRoads, ...westRoads.map(mirrorRoad)],
  ice: [{ width: 3.4, points: [[-6, -62], [-2, -24], [3, -6], [0, 18], [5, 62]] }],
  mud: [[-50, 0, 7], [-30, -28, 6], [-30, 28, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(100, 23, 85, 55),
  hills: [150, 250],
  hillScale: 1.4,
  theme: {
    grassA: '#e8edf0',
    grassB: '#dde5e9',
    dry: '#cdd7dd',
    outside: '#f2f5f7',
    mud: [168, 178, 188],
    road: [126, 130, 134],
    rut: [92, 96, 100],
    ice: [196, 224, 240],
    hillNear: '#e2e9ee',
    hillFar: '#f1f5f8',
    tree: 'snowpine',
    fence: '#5a4a3a',
    peak: '#ffffff',
    scatter: 'snow',
    clouds: 0.62,
    cloudColor: '#f3f6f9',
    ao: [70, 90, 112],
    sun: '#eef4ff',
    sunIntensity: 1.85,
    skyLight: '#e8f1ff',
    groundLight: '#b4c0ca',
    ambient: 1.4,
  },
  sky: { top: '#7ea5ce', horizon: '#e3ebf1', ground: '#e8edf0' },
  fog: '#e0e8ed',
}

export default WHITEOUT_PASS
