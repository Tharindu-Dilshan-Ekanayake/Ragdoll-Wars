/**
 * Sea Fort - Floppy Front's lobby. A cluster of steel platforms standing on legs in the
 * open sea: an octagonal hub with the helipad in its middle (where the arrival flight
 * sets you down), and four catwalk bridges out to smaller platforms, one per station:
 *
 *            Zombie Horde (north: a barricaded fort)
 *                         |
 *   Single Player ---- [ hub + H ] ---- Multiplayer
 *   (west: war room)      |             (east: radio tower)
 *            Armory & Field Notes (south)
 *
 * Written in the same shape as a battlefield (maps/*.js) so the same renderer draws its
 * props and the same collision code keeps you out of them. `terrain: false` tells the
 * renderer there's no ground - FortDecks.jsx draws the sea, decks, legs and railings - and
 * WALKABLE (below) keeps you on the decks.
 */

const box = (kind, x, z, w, d, h, extra = {}) => ({ kind, x, z, w, d, h, tint: 0, ...extra })

/** The hub: an octagon with flat sides facing the four bridges. */
export const HUB = { x: 0, z: 0, radius: 12.5 }
HUB.inner = HUB.radius * Math.cos(Math.PI / 8)

/** Satellite platforms, as rectangles (centre, size). */
export const PLATFORMS = [
  { id: 'west', x: -27.5, z: 0, w: 13, d: 14 },
  { id: 'north', x: 0, z: -28, w: 16, d: 14 },
  { id: 'east', x: 27.5, z: 0, w: 13, d: 14 },
  { id: 'south', x: 0, z: 26.5, w: 20, d: 11 },
]

/** Catwalks from the hub's flat sides to each platform (rectangles, x0..x1 / z0..z1). */
export const BRIDGE_WIDTH = 3.2
const bw = BRIDGE_WIDTH / 2
export const BRIDGES = [
  { x0: -21, x1: -HUB.inner, z0: -bw, z1: bw },
  { x0: -bw, x1: bw, z0: -21, z1: -HUB.inner },
  { x0: HUB.inner, x1: 21, z0: -bw, z1: bw },
  { x0: -bw, x1: bw, z0: HUB.inner, z1: 21 },
]

/** Deck surface height and the sea below it. */
export const SEA_LEVEL = -3.2

/** How far in from a deck's edge the railing stands. */
const RAIL = 0.3

/**
 * Where you can stand: the hub (as its inscribed circle), the platforms and the bridges
 * (stretched 2 m into what they join, so the shapes overlap at every junction).
 */
export const WALKABLE = [
  { kind: 'circle', x: HUB.x, z: HUB.z, r: HUB.inner - RAIL },
  ...PLATFORMS.map((p) => ({ kind: 'rect', x0: p.x - p.w / 2 + RAIL, x1: p.x + p.w / 2 - RAIL, z0: p.z - p.d / 2 + RAIL, z1: p.z + p.d / 2 - RAIL })),
  ...BRIDGES.map((b) => {
    const alongX = b.x1 - b.x0 > b.z1 - b.z0
    return alongX
      ? { kind: 'rect', x0: b.x0 - 2, x1: b.x1 + 2, z0: b.z0 + RAIL, z1: b.z1 - RAIL }
      : { kind: 'rect', x0: b.x0 + RAIL, x1: b.x1 - RAIL, z0: b.z0 - 2, z1: b.z1 + 2 }
  }),
]

/**
 * Keeps a body of `radius` on the decks: if `pos` ({x, z}) has stepped off every
 * walkable shape, it's moved to the nearest point that's still on one.
 */
export function clampWalkable(pos, radius) {
  let bestX = pos.x
  let bestZ = pos.z
  let bestD = Infinity
  for (let i = 0; i < WALKABLE.length; i += 1) {
    const s = WALKABLE[i]
    let nx
    let nz
    if (s.kind === 'circle') {
      const r = s.r - radius
      const dx = pos.x - s.x
      const dz = pos.z - s.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= r) return pos
      nx = s.x + (dx / d) * r
      nz = s.z + (dz / d) * r
    } else {
      const x0 = s.x0 + radius
      const x1 = s.x1 - radius
      const z0 = s.z0 + radius
      const z1 = s.z1 - radius
      if (pos.x >= x0 && pos.x <= x1 && pos.z >= z0 && pos.z <= z1) return pos
      nx = Math.min(x1, Math.max(x0, pos.x))
      nz = Math.min(z1, Math.max(z0, pos.z))
    }
    const d = (nx - pos.x) * (nx - pos.x) + (nz - pos.z) * (nz - pos.z)
    if (d < bestD) {
      bestD = d
      bestX = nx
      bestZ = nz
    }
  }
  pos.x = bestX
  pos.z = bestZ
  return pos
}

