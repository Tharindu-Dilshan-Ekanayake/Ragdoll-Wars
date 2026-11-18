import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Dustbowl Ridge - a sun-baked desert valley. Each side has a gabion line, a stone
 * compound with tents behind it, and rock outcrops on the flanks; dunes give cover in
 * the open ground, and the middle is an old walled fort round a palm oasis.
 */

const WEST = [
  // Stone compound and its tents.
  box('lowwall', -56, 8, 11, 0.6),
  box('lowwall', -61.2, 2.8, 0.6, 10.4),
  box('lowwall', -56, -8, 11, 0.6),
  box('tent', -68, 14, 4.2, 3.6),
  box('tent', -68, -14, 4.2, 3.6),
  box('crate', -52, 4, 1.25, 1.25),
  box('crate', -50.6, 4, 1.25, 1.25, 2.5),
  box('container', -32, 24, 6.1, 2.5, 2.6, 3),
  box('container', -36, -26, 2.5, 6.1, 2.6, 0),
  box('sandbag', -24, 10, 0.9, 6),
  box('sandbag', -24, -10, 0.9, 6),
  box('barrier', -44, 0, 0.7, 2.6),
  box('shed', -74, 38, 6, 5),
]

const WEST_PIECES = [
  ['sandwall', -42, -8, 1],
  ['sandwall', -42, -10.5, 1],
  ['sandwall', -42, 8, 1],
  ['sandwall', -42, 10.5, 1],
  ['rock', -60, -26],
  ['rock', -62.5, -23],
  ['rock', -57, -29],
  ['rock', -46, 31],
  ['rock', -49, 33.5],
  ['rock', -44, 35],
  ['dune', -22, -38],
  ['dune', -26, 40],
  ['dune', -12, 24, 1],
  ['cactus', -34, 38],
  ['cactus', -64, -40],
  ['cactus', -18, -22],
  ['drum', -53, -4],
  ['drum', -53.9, -4.6],
  ['fuel', -66, 2],
  ['carwreck', -30, 4, 1],
]

const CENTRE = [
  // The old fort: four broken walls round the oasis, open on every side.
  box('wall', -5.5, -8, 5, 0.8),
  box('wall', 5.5, -8, 5, 0.8),
  box('wall', -5.5, 8, 5, 0.8),
  box('wall', 5.5, 8, 5, 0.8),
  box('wall', -8, 0, 0.8, 6),
  box('wall', 8, 0, 0.8, 6),
]

const CENTRE_PIECES = [
  ['palm', -3, -3],
  ['palm', 3.5, 2.5],
  ['palm', -2, 4],
  ['palm', 12, -14],
  ['palm', -12, 14],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, CENTRE_PIECES)
const westRoads = [{ width: 2.4, points: [[-92, 2], [-60, 0], [-30, 2], [-9, 0]] }]

export const DUSTBOWL_RIDGE = {
  id: 'dustbowl',
  name: 'Dustbowl Ridge',
  width: 180,
  depth: 110,
  bases: [
    { x: -72, z: 0 },
    { x: 72, z: 0 },
  ],
  obstacles,
  pieces,
  roads: [...westRoads, ...westRoads.map(mirrorRoad), { width: 2, points: [[0, -60], [0, -9]] }, { width: 2, points: [[0, 9], [0, 60]] }],
  mud: [[-56, 0, 8], [-24, -30, 7], [-40, 30, 6]].flatMap((p) => [p, mirrorPatch(p)]).concat([[0, 0, 7]]),
  trees: scatterTrees(55, 11, 90, 55),
  hills: [150, 250],
  theme: {
    grassA: '#c9a46a',
    grassB: '#dab97f',
    dry: '#b88f58',
    outside: '#c39c62',
    mud: [150, 116, 76],
    road: [178, 152, 112],
    rut: [140, 110, 76],
    hillNear: '#b98b58',
    hillFar: '#d4b689',
    tree: 'cactus',
    fence: '#8a6a48',
  },
  sky: { top: '#5d98d6', horizon: '#f1ddb6', ground: '#c9a46a' },
  fog: '#e9d6b2',
}

export default DUSTBOWL_RIDGE
