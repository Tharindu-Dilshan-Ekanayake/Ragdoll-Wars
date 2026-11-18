/**
 * Training Grounds - Floppy Front's first battlefield.
 *
 * A muddy army yard: each side has a sandbag emplacement, flank nests, a broken line of
 * concrete barriers and a pair of shipping containers. The middle holds a ruined walled
 * compound with gaps on every side. Sheds on the far flanks give cover for flanking
 * runs. The layout is mirrored across x = 0, so neither team has an edge.
 *
 * Every obstacle is an axis-aligned box `{ x, z, w, d, h, kind, tint }` (centre, size
 * along x and z, height). `kind` picks how it looks and how it counts as cover:
 * anything under 1.4 m is low cover you can shoot over by standing up.
 */

const KIND_HEIGHT = {
  sandbag: 0.95,
  barrier: 1.05,
  lowwall: 1.1,
  crate: 1.25,
  wall: 2.7,
  container: 2.6,
  shed: 3.4,
  tree: 6,
}

const box = (kind, x, z, w, d, h = KIND_HEIGHT[kind], tint = 0) => ({ kind, x, z, w, d, h, tint })

/** The blue (west, x < 0) half; mirrored to make the red half. */
const WEST_HALF = [
  // Forward emplacement: a sandbag U opening towards home.
  box('sandbag', -58, 0, 0.9, 12),
  box('sandbag', -60.5, -6.45, 5.9, 0.9),
  box('sandbag', -60.5, 6.45, 5.9, 0.9),
  // Flank nests.
  box('sandbag', -54, -30, 0.9, 6),
  box('sandbag', -55.9, -33.45, 4.7, 0.9),
  box('sandbag', -54, 30, 0.9, 6),
  box('sandbag', -55.9, 33.45, 4.7, 0.9),
  // Broken barrier line.
  box('barrier', -43, -37, 0.7, 9),
  box('barrier', -43, -15, 0.7, 9),
  box('barrier', -43, 15, 0.7, 9),
  box('barrier', -43, 37, 0.7, 9),
  // Shipping containers.
  box('container', -33, -22, 2.5, 6.1, 2.6, 0),
  box('container', -33, 23, 6.1, 2.5, 2.6, 1),
  box('container', -63, -40, 6.1, 2.5, 2.6, 2),
  // Crates.
  box('crate', -25.2, -7.4, 1.25, 1.25),
  box('crate', -23.8, -7.4, 1.25, 1.25),
  box('crate', -24.5, -6.0, 1.25, 1.25),
  box('crate', -25, 9, 1.25, 1.25, 2.5),
  box('crate', -23.7, 9, 1.25, 1.25),
  box('crate', -47, 2.5, 1.25, 1.25),
  box('crate', -47, -24, 1.25, 1.25),
  // Midfield low walls.
  box('lowwall', -18, -33, 6, 0.6),
  box('lowwall', -18, 33, 6, 0.6),
  box('lowwall', -30, -45, 0.6, 5),
  box('lowwall', -30, 45, 0.6, 5),
  box('sandbag', -16, -18, 4.5, 0.9),
  box('sandbag', -16, 18, 4.5, 0.9),
  // Flank sheds.
  box('shed', -22, -47, 9, 6),
  box('shed', -22, 47, 9, 6),
  box('shed', -72, 44, 7, 6),
  // A few trees inside the fence.
  box('tree', -40, -50, 0.7, 0.7),
  box('tree', -8, 50.5, 0.7, 0.7),
  box('tree', -66, -16, 0.7, 0.7),
]

/** The ruined compound in the middle: walls with gaps on all four sides. */
const CENTRE = [
  box('wall', -7.25, 11, 7.5, 0.6),
  box('wall', 7.25, 11, 7.5, 0.6),
  box('wall', -7.25, -11, 7.5, 0.6),
  box('wall', 7.25, -11, 7.5, 0.6),
  box('wall', -11, 7.25, 0.6, 7.5),
  box('wall', -11, -7.25, 0.6, 7.5),
  box('wall', 11, 7.25, 0.6, 7.5),
  box('wall', 11, -7.25, 0.6, 7.5),
  box('lowwall', -4.5, 0, 0.6, 3.2),
  box('lowwall', 4.5, 0, 0.6, 3.2),
  box('crate', 0, 5.5, 1.25, 1.25),
  box('crate', 0, -5.5, 1.25, 1.25),
]

const mirror = (o) => ({ ...o, x: -o.x })

/** Trees outside the fence: scenery only, never collide. Deterministic. */
function scatterTrees(count, seed = 7) {
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const out = []
  while (out.length < count) {
    const x = (rand() * 2 - 1) * 130
    const z = (rand() * 2 - 1) * 95
    // Keep a clear band just outside the fence.
    if (Math.abs(x) < 92 && Math.abs(z) < 62) continue
    out.push({ x, z, s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2 })
  }
  return out
}

export const TRAINING_GROUNDS = {
  id: 'training',
  name: 'Training Grounds',
  blurb: 'A muddy army yard with sandbag nests, barrier lines, containers and a ruined compound in the middle.',
  /** Playable area (the fence). */
  width: 170,
  depth: 110,
  /** Where each team's units tend to form up. */
  bases: [
    { x: -70, z: 0 },
    { x: 70, z: 0 },
  ],
  obstacles: [...WEST_HALF, ...WEST_HALF.map(mirror), ...CENTRE],
  /** Dirt roads painted on the ground: polylines of [x, z], with a half width. */
  roads: [
    { width: 3.2, points: [[-90, 0], [-12, 0], [12, 0], [90, 0]] },
    { width: 2.6, points: [[0, -60], [0, -12], [0, 12], [0, 60]] },
    { width: 2.2, points: [[-60, -6], [-60, -30], [-54, -40]] },
    { width: 2.2, points: [[60, 6], [60, 30], [54, 40]] },
  ],
  /** Muddy patches: [x, z, radius]. */
  mud: [
    [-58, 0, 9],
    [58, 0, 9],
    [0, 0, 13],
    [-30, -30, 7],
    [30, 30, 7],
    [-22, 26, 6],
    [22, -26, 6],
  ],
  trees: scatterTrees(110),
  sky: { top: '#5b9bd8', horizon: '#cfe3ee', ground: '#8a9a6a' },
  fog: '#c9d9df',
}

export default TRAINING_GROUNDS
