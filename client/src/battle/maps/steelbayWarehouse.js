import { mirrorLevel } from '../sim/levels.js'
import { mirrorSet } from '../sim/setpieces.js'
import { box, mirrorBox, mirrorPiece } from './mapKit.js'

/**
 * Steelbay Warehouse - the warehouse cleared out into an indoor fighting arena. A bright
 * tiled floor under tall corrugated walls and open roof trusses, and nothing on it but
 * clean concrete cover: low walls and L-corners to crouch behind, tall slabs that block
 * sight, square pillars, crate stacks. Each army holds a walled base in its own team
 * colour at an end, with a helipad and a concrete bunker, and two railed overwatch
 * platforms up ramps in front of it; the middle is a raised deck with a ramp from each
 * end, ringed by low walls. Open lanes along both long walls for the armour.
 */

const W = 150
const D = 100
const HX = W / 2 - 0.4
const HZ = D / 2 - 0.4
const DOORS = [-30, -15, 15, 30]

const GREY = '#d9d8d3'
const SLAB = '#c9c8c2'
const BLUE = '#5d8bd0'
const RED = '#cf6a63'

const low = (x, z, w, d, color = GREY, h = 1.1) => box('lowwall', x, z, w, d, h, 0, { color })
const slab = (x, z, w, d) => box('lowwall', x, z, w, d, 2.8, 0, { color: SLAB })
const pillar = (x, z, s = 1.8, h = 4.5) => box('post', x, z, s, s, h, 0, { color: GREY })
const cube = (x, z, s = 2.2, h = 1.4) => box('lowwall', x, z, s, s, h, 0, { color: SLAB })

/** One team's base at the west end, in its colour (mirrored for the other team). */
const base = (color) => [
  // Front line with a gap in the middle, returns back towards the end wall.
  low(-50, -9.5, 0.8, 9, color),
  low(-50, 9.5, 0.8, 9, color),
  low(-55.6, -14, 12, 0.8, color),
  low(-55.6, 14, 12, 0.8, color),
  // Firing step blocks inside.
  low(-58, -5, 3, 0.8, color),
  low(-58, 5, 3, 0.8, color),
]

const WEST = [
  // The concrete bunker behind the base, door towards the middle.
  box('shed', -63, 32, 10, 6, 3, 0, { color: '#bdbcb6', roof: '#7f8389' }),
  // Forward of the base: corners and cubes.
  low(-42, -22, 8, 0.8),
  low(-38.4, -25.6, 0.8, 6.4),
  low(-42, 22, 8, 0.8),
  low(-38.4, 25.6, 0.8, 6.4),
  cube(-44, 0),
  cube(-41, -7),
  cube(-41, 7),
  // Tall slabs that cut the long sightlines.
  slab(-30, -38, 14, 0.8),
  slab(-30, 38, 14, 0.8),
  slab(-28, 0, 0.8, 10),
  // Pillars down each side of the field.
  pillar(-34, -14),
  pillar(-34, 14),
  pillar(-18, -30),
  pillar(-18, 30),
  // Mid cover: L-corners, low runs, crate stacks.
  low(-22, -12, 0.8, 7),
  low(-19.2, -15.1, 6.4, 0.8),
  low(-22, 12, 0.8, 7),
  low(-19.2, 15.1, 6.4, 0.8),
  low(-14, -42, 7, 0.8),
  low(-14, 42, 7, 0.8),
  low(-12, -4, 4.5, 0.8),
  low(-12, 4, 4.5, 0.8),
  cube(-24, -26),
  cube(-24, 26),
  box('crate', -46, -38, 1.25, 1.25, 2.5),
  box('crate', -47.35, -38, 1.25, 1.25),
  box('crate', -46, 38.6, 1.25, 1.25, 2.5),
  box('crate', -9, -22, 1.25, 1.25, 2.5),
  box('crate', -9, -23.35, 1.25, 1.25),
  box('crate', -9, 22, 1.25, 1.25),
]

const CENTRE = [
  // A cross of low walls round the centre deck.
  low(0, -9, 9, 0.8),
  low(0, 9, 9, 0.8),
  low(-5, -20, 0.8, 8),
  low(5, -20, 0.8, 8),
  low(-5, 20, 0.8, 8),
  low(5, 20, 0.8, 8),
  slab(0, -34, 0.8, 9),
  slab(0, 34, 0.8, 9),
]

