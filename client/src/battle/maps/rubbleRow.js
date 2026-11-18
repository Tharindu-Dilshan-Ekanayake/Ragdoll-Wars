import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Rubble Row - a bombed-out town. Streets of cracked asphalt run between blocks of
 * ruined houses; burnt-out cars, rubble piles and roadblocks give cover in the streets,
 * and each side has a barricaded square at its end of the main road.
 */

const WEST = [
  // Barricaded square.
  box('sandbag', -58, -6, 0.9, 6),
  box('sandbag', -58, 6, 0.9, 6),
  box('barrier', -52, -12, 2.6, 0.7),
  box('barrier', -52, 12, 2.6, 0.7),
  box('container', -70, -18, 6.1, 2.5, 2.6, 2),
  box('container', -70, 18, 6.1, 2.5, 2.6, 0),
  box('crate', -64, 0, 1.25, 1.25, 2.5),
  // Roadblocks.
  box('barrier', -30, -3, 0.7, 2.6),
  box('barrier', -16, 3, 0.7, 2.6),
  box('lowwall', -40, -30, 0.6, 6),
  box('lowwall', -40, 30, 0.6, 6),
  box('post', -28, 14, 0.25, 0.25, 6, 0, { color: '#55595e' }),
  box('post', -28, -14, 0.25, 0.25, 6, 0, { color: '#55595e' }),
]

const WEST_PIECES = [
  ['ruin', -56, -32],
  ['ruin', -56, 32],
  ['ruin', -36, -42, 1],
  ['ruin', -36, 42, 1],
  ['ruin', -18, -28],
  ['ruin', -18, 28],
  ['carwreck', -44, 2],
  ['carwreck', -24, -16, 1],
  ['carwreck', -10, 18],
  ['rubble', -48, -18],
  ['rubble', -46, 20],
  ['rubble', -26, 8],
  ['rubble', -12, -10],
  ['deadtree', -66, 42],
  ['deadtree', -66, -42],
  ['drum', -54, 0],
  ['fuel', -62, 10],
]

const CENTRE = [box('wall', 0, -18, 6, 0.8), box('wall', 0, 18, 6, 0.8)]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['rubble', 0, 0], ['carwreck', 0, -40], ['carwreck', 3, 40, 1]])
const westRoads = [{ width: 3.6, points: [[-30, -60], [-30, 60]] }]

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
  roads: [{ width: 4.2, points: [[-90, 0], [90, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad), { width: 3, points: [[0, -60], [0, 60]] }],
  mud: [[-50, 0, 6], [-20, -40, 6], [-20, 40, 6]].flatMap((p) => [p, mirrorPatch(p)]),
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
  },
  sky: { top: '#7d97b3', horizon: '#d8d4ca', ground: '#8e8b85' },
  fog: '#cac7bf',
}

export default RUBBLE_ROW
