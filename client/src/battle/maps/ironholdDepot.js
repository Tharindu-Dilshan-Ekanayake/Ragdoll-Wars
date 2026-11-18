import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Ironhold Depot - an army supply depot. Each side holds a walled compound: two big
 * steel warehouses with their loading bays, a container yard stacked two high, a fuel
 * point, tents and a helipad behind a hesco wall with guard towers and a gate. Asphalt
 * roads with yellow lines run between them; the middle is a checkpoint of barriers and
 * blast walls round a container stack.
 */

const WEST = [
  // The warehouses and their loading bays.
  box('warehouse', -54, -34, 26, 12, 7, 0, { color: '#8d949a', roof: '#646b71' }),
  box('warehouse', -54, 34, 26, 12, 7, 0, { color: '#97907f', roof: '#6b665c' }),
  box('crate', -60, -25.5, 1.25, 1.25, 2.5),
  box('crate', -58.6, -25.5, 1.25, 1.25),
  box('crate', -48, -25.5, 1.25, 1.25, 2.5),
  box('crate', -60, 25.5, 1.25, 1.25),
  box('crate', -48, 25.5, 1.25, 1.25, 2.5),
  box('crate', -46.6, 25.5, 1.25, 1.25),
  // The container yard: stacks two high with gaps to fight through.
  box('container', -30, -16, 6.1, 2.5, 5.2, 0),
  box('container', -30, -12.9, 6.1, 2.5, 2.6, 2),
  box('container', -22, -18, 2.5, 6.1, 2.6, 1),
  box('container', -30, 16, 6.1, 2.5, 5.2, 3),
  box('container', -30, 12.9, 6.1, 2.5, 2.6, 1),
  box('container', -22, 18, 2.5, 6.1, 2.6, 2),
  box('container', -38, -46, 6.1, 2.5, 5.2, 2),
  box('container', -38, 46, 6.1, 2.5, 5.2, 0),
  // The compound wall's gatehouse and the gate's barriers.
  box('barrier', -66, -4, 0.7, 2.6),
  box('barrier', -66, 4, 0.7, 2.6),
  box('sandbag', -61, -8, 3, 0.9),
  box('sandbag', -61, 8, 3, 0.9),
  // Barracks behind the wall.
  box('shed', -80, -20, 7, 4.5, 3.4, 0, { color: '#7b8270', roof: '#4f5548' }),
  box('shed', -80, 20, 7, 4.5, 3.4, 0, { color: '#7b8270', roof: '#4f5548' }),
  box('tent', -74, -40, 4.2, 3.6),
  box('tent', -74, 40, 4.2, 3.6),
  // Out in the yard.
  box('barrier', -40, -4, 2.6, 0.7),
  box('barrier', -40, 4, 2.6, 0.7),
  box('sandbag', -14, -30, 0.9, 6),
  box('sandbag', -14, 30, 0.9, 6),
]

const WEST_PIECES = [
  // Hesco wall down the compound's front, a gate in the middle.
  ['sandwall', -67, -12, 1],
  ['sandwall', -67, -14.5, 1],
  ['sandwall', -67, -17, 1],
  ['sandwall', -67, -19.5, 1],
  ['sandwall', -67, 12, 1],
  ['sandwall', -67, 14.5, 1],
  ['sandwall', -67, 17, 1],
  ['sandwall', -67, 19.5, 1],
  ['tower', -68, -24],
  ['tower', -68, 24],
  ['tower', -82, -50],
  ['tower', -82, 50],
  ['helipad', -78, 0],
  ['floodlight', -72, -8],
  ['floodlight', -72, 8],
  ['floodlight', -40, -27],
  ['floodlight', -40, 27],
  ['radiomast', -84, -34],
  ['camonet', -60, -48],
  ['fuel', -44, 46],
  ['fuel', -44.9, 46.6],
  ['fuel', -43.2, 46.8],
  ['drum', -46, 47.5],
  ['drum', -46, -47.5],
  ['ammocrate', -64, -4],
  ['ammocrate', -64, 4, 1],
  ['carwreck', -46, -18, 1],
  ['carwreck', -46, 18, 1],
  ['pipes', -18, -44],
  ['pipes', -18, 44],
  ['blastwall', -8, -8, 1],
  ['blastwall', -8, 8, 1],
]

/** The checkpoint in the middle. */
const CENTRE = [
  box('container', 0, 0, 2.5, 6.1, 5.2, 0),
  box('barrier', 0, -12, 2.6, 0.7),
  box('barrier', 0, 12, 2.6, 0.7),
  box('lowwall', 0, -36, 6, 0.6),
  box('lowwall', 0, 36, 6, 0.6),
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, CENTRE, [['floodlight', 3, -4], ['floodlight', -3, 4], ['crate', 4, 20]])
const westRoads = [
  { width: 3.2, points: [[-40, -60], [-40, 60]] },
  { width: 2.4, points: [[-78, -30], [-78, 30]] },
]

export const IRONHOLD_DEPOT = {
  id: 'depot',
  name: 'Ironhold Depot',
  width: 170,
  depth: 110,
  bases: [
    { x: -72, z: 0 },
    { x: 72, z: 0 },
  ],
  obstacles,
  pieces,
  roads: [{ width: 4.2, points: [[-92, 0], [92, 0]] }, ...westRoads, ...westRoads.map(mirrorRoad)],
  mud: [[-54, -24, 5], [-54, 24, 5], [-30, 0, 6], [-10, -20, 5]].flatMap((p) => [p, mirrorPatch(p)]),
  trees: scatterTrees(70, 61, 85, 55),
  hills: [150, 250],
  hillScale: 0.9,
  theme: {
    grassA: '#787a75',
    grassB: '#83857e',
    dry: '#8e8b7d',
    outside: '#5f6c51',
    mud: [70, 68, 64],
    road: [56, 58, 60],
    rut: [214, 182, 72],
    hillNear: '#566650',
    hillFar: '#839580',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#8ea284',
    scatter: 'ruins',
    clouds: 0.5,
    ao: [24, 24, 26],
    sun: '#fff1dc',
    sunIntensity: 2.05,
    skyLight: '#dde8f2',
    groundLight: '#5c5a54',
    ambient: 1.25,
  },
  sky: { top: '#6a9ccb', horizon: '#d2dde2', ground: '#7d7f78' },
  fog: '#cdd6d9',
}

export default IRONHOLD_DEPOT
