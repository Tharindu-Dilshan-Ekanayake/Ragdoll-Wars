import { box, scatterTrees } from './mapKit.js'

/**
 * Mirefall Bastion - Zombie Horde's battlefield. A stone rampart runs the width of a
 * drowned marsh; your camp is behind it, the mist and the dead come from the east.
 * Troops dropped on the rampart stand on top and shoot down into the horde; the
 * zombies can't climb it, so they batter at its face until a section gives way (sim:
 * rampart.js, zombies.js). Two stairs at the back let you walk up yourself.
 *
 * The rampart is six 25 m sections, 8 m thick and 4.5 m high, with a parapet along
 * the front edge, spanning the valley from side to side; past the battlefield it runs
 * on into the ridges (scenery: `wings`). Out in the marsh: a drowned village with its
 * church, boats sunk in the channels, a dead wood.
 */

const WALL_X0 = -42
const WALL_X1 = -34
const WALL_H = 4.5
const SECTION = 25
const SECTIONS = 6
const HALF_D = (SECTION * SECTIONS) / 2

const rampart = []
for (let i = 0; i < SECTIONS; i += 1) {
  const z = -HALF_D + SECTION * (i + 0.5)
  rampart.push(box('rampart', (WALL_X0 + WALL_X1) / 2, z, WALL_X1 - WALL_X0, SECTION, WALL_H, 0, { rampart: 'deck', deck: true, seg: i }))
  rampart.push(box('rampart', WALL_X1 - 0.25, z, 0.5, SECTION, WALL_H + 1.0, 0, { rampart: 'parapet', deck: true, seg: i }))
}
// Stairs up the back of the second and fourth sections: nine 0.5 m steps.
for (const z of [-37.5, 0, 37.5]) {
  for (let k = 1; k <= 9; k += 1) {
    rampart.push(box('rampart', WALL_X0 - (9 - k) * 0.8 - 0.4, z, 0.8, 2.6, k * 0.5, 0, { rampart: 'step' }))
  }
}

/** The camp behind the wall. */
const CAMP = [
  box('tent', -66, -40, 4.2, 3.6),
  box('tent', -66, -34, 4.2, 3.6),
  box('tent', -66, -28, 4.2, 3.6),
  box('tent', -66, 28, 4.2, 3.6),
  box('tent', -66, 34, 4.2, 3.6),
  box('tent', -66, 40, 4.2, 3.6),
  box('container', -82, -10, 6.1, 2.5, 2.6, 2),
  box('container', -82, 10, 6.1, 2.5, 2.6, 0),
  box('container', -96, -46, 6.1, 2.5, 2.6, 1),
  box('container', -96, 46, 6.1, 2.5, 2.6, 0),
  box('crate', -56, -12, 1.25, 1.25),
  box('crate', -54.6, -12, 1.25, 1.25, 2.5),
  box('crate', -56, 12, 1.25, 1.25),
  box('crate', -58, 50, 1.25, 1.25),
  box('crate', -58, -52, 1.25, 1.25, 2.5),
  box('sandbag', -50, -56, 0.9, 5),
  box('sandbag', -50, 56, 0.9, 5),
  box('sandbag', -50, -18, 0.9, 5),
  box('sandbag', -50, 18, 0.9, 5),
]

const CAMP_PIECES = [
  ['bunker', -62, 0],
  ['ammocrate', -57, -4],
  ['ammocrate', -57, 4, 1],
  ['ammocrate', -57, -48],
  ['ammocrate', -57, 48, 1],
  ['drum', -76, -18],
  ['drum', -76.9, -18.5],
  ['fuel', -76, 18],
  ['radiomast', -90, 0],
  ['camonet', -70, -56],
  ['camonet', -70, 56],
  ['floodlight', -48, -66],
  ['floodlight', -48, 66],
  ['floodlight', -88, -28],
  ['floodlight', -88, 28],
  ['helipad', -96, 30],
]