/**
 * The stations. `live` ones open their panel; the rest say what's coming.
 * `x, z` is the pad's centre.
 */
export const STATIONS = [
  { id: 'sandbox', title: 'Single Player', sub: 'Sandbox battle · step in', x: -27.5, z: 0, live: true },
  { id: 'zombies', title: 'Zombie Horde', sub: 'Coming soon', x: 0, z: -27, live: false },
  { id: 'multiplayer', title: 'Multiplayer', sub: 'Coming soon', x: 27.5, z: 0, live: false },
  { id: 'armory', title: 'Armory', sub: 'Meet the troops', x: 5, z: 25, live: true },
  { id: 'notes', title: 'Field Notes', sub: 'How to play', x: -5, z: 25, live: true },
]
export const PAD_RADIUS = 2.6

/** Where Boxity's respawn puts you: on the hub, facing the Zombie Horde bridge. */
export const SPAWN = { x: 0, z: -7, yaw: Math.PI }
export const FLAGPOLE = { x: -8.6, z: 6.2, height: 9 }
export const RADIO_MAST = { x: 31.5, z: 4.5, height: 13 }

/** The helipad in the middle of the hub, where the arrival flight sets you down. */
export const HELIPAD = { x: 0, z: 0, size: 9 }
export const WINDSOCK = { x: 8.7, z: 6.4, height: 4.2 }

/** The armory line-up: one of each type, standing at ease facing the hub. */
export const ARMORY_LINE = { x0: 1.5, x1: 8.5, z: 28.8, yaw: Math.PI }

export const SEA_FORT = {
  id: 'seafort',
  name: 'Sea Fort',
  // Big enough to hold every deck (collision grid and limits only).
  width: 80,
  depth: 80,
  terrain: false,
  bases: [
    { x: -27.5, z: 0 },
    { x: 27.5, z: 0 },
  ],
  obstacles: [
    // Hub: flag, windsock, a few crates by the rails (clear of the rotor).
    box('post', FLAGPOLE.x, FLAGPOLE.z, 0.22, 0.22, FLAGPOLE.height, { color: '#e9e6df' }),
    box('post', WINDSOCK.x, WINDSOCK.z, 0.12, 0.12, WINDSOCK.height, { color: '#e9e6df' }),
    box('crate', -9.2, -4.2, 1.25, 1.25, 1.25),
    box('crate', 9.6, -4.4, 1.25, 1.25, 2.5),
    // West - Single Player: the war room tent and its map table.
    box('tent', -30, -4.7, 6, 4, 1.3),
    box('crate', -24.2, -5.2, 2.3, 1.4, 1.0),
    box('crate', -32.6, 4.8, 1.25, 1.25, 1.25),
    box('crate', -31.3, 4.8, 1.25, 1.25, 2.5),
    // North - Zombie Horde: a barricaded fort with one way in from the bridge.
    box('wall', 0, -33.6, 12, 0.8, 2.7),
    box('barrier', -6.2, -30.2, 0.7, 2.6, 1.05),
    box('barrier', 6.2, -30.2, 0.7, 2.6, 1.05),
    box('sandbag', -4.6, -27, 0.9, 3.6, 0.95),
    box('sandbag', 4.6, -27, 0.9, 3.6, 0.95),
    box('sandbag', -4.6, -22.4, 3.4, 0.9, 0.95),
    box('sandbag', 4.6, -22.4, 3.4, 0.9, 0.95),
    // East - Multiplayer: the radio shack and its mast.
    box('shed', 30.5, -4.8, 5, 4, 3.2),
    box('post', RADIO_MAST.x, RADIO_MAST.z, 0.35, 0.35, RADIO_MAST.height, { color: '#8a8f94' }),
    box('crate', 23.6, 5.4, 1.25, 1.25, 1.25),
    // South - Armory and Field Notes.
    box('sandbag', 5, 30.6, 9, 0.9, 0.95),
    box('board', -5, 29.6, 3.4, 0.3, 2.6),
    box('crate', -9, 30.6, 1.25, 1.25, 1.25),
    box('crate', -9, 29.3, 1.25, 1.25, 2.5),
  ],
  roads: [],
  mud: [],
  trees: [],
  /** Haze far out to sea; the decks stay crisp. */
  fogRange: [70, 210],
  sky: { top: '#1f7fe6', horizon: '#cfeaff', ground: '#cfeaff' },
  fog: '#cfeaff',
}

export default SEA_FORT
