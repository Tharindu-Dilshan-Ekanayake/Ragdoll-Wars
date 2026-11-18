import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Monsoon Outpost - a jungle camp each side of a misty river. Each outpost is a
 * clearing behind a palisade and sandbag walls: stilt huts with thatched roofs, tents
 * under camo nets, two watchtowers and a helipad. Between them, thick jungle (the trees
 * are real cover), muddy trails to the fords, and an old overgrown ruin on each bank.
 */

/** A thicket of jungle trees (cover) around (x, z). */
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
  // The outpost: stilt huts and tents.
  box('shed', -76, -22, 6, 4.5, 3.2, 0, { color: '#7a5c3c', roof: '#b39a5a' }),
  box('shed', -76, 22, 6, 4.5, 3.2, 0, { color: '#7a5c3c', roof: '#b39a5a' }),
  box('shed', -82, 0, 5, 7, 3.2, 0, { color: '#6e5236', roof: '#a89052' }),
  box('tent', -66, -34, 4.2, 3.6),
  box('tent', -66, 34, 4.2, 3.6),
  box('tent', -72, -40, 4.2, 3.6),
  box('tent', -72, 40, 4.2, 3.6),
  // Sandbag walls at the camp's mouth.
  box('sandbag', -58, -10, 0.9, 6),
  box('sandbag', -58, 10, 0.9, 6),
  box('sandbag', -54, -2, 3, 0.9),
  box('crate', -64, -6, 1.25, 1.25, 2.5),
  box('crate', -64, 6, 1.25, 1.25),
  // Jungle.
  ...thicket(-40, -30, 8, 6, 0.3),
  ...thicket(-40, 30, 8, 6, 1.1),
  ...thicket(-28, -6, 6, 4.5, 2.0),
  ...thicket(-22, -44, 6, 5.5, 2.6),
  ...thicket(-22, 44, 6, 5.5, 3.3),
  ...thicket(-50, -48, 6, 4, 4.1),
  ...thicket(-50, 48, 6, 4, 4.9),
  ...thicket(-14, 20, 5, 3.5, 5.5),
]

const WEST_PIECES = [
  // Palisade (fence lines) round the camp, a gap at the front.
  ['fence', -60, -16, 1],
  ['fence', -60, -20, 1],
  ['fence', -60, -24, 1],
  ['fence', -60, -28, 1],
  ['fence', -60, 16, 1],
  ['fence', -60, 20, 1],
  ['fence', -60, 24, 1],
  ['fence', -60, 28, 1],
  ['tower', -62, -32],
  ['tower', -62, 32],
  ['helipad', -74, 0],
  ['camonet', -68, -14],
  ['camonet', -68, 14],
  ['floodlight', -66, -2],
  ['floodlight', -66, 2],
  ['radiomast', -84, 40],
  ['ammocrate', -70, -8],
  ['drum', -80, -10],
  ['drum', -80.9, -10.5],
  ['fuel', -80, 10],
  // The old ruin on this bank, and the trail to the ford.
  ['ruin', -16, -24],
  ['rubble', -12, -30],
  ['rock', -32, 14],
  ['rock', -10, 6],
  ['rock', -36, -16],
  ['bush', -30, 22],
  ['bush', -46, 8],
  ['bush', -26, -20],
  ['bush', -18, 34],
  ['bush', -48, -20],
  ['bush', -8, -46],
  ['sandbags', -12, -6, 1],
  ['sandbags', -12, 10, 1],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [], [['rock', 0, -18], ['rock', 2, 26]])
const westTrails = [{ width: 2.0, points: [[-90, 0], [-58, 0], [-40, 6], [-24, 2], [-4, 8]] }]

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
  roads: [...westTrails, ...westTrails.map(mirrorRoad)],
  // The river down the middle (painted as water), with misty air over it.
  ice: [{ width: 3.6, points: [[4, -60], [-3, -36], [5, -14], [-2, 8], [4, 30], [-3, 60]] }],
  mud: [[-58, 0, 6], [-40, 6, 5], [-24, 2, 5], [-6, 8, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(70, 71, 85, 55),
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