const CAMP_SETS = [
  ['bigtent', -80, -32, 0, { w: 9, d: 6 }],
  ['bigtent', -80, 32, 0, { w: 9, d: 6 }],
  ['truck', -98, -14, 1],
  ['flagpole', -70, 0, 0],
]

/** The marsh: the way the horde comes. */
const FIELD_PIECES = [
  // Obstacles in front of the wall: they slow the horde where your guns reach.
  ['teeth', -24, -28, 1],
  ['teeth', -24, 28, 1],
  ['teeth', -24, -58, 1],
  ['teeth', -24, 58, 1],
  ['tanktrap', -27, 0],
  ['tanktrap', -27, 6],
  ['tanktrap', -27, -6],
  ['tanktrap', -27, -44],
  ['tanktrap', -27, 44],
  ['wire', -29, -16, 1],
  ['wire', -29, 16, 1],
  ['wire', -29, -68, 1],
  ['wire', -29, 68, 1],
  // Wrecks and stones out in the mist.
  ['carwreck', -6, -6, 1],
  ['carwreck', 22, 22],
  ['carwreck', 40, -30, 1],
  ['carwreck', 62, -26],
  ['carwreck', 8, 32, 1],
  ['carwreck', 84, 52],
  ['carwreck', 96, -8, 1],
  ['carwreck', -10, -62],
  ['rock', -22, 14],
  ['rock', 2, 60],
  ['rock', 18, -62],
  ['rock', 44, 56],
  ['rock', 74, -60],
  ['rock', 102, 30],
  ['rubble', 30, -6],
  ['rubble', -14, -44],
  ['rubble', 66, 34],
  ['rubble', 88, -40],
  ['rubble', 58, 66],
  ['bush', 10, 0],
  ['bush', 36, 28],
  ['bush', 52, -40],
  ['bush', 90, 14],
  ['bush', -8, 50],
  // The dead wood: thick out east and along the valley sides, thin near the wall.
  ...[
    [-18, -30], [-10, 26], [6, -12], [14, 38], [28, -40], [34, 10], [48, -22], [56, 30], [66, -4],
    [-4, -48], [2, -26], [12, 18], [20, -8], [24, 48], [38, -48], [42, 22], [58, -12], [62, 44], [70, 20],
    [74, -36], [80, 6], [-14, 40], [8, 52], [-16, 66], [-2, -70], [12, 68], [26, -68], [36, 66], [50, -66],
    [64, 70], [78, -70], [88, 64], [92, -56], [98, 40], [100, -26], [104, 8], [108, -44], [86, 26], [94, -2],
    [82, -18], [72, 50], [110, 58], [110, -64], [46, -56], [-8, 70], [18, -74], [32, 72],
  ].map(([x, z]) => ['deadtree', x, z]),
]

/** The drowned village out in the marsh, its church, and boats sunk in the channels. */
const FIELD_SETS = [
  ['church', 70, -46, 1],
  ['ruinblock', 46, 4, 0, { w: 9, d: 7, h: 6 }],
  ['ruinblock', 60, 14, 1, { w: 8, d: 7, h: 5 }],
  ['ruins', 20, -36, 1],
  ['ruinblock', 84, 34, 3, { w: 10, d: 8, h: 6 }],
  ['ruins', 92, -24, 0],
  ['well', 54, -4, 0],
  ['boat', 46, -30, 1],
  ['boat', 4, -40, 0],
  ['bus', 30, 48, 1],
  ['fence', 74, 6, 0, { len: 18 }],
  ['fence', 100, 18, 1, { len: 14 }],
  ['fence', 36, -54, 0, { len: 16 }],
]

