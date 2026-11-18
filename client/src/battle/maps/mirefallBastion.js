import { box, scatterTrees } from './mapKit.js'

/**
 * Mirefall Bastion - Zombie Horde's battlefield. A stone rampart runs the width of a
 * drowned marsh; your camp is behind it, the mist and the dead come from the east.
 * Troops dropped on the rampart stand on top and shoot down into the horde; the
 * zombies can't climb it, so they batter at its face until a section gives way (sim:
 * rampart.js, zombies.js). Two stairs at the back let you walk up yourself.
 *
 * The rampart is five 22 m sections, 8 m thick and 4.5 m high, with a parapet along
 * the front edge.
 */

const WALL_X0 = -42
const WALL_X1 = -34
const WALL_H = 4.5
const SECTION = 22
const SECTIONS = 5

const rampart = []
for (let i = 0; i < SECTIONS; i += 1) {
  const z = -55 + SECTION * (i + 0.5)
  rampart.push(box('rampart', (WALL_X0 + WALL_X1) / 2, z, WALL_X1 - WALL_X0, SECTION, WALL_H, 0, { rampart: 'deck', deck: true, seg: i }))
  rampart.push(box('rampart', WALL_X1 - 0.25, z, 0.5, SECTION, WALL_H + 1.0, 0, { rampart: 'parapet', deck: true, seg: i }))
}
// Stairs up the back of the second and fourth sections: nine 0.5 m steps.
for (const z of [-22, 22]) {
  for (let k = 1; k <= 9; k += 1) {
    rampart.push(box('rampart', WALL_X0 - (9 - k) * 0.8 - 0.4, z, 0.8, 2.6, k * 0.5, 0, { rampart: 'step' }))
  }
}

/** The camp behind the wall. */
const CAMP = [
  box('tent', -66, -30, 4.2, 3.6),
  box('tent', -66, -24, 4.2, 3.6),
  box('tent', -66, 24, 4.2, 3.6),
  box('tent', -66, 30, 4.2, 3.6),
  box('container', -74, -8, 6.1, 2.5, 2.6, 2),
  box('container', -74, 8, 6.1, 2.5, 2.6, 0),
  box('crate', -56, -12, 1.25, 1.25),
  box('crate', -54.6, -12, 1.25, 1.25, 2.5),
  box('crate', -56, 12, 1.25, 1.25),
  box('sandbag', -50, -40, 0.9, 5),
  box('sandbag', -50, 40, 0.9, 5),
]

const CAMP_PIECES = [
  ['bunker', -62, 0],
  ['ammocrate', -57, -4],
  ['ammocrate', -57, 4, 1],
  ['drum', -70, -16],
  ['drum', -70.9, -16.5],
  ['fuel', -70, 16],
  ['radiomast', -78, 0],
  ['camonet', -66, -42],
  ['helipad', -76, 40],
]

/** The marsh: the way the horde comes. */
const FIELD_PIECES = [
  ['deadtree', -18, -30],
  ['deadtree', -10, 26],
  ['deadtree', 6, -12],
  ['deadtree', 14, 38],
  ['deadtree', 28, -40],
  ['deadtree', 34, 10],
  ['deadtree', 48, -22],
  ['deadtree', 56, 30],
  ['deadtree', 66, -4],
  ['carwreck', -6, -6, 1],
  ['carwreck', 22, 22],
  ['carwreck', 40, -30, 1],
  ['rock', -22, 14],
  ['rock', 2, 44],
  ['rock', 18, -46],
  ['rock', 44, 40],
  ['rubble', 30, -6],
  ['rubble', -14, -44],
  ['teeth', -24, -20, 1],
  ['teeth', -24, 20, 1],
  ['tanktrap', -27, 0],
  ['tanktrap', -27, 6],
  ['tanktrap', -27, -6],
  ['wire', -29, -36, 1],
  ['wire', -29, 36, 1],
  ['bush', 10, 0],
  ['bush', 36, 28],
  ['bush', 52, -40],
]

export const MIREFALL_BASTION = {
  id: 'bastion',
  name: 'Mirefall Bastion',
  width: 170,
  depth: 110,
  bases: [
    { x: -62, z: 0 },
    { x: 72, z: 0 },
  ],
  obstacles: [...rampart, ...CAMP],
  pieces: [...CAMP_PIECES, ...FIELD_PIECES],
  roads: [
    { width: 2.4, points: [[90, 6], [55, 0], [20, 7], [-8, 1], [-34, 0]] },
    { width: 2.2, points: [[-42, 0], [-58, 0], [-90, 2]] },
  ],
  // Drowned channels across the marsh (painted as dark water).
  ice: [
    { width: 2.6, points: [[60, -58], [44, -30], [50, -8], [36, 18], [44, 58]] },
    { width: 1.8, points: [[8, -58], [0, -34], [10, -14], [-2, 12], [6, 58]] },
  ],
  mud: [[-10, 0, 9], [18, -26, 8], [30, 30, 8], [56, 4, 9], [-26, 0, 6], [-62, 0, 7]],
  trees: scatterTrees(70, 41, 85, 55),
  hills: [150, 250],
  hillScale: 1.3,
  /** Mist banks drifting over the marsh (Mist.jsx): the x range they fill. */
  mist: { x0: -30, x1: 88 },
  /** Lamp posts along the top of the rampart (z positions). */
  lamps: [-48, -30, -11, 11, 30, 48],
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
    clouds: 0.86,
    cloudColor: '#6f7983',
    ao: [14, 16, 14],
    sun: '#aebdcc',
    sunIntensity: 1.05,
    skyLight: '#8296aa',
    groundLight: '#2f352f',
    ambient: 1.1,
  },
  sky: { top: '#3a4655', horizon: '#788581', ground: '#465048' },
  fog: '#74807d',
  fogRange: [45, 210],
}

export default MIREFALL_BASTION
