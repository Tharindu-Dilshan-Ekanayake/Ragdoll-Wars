import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Rustline Yard - an abandoned industrial scrapyard, each end now an army camp. Rusted
 * sheds and stacked containers, rows of car wrecks, heaps of scrap and stacks of pipes
 * make a maze of cover under a dusty orange sky; each camp sits behind hesco and
 * sandbags with towers, tents and a helipad on the old loading apron.
 */

const RUST = '#8a5a3c'
const RUST_ROOF = '#6a4630'

const WEST = [
  // The rusted works sheds.
  box('warehouse', -56, -36, 20, 11, 6.5, 0, { color: RUST, roof: RUST_ROOF, door: '#5a4434' }),
  box('warehouse', -40, 38, 11, 18, 6, 0, { color: '#7d6448', roof: '#5a4434', door: '#4e3e30' }),
  box('shed', -24, -40, 6, 4.5, 3.4, 0, { color: '#7a5a42', roof: '#6a4630' }),
  // Container stacks, rust red and faded ochre.
  box('container', -36, -14, 6.1, 2.5, 5.2, 0),
  box('container', -36, -11, 6.1, 2.5, 2.6, 3),
  box('container', -36, 14, 6.1, 2.5, 2.6, 0),
  box('container', -26, 22, 2.5, 6.1, 5.2, 3),
  box('container', -18, -22, 2.5, 6.1, 2.6, 0),
  box('container', -48, 4, 2.5, 6.1, 2.6, 3),
  // The camp.
  box('tent', -76, -24, 4.2, 3.6),
  box('tent', -76, 24, 4.2, 3.6),
  box('tent', -82, -14, 4.2, 3.6),
  box('tent', -82, 14, 4.2, 3.6),
  box('sandbag', -62, -8, 0.9, 6),
  box('sandbag', -62, 8, 0.9, 6),
  box('barrier', -66, 0, 0.7, 2.6),
  box('crate', -70, -6, 1.25, 1.25, 2.5),
  box('crate', -70, 6, 1.25, 1.25),
  // Scrap lines.
  box('lowwall', -30, -50, 6, 0.6),
  box('lowwall', -30, 50, 6, 0.6),
]

const WEST_PIECES = [
  ['sandwall', -64, -14, 1],
  ['sandwall', -64, -16.5, 1],
  ['sandwall', -64, -19, 1],
  ['sandwall', -64, 14, 1],
  ['sandwall', -64, 16.5, 1],
  ['sandwall', -64, 19, 1],
  ['tower', -66, -24],
  ['tower', -66, 24],
  ['helipad', -76, 0],
  ['floodlight', -70, -12],
  ['floodlight', -70, 12],
  ['radiomast', -84, -40],
  ['camonet', -78, 38],
  // The junkyard: wrecks in rows, scrap heaps, pipes, drums.
  ['carwreck', -44, -20, 1],
  ['carwreck', -40, -26],
  ['carwreck', -22, 4, 1],
  ['carwreck', -14, -8],
  ['carwreck', -10, 30, 1],
  ['carwreck', -50, 22],
  ['rubble', -30, -2],
  ['rubble', -46, -48],
  ['rubble', -14, 44],
  ['rubble', -20, -32],
  ['rubble', -56, 14],
  ['pipes', -28, 32],
  ['pipes', -52, -22],
  ['pipes', -8, -20],
  ['drum', -32, 6],
  ['drum', -32.9, 6.5],
  ['fuel', -42, -6],
  ['fuel', -42.9, -5.5],
  ['drum', -20, 14],
  ['tanktrap', -6, -36],
  ['tanktrap', -6, 40],
  ['deadtree', -60, 46],
  ['deadtree', -12, -50],
]

const CENTRE = [box('container', 0, -10, 2.5, 6.1, 5.2, 0), box('container', 0, 12, 2.5, 6.1, 2.6, 3)]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['rubble', 0, 30], ['rubble', 0, -32], ['carwreck', 3, 0, 1]])
const westRoads = [{ width: 3, points: [[-56, -60], [-56, -30], [-36, 0], [-36, 60]] }]

export const RUSTLINE_YARD = {
  id: 'rustyard',
  name: 'Rustline Yard',
  width: 170,
  depth: 110,
  bases: [
    { x: -72, z: 0 },
    { x: 72, z: 0 },
  ],
  obstacles,
  pieces,
  roads: [{ width: 3.6, points: [[-92, 0], [92, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad)],
  mud: [[-44, -14, 7], [-26, 10, 6], [-14, -36, 6], [-60, 30, 6]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(50, 81, 85, 55),
  hills: [150, 250],
  hillScale: 1.1,
  theme: {
    grassA: '#7a5f44',
    grassB: '#86694b',
    dry: '#706a4f',
    outside: '#5f5a41',
    mud: [88, 60, 40],
    road: [98, 86, 72],
    rut: [70, 56, 44],
    hillNear: '#6e5a44',
    hillFar: '#a3917c',
    tree: 'dead',
    trunk: '#4e3e30',
    fence: '#6b4a34',
    peak: '#ad9a84',
    scatter: 'scrap',
    clouds: 0.38,
    cloudColor: '#efdcc4',
    ao: [40, 24, 14],
    sun: '#ffd9a8',
    sunIntensity: 2.1,
    skyLight: '#f4e2c8',
    groundLight: '#7a5a3c',
    ambient: 1.2,
  },
  sky: { top: '#7a9cc2', horizon: '#e4c9a4', ground: '#86694b' },
  fog: '#d6bc9c',
}

export default RUSTLINE_YARD
