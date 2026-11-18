/**
 * Base Camp - Floppy Front's lobby. An army camp in a valley at golden hour: you fly in by
 * helicopter, hop out on the helipad at the south gate, then walk around with your avatar
 * and step onto a station's pad to start something. The three game modes stand side by
 * side at the head of the camp: Single Player, Zombie Horde, Multiplayer.
 *
 * Written in the same shape as a battlefield (maps/*.js) so the same renderer draws it
 * and the same collision code keeps you out of the tents.
 */

const box = (kind, x, z, w, d, h, extra = {}) => ({ kind, x, z, w, d, h, tint: 0, ...extra })

/**
 * The stations. `live` ones open their panel; the rest say what's coming.
 * `x, z` is the pad's centre, `face` which way its sign looks.
 */
export const STATIONS = [
  { id: 'sandbox', title: 'Single Player', sub: 'Sandbox battle · step in', x: -13, z: -8, live: true },
  { id: 'zombies', title: 'Zombie Horde', sub: 'Coming soon', x: 0, z: -17.5, live: false },
  { id: 'multiplayer', title: 'Multiplayer', sub: 'Coming soon', x: 13, z: -8, live: false },
  { id: 'armory', title: 'Armory', sub: 'Meet the troops', x: 12, z: 10.5, live: true },
  { id: 'notes', title: 'Field Notes', sub: 'How to play', x: -12, z: 10.5, live: true },
]
export const PAD_RADIUS = 2.6

export const SPAWN = { x: 0, z: 4, yaw: Math.PI }
export const FLAGPOLE = { x: 4.5, z: 0.5, height: 9 }
export const RADIO_MAST = { x: 23.5, z: -14, height: 13 }

/** The helipad at the camp's south gate, where the arrival flight sets you down. */
export const HELIPAD = { x: 0, z: 25, size: 9 }
export const WINDSOCK = { x: 6.6, z: 29, height: 4.2 }

/** The armory line-up: one of each type, standing at ease facing the camp. */
export const ARMORY_LINE = { x0: 8.8, x1: 16.8, z: 15.4, yaw: Math.PI }

function scatterTrees(count, seed = 3) {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const out = []
  while (out.length < count) {
    const a = rand() * Math.PI * 2
    const r = 38 + rand() * 50
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.8 + rand() * 0.6, r: rand() * Math.PI * 2 })
  }
  return out
}

export const BASE_CAMP = {
  id: 'basecamp',
  name: 'Base Camp',
  width: 64,
  depth: 64,
  bases: [
    { x: -20, z: 0 },
    { x: 20, z: 0 },
  ],
  obstacles: [
    box('post', FLAGPOLE.x, FLAGPOLE.z, 0.22, 0.22, FLAGPOLE.height, { color: '#d9d6cf' }),
    // Single Player: the war room tent with its map table.
    box('tent', -19.5, -12.5, 7, 6, 1.3),
    box('crate', -16, -10.6, 2.3, 1.4, 1.0),
    box('crate', -22.5, -7.8, 1.25, 1.25, 1.25),
    box('crate', -21.2, -7.8, 1.25, 1.25, 2.5),
    // Zombie Horde: a fortified bunker front, barriers and sandbags around the pad.
    box('wall', 0, -24, 10, 0.8, 2.7),
    box('barrier', -3.6, -21.2, 2.6, 0.7, 1.05),
    box('barrier', 3.6, -21.2, 2.6, 0.7, 1.05),
    box('sandbag', -4.4, -17.2, 0.9, 3.6, 0.95),
    box('sandbag', 4.4, -17.2, 0.9, 3.6, 0.95),
    // Multiplayer: the radio shack and its mast.
    box('shed', 19.5, -11.5, 6, 5, 3.2),
    box('post', RADIO_MAST.x, RADIO_MAST.z, 0.35, 0.35, RADIO_MAST.height, { color: '#8a8f94' }),
    // The helipad's windsock pole.
    box('post', WINDSOCK.x, WINDSOCK.z, 0.12, 0.12, WINDSOCK.height, { color: '#d9d6cf' }),
    box('crate', 16, -14.4, 1.25, 1.25, 1.25),
    // Armory: sandbags behind the line-up.
    box('sandbag', 12.8, 17.6, 10.5, 0.9, 0.95),
    box('crate', 19.4, 16.2, 1.25, 1.25, 1.25),
    box('crate', 19.4, 14.9, 1.25, 1.25, 1.25),
    // Field Notes: the notice board.
    box('board', -12, 15, 3.4, 0.3, 2.6),
    // Camp: tents, containers, crates and sandbag lines.
    box('tent', -25, 3, 4.2, 3.6, 0.9),
    box('tent', -25, 9.5, 4.2, 3.6, 0.9),
    box('tent', 25, 2, 4.2, 3.6, 0.9),
    box('container', 24.5, 24, 6.1, 2.5, 2.6, { tint: 1 }),
    box('container', -24.5, 24, 6.1, 2.5, 2.6, { tint: 3 }),
    box('container', -25, -24.5, 2.5, 6.1, 2.6, { tint: 0 }),
    box('sandbag', -9, -26, 6, 0.9, 0.95),
    box('sandbag', 9, -26, 6, 0.9, 0.95),
    box('lowwall', 26, -24, 0.6, 6, 1.1),
    box('crate', 6.5, -4, 1.25, 1.25, 1.25),
    box('crate', -10.8, 21.8, 1.25, 1.25, 1.25),
    box('tree', -28, -14, 0.7, 0.7, 6),
    box('tree', 28, 10, 0.7, 0.7, 6),
  ],
  roads: [
    { width: 1.8, points: [[0, 4], [-13, -8]] },
    { width: 1.8, points: [[0, 4], [0, -17.5]] },
    { width: 1.8, points: [[0, 4], [13, -8]] },
    { width: 1.8, points: [[0, 4], [12, 10.5]] },
    { width: 1.8, points: [[0, 4], [-12, 10.5]] },
    { width: 2.4, points: [[0, 4], [0, HELIPAD.z - HELIPAD.size / 2 + 0.5]] },
  ],
  mud: [
    [4.5, 0.5, 3.5],
    [-19, -9, 4],
    [19, -8, 3.5],
  ],
  trees: scatterTrees(70),
  hills: [95, 175],
  hillScale: 0.5,
  /** Haze the hills: fog starts and ends closer than on a battlefield. */
  fogRange: [45, 185],
  sky: { top: '#3d7ed6', horizon: '#ffdcae', ground: '#8a9a68' },
  fog: '#f0dcc0',
}

export default BASE_CAMP
