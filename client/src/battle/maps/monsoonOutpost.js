import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Monsoon Outpost - two jungle camps either side of a misty brown river. Each camp is a
 * log stockade: stilt huts with thatched roofs round a helipad, a longhouse, watchtowers
 * at the corners and the gate. The river can only be crossed at three places - the plank
 * bridge on the main trail, a rope footbridge to the south and a muddy ford to the north -
 * so the fight is for those. Between camp and river: jungle groves (the trees are real
 * cover), an overgrown temple ruin and a lookout hut over the bridge.
 */

/** A grove of jungle trees (cover) around (x, z). */
function thicket(x, z, n, spread, seed) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    const a = (i * 2.399 + seed) % (Math.PI * 2)
    const r = spread * Math.sqrt((i + 0.5) / n)
    out.push(box('tree', x + Math.cos(a) * r, z + Math.sin(a) * r, 0.8, 0.8))
  }
  return out
}

const WEST = [
  // Sandbags in front of the stockade gate, stores inside it.
  box('sandbag', -55, -10, 0.9, 5),
  box('sandbag', -55, 10, 0.9, 5),
  box('crate', -64, -5, 1.25, 1.25, 2.5),
  box('crate', -64, 5, 1.25, 1.25),
  box('tent', -66, -14, 4.2, 3.6),
  box('tent', -66, 14, 4.2, 3.6),
  // Jungle groves.
  ...thicket(-44, 24, 8, 6, 0.3),
  ...thicket(-26, 42, 6, 5, 1.1),
  ...thicket(-50, -44, 6, 4.5, 2),
  ...thicket(-47, -14, 4, 3, 3.3),
]

const WEST_PIECES = [
  ['tower', -60, -32],
  ['tower', -60, 32],
  ['tower', -63, -9],
  ['helipad', -72, 0],
  ['camonet', -67, -21],
  ['floodlight', -65, -2],
  ['floodlight', -65, 2],
  ['radiomast', -84, 40],
  ['ammocrate', -68, -8],
  ['drum', -76, -10],
  ['drum', -76.9, -10.5],
  ['fuel', -76, 10],
  ['fuel', -76.8, 10.6],
  // Out in the jungle: rocks, bushes, the bridgehead's sandbags, the ford's stones.
  ['rock', -32, 14],
  ['rock', -10, 16],
  ['rock', -7, 27],
  ['rock', -38, -24],
  ['bush', -30, 22],
  ['bush', -46, 8],
  ['bush', -24, -16],
  ['bush', -18, 34],
  ['bush', -8, -44],
  ['bush', -42, 44],
  ['sandbags', -11, -6, 1],
  ['sandbags', -11, 6, 1],
]

const WEST_SETS = [
  // The stockade: log walls with a gate facing the river.
  ['palisade', -60, -18.5, 1, { len: 23 }],
  ['palisade', -60, 18.5, 1, { len: 23 }],
  ['palisade', -72.5, -30, 0, { len: 25 }],
  ['palisade', -72.5, 30, 0, { len: 25 }],
  // Huts on stilts round the helipad, the longhouse at the back.
  ['stilthut', -79, -20, 1, { w: 7, d: 5 }],
  ['stilthut', -79, 20, 1, { w: 7, d: 5 }],
  ['stilthut', -70, -24, 0, { w: 6, d: 4.5 }],
  ['stilthut', -70, 24, 2, { w: 6, d: 4.5 }],
  ['stilthut', -82, 0, 1, { w: 10, d: 5, roof: '#a89052' }],
  // The lookout over the bridge and the temple ruin in the jungle.
  ['stilthut', -14, -12, 1, { w: 5, d: 4 }],
  ['ruins', -34, -34, 0],
]

const CENTRE_SETS = [
  // Plank bridge on the main trail, rope footbridge to the south (the ford is open water's edge).
  ['bridge', 0, 0, 0, { len: 16, w: 6 }],
  ['bridge', 0, -32, 0, { len: 15, w: 3.4, rope: true }],
  ['boat', 0, -18, 1],
  ['boat', 0.5, 45, 3],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [], [])
const westTrails = [
  { width: 2.2, points: [[-90, 0], [-58, 0], [-40, 4], [-20, 1], [-8, 0]] },
  { width: 1.6, points: [[-40, 4], [-28, -16], [-14, -30], [-7, -32]] },
  { width: 1.6, points: [[-20, 1], [-16, 18], [-6, 30]] },
]

export const MONSOON_OUTPOST = {
  id: 'jungle',
  name: 'Monsoon Outpost',
  width: 170,
  depth: 110,
  bases: [
    { x: -72, z: 0 },
    { x: 72, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  // The river: four reaches with muddy banks; the crossings are the bridges and the ford.
  water: [
    { x: 0, z: -49.9, w: 12, d: 32.4, bank: true },
    { x: 0, z: -16.65, w: 10, d: 27.3, bank: true },
    { x: 0, z: 14.75, w: 11.5, d: 23.5, bank: true },
    { x: 0, z: 30, w: 11.5, d: 7, bank: true, ford: true },
    { x: 0, z: 49.8, w: 11.5, d: 32.6, bank: true },
  ],
  roads: [...westTrails, ...westTrails.map(mirrorRoad)],
  mud: [[-58, 0, 6], [-40, 4, 5], [-24, 2, 5], [-72, 0, 9], [-28, -16, 4]].flatMap((p) => [p, mirrorPatch(p)]).concat([[0, 30, 7]]),
  trees: scatterTrees(50, 71, 85, 55),
  hills: [150, 250],
  hillScale: 1.5,
  mist: { x0: -22, x1: 22 },
  theme: {
    grassA: '#3f6a2e',
    grassB: '#4e7c36',
    dry: '#6a7a3a',
    outside: '#2f5226',
    mud: [92, 66, 40],
    road: [118, 86, 54],
    rut: [82, 60, 38],
    ice: [58, 98, 92],
    hillNear: '#2e5a2a',
    hillFar: '#5a8a6a',
    tree: 'broadleaf',
    trunk: '#5a4632',
    fence: '#6b5038',
    peak: '#4e7c48',
    scatter: 'jungle',
    clouds: 0.55,
    cloudColor: '#eef3ee',
    ao: [18, 30, 14],
    sun: '#fff0cf',
    sunIntensity: 1.95,
    skyLight: '#dcefe2',
    groundLight: '#3e5a32',
    ambient: 1.2,
  },
  sky: { top: '#6aa0c8', horizon: '#cfe0d6', ground: '#4a6a3e' },
  fog: '#b8cdbe',
  fogRange: [70, 240],
}

export default MONSOON_OUTPOST
