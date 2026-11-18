import { box, mirrored, mirrorPatch, scatterTrees } from './mapKit.js'

/**
 * Saltmarsh Landing - a long beach with the open sea along the north edge. Each side has
 * a pair of bunkers dug into the dunes and sandbag nests; tank traps and dragon's teeth
 * litter the wet sand at the waterline, and grassy dunes to the south make a covered
 * route round the flank.
 */

const WEST = [
  box('sandbag', -50, -14, 6, 0.9),
  box('sandbag', -53, -11, 0.9, 6),
  box('sandbag', -36, 10, 0.9, 7),
  box('container', -64, 26, 6.1, 2.5, 2.6, 1),
  box('crate', -44, 24, 1.25, 1.25, 2.5),
  box('crate', -42.6, 24, 1.25, 1.25),
  box('barrier', -22, -30, 2.6, 0.7),
  box('barrier', -22, 2, 0.7, 2.6),
  box('tent', -70, 40, 4.2, 3.6),
]

const WEST_PIECES = [
  ['bunker', -60, -26],
  ['bunker', -46, 4],
  ['dune', -58, 12],
  ['dune', -30, 32],
  ['dune', -14, 42, 1],
  ['dune', -44, 44],
  ['tanktrap', -40, -44],
  ['tanktrap', -30, -46],
  ['tanktrap', -20, -43],
  ['teeth', -50, -46],
  ['teeth', -10, -46],
  ['palm', -66, 46],
  ['palm', -56, 48],
  ['palm', -28, 48],
  ['carwreck', -26, -12],
  ['drum', -48, 30],
  ['fuel', -66, 10],
  ['sandwall', -34, -20],
]

const CENTRE_PIECES = [
  ['rubble', 0, -24],
  ['dune', 0, 20],
  ['tanktrap', 0, -45],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [box('wall', 0, -4, 6, 0.8, 2.2)], CENTRE_PIECES)
const SEA_Z = -62

export const SALTMARSH_LANDING = {
  id: 'saltmarsh',
  name: 'Saltmarsh Landing',
  width: 170,
  depth: 110,
  bases: [
    { x: -70, z: 6 },
    { x: 70, z: 6 },
  ],
  obstacles,
  pieces,
  roads: [{ width: 2.2, points: [[-90, 34], [-40, 30], [0, 34], [40, 30], [90, 34]] }],
  // Wet sand along the water.
  mud: [[-60, -50, 12], [-25, -52, 12], [0, -52, 12], [-45, 0, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  sea: { z: SEA_Z },
  trees: scatterTrees(70, 31, 85, 55, (x, z) => z < SEA_Z + 8),
  hills: [150, 250],
  theme: {
    grassA: '#d6be88',
    grassB: '#e1cc97',
    dry: '#a9ad6c',
    outside: '#c9b07a',
    mud: [168, 146, 108],
    road: [152, 132, 98],
    rut: [120, 104, 78],
    hillNear: '#8f9a62',
    hillFar: '#a9b38a',
    tree: 'palm',
    fence: '#8a6a48',
  },
  sky: { top: '#4f93db', horizon: '#d8ecf6', ground: '#d6be88' },
  fog: '#d4e5ee',
}

export default SALTMARSH_LANDING