export const MIREFALL_BASTION = {
  id: 'bastion',
  name: 'Mirefall Bastion',
  width: 230,
  depth: HALF_D * 2,
  bases: [
    { x: -70, z: 0 },
    { x: 96, z: 0 },
  ],
  obstacles: [...rampart, ...CAMP],
  pieces: [...CAMP_PIECES, ...FIELD_PIECES],
  sets: [...CAMP_SETS, ...FIELD_SETS],
  /** The wall running on into the ridges past each side (scenery, Rampart.jsx). */
  wings: [-1, 1].map((sd) => ({ x: (WALL_X0 + WALL_X1) / 2, z: sd * (HALF_D + 22), w: WALL_X1 - WALL_X0, d: 44, h: WALL_H })),
  /** No fence: the valley sides rise into ridges (MapView outsideY) and the edge is lost in the mist. */
  fence: false,
  rim: { z: 13, x: 5 },
  roads: [
    { width: 2.4, points: [[115, 4], [90, 6], [55, 0], [20, 7], [-8, 1], [-34, 0]] },
    { width: 2.2, points: [[-42, 0], [-58, 0], [-115, 2]] },
  ],
  // Drowned channels across the marsh (painted as dark water).
  ice: [
    { width: 2.6, points: [[60, -78], [44, -30], [50, -8], [36, 18], [44, 78]] },
    { width: 1.8, points: [[8, -78], [0, -34], [10, -14], [-2, 12], [6, 78]] },
    { width: 2.2, points: [[104, -78], [96, -40], [106, 0], [96, 40], [104, 78]] },
  ],
  mud: [[-10, 0, 9], [18, -26, 8], [30, 30, 8], [56, 4, 9], [-26, 0, 6], [-62, 0, 7], [80, -10, 10], [92, 40, 8], [24, -60, 8], [40, 64, 8]],
  // A dense dead forest up the ridges and beyond the ends.
  trees: scatterTrees(190, 41, 115, HALF_D),
  hills: [165, 260],
  hillScale: 1.4,
  /** Mist banks drifting over the marsh (Mist.jsx): the x range they fill. */
  mist: { x0: -100, x1: 130, density: 1.2, dark: 0.38 },
  /** Bog out in the marsh: it heaves and sinks (terrain.js); level by the wall to build on. */
  terrain: {
    hills: [
      { x: 10, z: -40, r: 9, h: -0.9 },
      { x: 30, z: 14, r: 10, h: -1 },
      { x: 58, z: -30, r: 8, h: -0.8 },
      { x: 20, z: 40, r: 9, h: 1.6 },
      { x: 50, z: 46, r: 8, h: 1.4 },
      { x: 70, z: -10, r: 10, h: 1.8 },
      { x: 92, z: 12, r: 12, h: -1 },
      { x: 26, z: -56, r: 10, h: 1.4 },
      { x: 78, z: 60, r: 11, h: -0.9 },
      { x: 104, z: -54, r: 12, h: 2 },
    ],
  },
  /** How far out from the wall you may deploy (WALL_REACH in sim/world.js): marked. */
  lines: [{ points: [[-14, -HALF_D + 1], [-14, HALF_D - 1]], width: 0.35, color: 'rgba(200,40,30,0.75)', dash: [2, 1.5] }],
  /** Lamp posts along the top of the rampart (z positions). */
  lamps: [-66, -45, -26, -9, 9, 26, 45, 66],
  theme: {
    grassA: '#3e4a38',
    grassB: '#4b553f',
    dry: '#5b5a44',
    outside: '#363f31',
    mud: [58, 52, 44],
    road: [78, 70, 56],
    rut: [48, 42, 34],
    ice: [46, 58, 62],
    hillNear: '#39433a',
    hillFar: '#56625e',
    tree: 'dead',
    trunk: '#3a332c',
    fence: '#3b3630',
    peak: '#6b7570',
    scatter: 'marsh',
    clouds: 0.95,
    cloudColor: '#505861',
    ao: [10, 12, 10],
    sun: '#9fb0b8',
    sunIntensity: 0.8,
    skyLight: '#6a7c8c',
    groundLight: '#262b26',
    ambient: 0.95,
  },
  sky: { top: '#262f3a', horizon: '#56625f', ground: '#363e38' },
  fog: '#5a6663',
  // (The horde is out in the valley a hundred metres off: the fog thins enough to see it come.)
  fogRange: [45, 285],
}

export default MIREFALL_BASTION
