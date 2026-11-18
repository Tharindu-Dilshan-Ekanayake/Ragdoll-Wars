import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrored, mirrorPatch, mirrorRoad, scatterTrees } from './mapKit.js'

/**
 * Dustbowl Ridge - a sun-baked desert valley. In the middle stands an old mud-brick fort
 * with round corner towers and a gate in every wall, a palm oasis pool inside it. Each
 * army holds a forward operating base at its end of the valley: a hesco wall with guard
 * towers, big canvas tents, a comms radar, lorries and a helipad. Between them, a ruined
 * hamlet, rock outcrops and dunes.
 */

const WEST = [
  box('crate', -64, 4, 1.25, 1.25),
  box('crate', -64, 5.4, 1.25, 1.25, 2.5),
  box('container', -32, 22, 6.1, 2.5, 2.6, 3),
  box('container', -42, -24, 2.5, 6.1, 2.6, 0),
  box('sandbag', -24, 10, 0.9, 6),
  box('sandbag', -24, -10, 0.9, 6),
  box('barrier', -50, 0, 0.7, 2.6),
  // The hamlet's yard walls.
  box('lowwall', -36, 38, 8, 0.6, 1.6, 0, { color: '#bfa077' }),
  box('lowwall', -38, -40, 0.6, 7, 1.6, 0, { color: '#bfa077' }),
]

const WEST_PIECES = [
  // The FOB's hesco wall, a gate on the road.
  ...[6, 8.5, 11, 13.5, 16].flatMap((z) => [
    ['sandwall', -58, z, 1],
    ['sandwall', -58, -z, 1],
  ]),
  ['tower', -58, 20],
  ['tower', -58, -20],
  ['helipad', -78, 0],
  ['floodlight', -62, -6],
  ['floodlight', -62, 6],
  ['rock', -50, -30],
  ['rock', -52.5, -27],
  ['rock', -47, -33],
  ['rock', -46, 31],
  ['rock', -49, 33.5],
  ['rock', -14, -44],
  ['dune', -10, -34],
  ['dune', -16, 42],
  ['dune', -12, 24, 1],
  ['cactus', -30, 48],
  ['cactus', -64, -42],
  ['cactus', -18, -22],
  ['drum', -66, -26],
  ['drum', -66.9, -26.6],
  ['fuel', -66, 26],
  ['carwreck', -30, 4, 1],
]

const WEST_SETS = [
  ['bigtent', -74, -14, 0, { w: 9, d: 6 }],
  ['bigtent', -74, 14, 2, { w: 9, d: 6, color: '#9a8a64' }],
  ['radar', -82, -32, 0],
  ['truck', -70, 32, 0, { color: '#b8a07a' }],
  ['truck', -70, 36, 2, { color: '#a89068' }],
  ['tank', -82, 32, 0, { r: 2, h: 3.4, color: '#b8a07a' }],
  // The ruined hamlet.
  ['house', -34, 31, 2, { w: 7, d: 6 }],
  ['house', -25, 34, 2, { w: 6, d: 6, floors: 2 }],
  ['house', -32, -32, 0, { w: 8, d: 6 }],
  ['house', -24, -36, 0, { w: 6, d: 6 }],
]

const CENTRE_SETS = [['fort', 0, 0, 0, { s: 26 }]]

const CENTRE_PIECES = [
  ['palm', -6, -5],
  ['palm', 6, 5],
  ['palm', -5.5, 6],
  ['palm', 5, -6.5],
  ['palm', 18, -16],
  ['palm', -18, 16],
]

const { obstacles, pieces } = mirrored(WEST, WEST_PIECES, [], CENTRE_PIECES)
const westRoads = [{ width: 2.4, points: [[-92, 2], [-60, 0], [-30, 2], [-13, 0]] }]
const mirrorPad = (p) => ({ ...p, x: -p.x })

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
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  water: [{ x: 0, z: 0, w: 8, d: 5, bank: true }],
  pads: [...[{ x: -72, z: 0, w: 22, d: 34, color: '#c2a273', joints: 0 }].flatMap((p) => [p, mirrorPad(p)])],
  roads: [...westRoads, ...westRoads.map(mirrorRoad), { width: 2, points: [[0, -60], [0, -13]] }, { width: 2, points: [[0, 13], [0, 60]] }],
  mud: [[-30, 34, 7], [-28, -34, 7], [-56, 0, 6]].flatMap((p) => [p, mirrorPatch(p)]),
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
    peak: '#e8cf9e',
    scatter: 'desert',
    clouds: 0.14,
    ao: [96, 66, 34],
    sun: '#ffe4bc',
    sunIntensity: 2.35,
    skyLight: '#fff0d6',
    groundLight: '#a0804e',
    ambient: 1.15,
  },
  sky: { top: '#5d98d6', horizon: '#f1ddb6', ground: '#c9a46a' },
  fog: '#e9d6b2',
}

export default DUSTBOWL_RIDGE
