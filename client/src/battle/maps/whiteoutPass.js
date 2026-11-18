import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Whiteout Pass - a snowbound mountain pass split by a frozen creek. Each side holds a
 * log cabin, a bunker and a watchtower behind sandbag lines; stands of snowy pines on
 * the flanks hide flanking runs, and dragon's teeth guard the creek crossings.
 */

const WEST = [
  box('shed', -66, -20, 7, 5),
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
  ['snowpine', -52, -40],
  ['snowpine', -47, -43],
  ['snowpine', -56, -45],
  ['snowpine', -44, -38],
  ['snowpine', -60, 40],
  ['snowpine', -55, 44],
  ['snowpine', -64, 45],
  ['snowpine', -22, 44],
  ['snowpine', -26, -46],
  ['teeth', -9, -26, 1],
  ['teeth', -9, 26, 1],
  ['tanktrap', -12, 0],
  ['drum', -62, -10],
  ['fence', -66, -30],
  ['fence', -61.9, -30],
]

const CENTRE = [box('wall', 0, -12, 0.8, 6), box('wall', 0, 12, 0.8, 6)]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['rock', 2, 0], ['rubble', -3, 30]])
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
  roads: [...westRoads, ...westRoads.map(mirrorRoad)],
  ice: [{ width: 3.4, points: [[-6, -62], [-2, -24], [3, -6], [0, 18], [5, 62]] }],
  mud: [[-50, 0, 7], [-30, -28, 6], [-30, 28, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(120, 23, 85, 55),
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