// Raised floors (levels.js). Edges sit on the 1.25 m navigation grid so the ramps line up
// with whole cells. Each side has two railed overwatch platforms forward of its base, up
// a ramp from the base side; the centre deck has a ramp from each end.
const PLAT = '#c3c2bc'
const WEST_LEVELS = [
  { x: -43.75, z: -32.5, w: 7.5, d: 7.5, h: 2.5, color: PLAT, open: [['w', -32.5, 2.5]] },
  { ramp: 'x+', x: -51.25, z: -32.5, w: 7.5, d: 2.5, h: 2.5, color: PLAT },
  { x: -43.75, z: 32.5, w: 7.5, d: 7.5, h: 2.5, color: PLAT, open: [['w', 32.5, 2.5]] },
  { ramp: 'x+', x: -51.25, z: 32.5, w: 7.5, d: 2.5, h: 2.5, color: PLAT },
]
const CENTRE_LEVELS = [
  { x: 0, z: 0, w: 10, d: 10, h: 2.5, color: PLAT, open: [['w', 0, 2.5], ['e', 0, 2.5]] },
  { ramp: 'x+', x: -8.75, z: 0, w: 7.5, d: 2.5, h: 2.5, color: PLAT },
  { ramp: 'x-', x: 8.75, z: 0, w: 7.5, d: 2.5, h: 2.5, color: PLAT },
]

const WEST_PIECES = [
  ['ammocrate', -61, 0],
  ['drum', -66, -12],
  ['drum', -66.8, -11.4],
]

const WEST_SETS = [
  // The building: long walls, the end wall with its four roller doors.
  ['shedwall', -W / 4, -HZ, 0, { len: W / 2 }],
  ['shedwall', -W / 4, HZ, 2, { len: W / 2 }],
  ['shedwall', -HX, 0, 1, { len: D, doors: DOORS }],
  ...[-60, -40, -20].map((x) => ['truss', x, 0, 1, { len: D }]),
]

const CENTRE_SETS = [['truss', 0, 0, 1, { len: D }]]

const mirrorAll = (list) => list.map(mirrorBox)
const obstacles = [...base(BLUE), ...mirrorAll(base(RED)), ...WEST, ...mirrorAll(WEST), ...CENTRE]
const pieces = [...WEST_PIECES, ...WEST_PIECES.map(mirrorPiece)]

// Floor paint: each base outlined in its colour, a centre circle, the helipads, and a
// walkway line along each long wall.
const WEST_LINES = [
  { points: [[-74, -16], [-48.5, -16], [-48.5, 16], [-74, 16]], width: 0.25, color: 'rgba(80,130,210,0.8)' },
  { points: [[-73, -47.5], [-4, -47.5]], width: 0.15, color: 'rgba(230,190,40,0.9)' },
  { points: [[-73, 47.5], [-4, 47.5]], width: 0.15, color: 'rgba(230,190,40,0.9)' },
]
const mirrorLine = (l, color) => ({ ...l, points: l.points.map(([x, z]) => [-x, z]), color: color || l.color })
const ring = []
for (let k = 0; k <= 32; k += 1) ring.push([Math.cos((k / 32) * Math.PI * 2) * 14, Math.sin((k / 32) * Math.PI * 2) * 14])

export const STEELBAY_WAREHOUSE = {
  id: 'warehouse',
  name: 'Steelbay Warehouse',
  width: W,
  depth: D,
  bases: [
    { x: -62, z: 0 },
    { x: 62, z: 0 },
  ],
  obstacles,
  pieces,
  sets: [...WEST_SETS, ...WEST_SETS.map(mirrorSet), ...CENTRE_SETS],
  levels: [...WEST_LEVELS, ...WEST_LEVELS.map(mirrorLevel), ...CENTRE_LEVELS],
  // Helipads beside each base (you fly in to yours: walk/arrivalFlight.js).
  helipads: [
    { x: -63, z: -32 },
    { x: 63, z: -32 },
  ],
  // A tiled floor wall to wall.
  floor: { x: 0, z: 0, w: W, d: D, tile: 2, colors: ['#cfd1d6', '#c6c8ce'], grout: 'rgba(70,74,86,0.45)' },
  lines: [
    ...WEST_LINES,
    mirrorLine(WEST_LINES[0], 'rgba(205,90,80,0.8)'),
    ...WEST_LINES.slice(1).map((l) => mirrorLine(l)),
    { points: ring, width: 0.2, color: 'rgba(230,190,40,0.85)' },
  ],
  texts: [
    { x: -66, z: 22, text: 'BLUE', size: 2.6, color: 'rgba(80,130,210,0.85)' },
    { x: 66, z: 22, text: 'RED', size: 2.6, color: 'rgba(205,90,80,0.85)' },
  ],
  roads: [],
  mud: [],
  trees: [],
  hills: [150, 250],
  hillScale: 0.8,
  theme: {
    grassA: '#8a8b88',
    grassB: '#93948f',
    dry: '#83847f',
    outside: '#5d6062',
    mud: [80, 78, 74],
    road: [60, 62, 64],
    rut: [60, 62, 64],
    hillNear: '#5f6b5c',
    hillFar: '#8f9a92',
    tree: 'pine',
    fence: '#6b7076',
    peak: '#9aa49a',
    scatter: 'none',
    clouds: 0.5,
    ao: [26, 26, 28],
    sun: '#fff2dc',
    sunIntensity: 1.9,
    skyLight: '#e2e8ee',
    groundLight: '#6a6a66',
    ambient: 1.35,
  },
  sky: { top: '#6a9ccb', horizon: '#d2dde2', ground: '#7d7f78' },
  fog: '#cdd6d9',
}

export default STEELBAY_WAREHOUSE
