import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, scatterTrees } from './mapKit.js'

/**
 * Saltmarsh Landing - a defended beach with the open sea along the north edge. Landing
 * craft lie beached at the waterline, ramps down, among hedgehogs, dragon's teeth and
 * lines of barbed wire. Above the sand each side has a concrete gun casemate and a
 * bunker in the dunes with sandbag nests; behind them a coast road, a few beach houses,
 * a lighthouse on the point and a camp in the palms.
 */

const WEST = [
  box('sandbag', -50, -14, 6, 0.9),
  box('sandbag', -53, -11, 0.9, 6),
  box('sandbag', -36, 10, 0.9, 7),
  box('container', -66, 22, 6.1, 2.5, 2.6, 1),
  box('crate', -44, 22, 1.25, 1.25, 2.5),
  box('crate', -42.6, 22, 1.25, 1.25),
  box('barrier', -22, -26, 2.6, 0.7),
  box('barrier', -22, 2, 0.7, 2.6),
  box('tent', -76, 44, 4.2, 3.6),
  box('tent', -70, 47, 4.2, 3.6),
]

const WEST_PIECES = [
  ['bunker', -46, 4],
  ['dune', -58, 12],
  ['dune', -30, 26],
  ['dune', -14, 44, 1],
  ['tanktrap', -44, -47],
  ['tanktrap', -28, -44],
  ['tanktrap', -18, -48],
  ['teeth', -54, -47],
  ['teeth', -9, -46],
  ['palm', -66, 50],
  ['palm', -58, 49],
  ['palm', -24, 50],
  ['carwreck', -26, -12],
  ['drum', -48, 28],
  ['fuel', -66, 10],
  ['sandwall', -34, -20],
]

const WEST_SETS = [
  // The gun casemate looking out to sea, wire lines across the sand.
  ['casemate', -56, -30, 2],
  ['wire', -44, -38, 0, { len: 12 }],
  ['wire', -24, -36, 0, { len: 10 }],
  ['wire', -66, -40, 0, { len: 10 }],
  ['lighthouse', -80, -46, 0],
  // Beach houses on the coast road, the camp's lorry.
  ['house', -48, 40, 2, { w: 7, d: 6, color: '#e8e0cc', awning: '#3f7aa8' }],
  ['house', -38, 42, 2, { w: 6, d: 6, floors: 2, color: '#d8c8a8' }],
  ['house', -24, 40, 2, { w: 6, d: 5, color: '#e3d3b8', awning: '#c43a30' }],
  ['truck', -76, 30, 0, { color: '#5d6b4a' }],
  ['lamp', -40, 31, 2],
]

// The landing craft keep their bows pointing up the beach on both sides (not mirrored).
const CENTRE_SETS = [
  ['landingcraft', -36, -55, 3],
  ['landingcraft', 36, -55, 3],
  ['landingcraft', -6, -56, 3],
]

const CENTRE_PIECES = [
  ['rubble', 0, -24],
  ['dune', 0, 20],
  ['tanktrap', 6, -42],
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
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
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
    peak: '#b9c08e',
    scatter: 'beach',
    clouds: 0.34,
    ao: [92, 72, 40],
    sun: '#fff1d8',
    sunIntensity: 2.2,
    skyLight: '#e2f1ff',
    groundLight: '#a89a70',
    ambient: 1.2,
  },
  sky: { top: '#4f93db', horizon: '#d8ecf6', ground: '#d6be88' },
  fog: '#d4e5ee',
}

export default SALTMARSH_LANDING
