import { emitImpact, emitSound } from './fx.js'
import { explode } from './ordnance.js'
import { rebuildStatic } from './world.js'

/**
 * Phase 4: build mode. Every piece you place is one or more obstacle boxes added to the
 * battlefield, so soldiers path round it, take cover behind it and shoot over the low
 * ones; the obstacle grid, navigation and cover spots are rebuilt after each change.
 *
 * Pieces have health: blasts wear them down (anti-armour weapons more) and destroy
 * them; fuel barrels and ammo crates go up when they do. Vehicles flatten the flimsy
 * ones (`crush`). Barbed wire isn't a box but a zone that slows soldiers to a crawl.
 * Dragon's teeth are spaced so infantry slip through and vehicles can't.
 *
 * `boxes` are relative to the piece's centre with its long side along X; rotation 1
 * turns the piece a quarter turn.
 */

const b = (kind, x, z, w, d, h, extra = {}) => ({ kind, x, z, w, d, h, ...extra })

export const BUILD_TYPES = {
  trench: { name: 'Trench', role: 'Dig in', hp: 500, size: [6, 2.6], boxes: [b('mound', 0, -1.0, 6, 0.7, 0.6), b('mound', 0, 1.0, 6, 0.7, 0.6)] },
  sandbags: { name: 'Sandbags', role: 'Cover', hp: 170, size: [3, 0.9], boxes: [b('sandbag', 0, 0, 3, 0.9, 0.95)] },
  barrier: { name: 'Barrier', role: 'Concrete', hp: 280, size: [2.6, 0.7], boxes: [b('barrier', 0, 0, 2.6, 0.7, 1.05)] },
  blastwall: { name: 'Blast Wall', role: 'Tall cover', hp: 450, size: [3.6, 0.6], boxes: [b('wall', 0, 0, 3.6, 0.6, 2.6)] },
  sandwall: { name: 'Sand Wall', role: 'Gabions', hp: 320, size: [2.5, 1.25], boxes: [b('hesco', -0.62, 0, 1.24, 1.24, 1.4), b('hesco', 0.62, 0, 1.24, 1.24, 1.4)] },
  pipes: { name: 'Concrete Pipes', role: 'Cover', hp: 380, size: [2.6, 1.7], boxes: [b('pipes', 0, 0, 2.6, 1.7, 1.25)] },
  tanktrap: { name: 'Tank Trap', role: 'Stops vehicles', hp: 320, size: [1.3, 1.3], scatter: 2.6, boxes: [b('tanktrap', 0, 0, 1.2, 1.2, 1.1)] },
  // Gaps of 0.9 m: a soldier fits through, a vehicle doesn't.
  teeth: { name: "Dragon's Teeth", role: 'Stops vehicles', hp: 420, size: [5.4, 1], boxes: [b('tooth', -1.8, 0, 0.9, 0.9, 0.85), b('tooth', 0, 0, 0.9, 0.9, 0.85), b('tooth', 1.8, 0, 0.9, 0.9, 0.85)] },
  wire: { name: 'Barbed Wire', role: 'Slows troops', hp: 70, crush: true, size: [4, 1.3], wire: true, boxes: [] },
  cwall: { name: 'Concrete Wall', role: 'Building', hp: 520, size: [4, 0.4], boxes: [b('post', 0, 0, 4, 0.4, 3, { color: '#bfbab0' })] },
  bunker: { name: 'Bunker', role: 'Pillbox', hp: 950, size: [5, 4], boxes: [b('bunker', 0, 0, 5, 4, 2.2)] },
  tower: {
    name: 'Watchtower',
    role: 'Lookout',
    hp: 260,
    size: [2.6, 2.6],
    boxes: [b('post', -1.1, -1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', 1.1, -1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', -1.1, 1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' }), b('post', 1.1, 1.1, 0.25, 0.25, 4.6, { color: '#7a5a3a' })],
  },
  helipad: { name: 'Helipad', role: 'Air base', hp: Infinity, size: [8, 8], boxes: [] },
  container: { name: 'Container', role: 'Shipping', hp: 650, size: [6.1, 2.5], boxes: [b('container', 0, 0, 6.1, 2.5, 2.6, { tint: 0 })] },
  tent: { name: 'Tent', role: 'Camp', hp: 120, crush: true, size: [4.2, 3.6], boxes: [b('tent', 0, 0, 4.2, 3.6, 0.9)] },
  camonet: {
    name: 'Camo Net',
    role: 'Concealment',
    hp: 90,
    crush: true,
    size: [5, 4],
    boxes: [b('post', -2.3, -1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', 2.3, -1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', -2.3, 1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' }), b('post', 2.3, 1.8, 0.12, 0.12, 2.6, { color: '#5a4a32' })],
  },
  floodlight: { name: 'Floodlight', role: 'Lighting', hp: 130, size: [0.6, 0.6], scatter: 6, boxes: [b('post', 0, 0, 0.2, 0.2, 5, { color: '#6b7076' })] },
  radiomast: { name: 'Radio Mast', role: 'Comms', hp: 220, size: [0.8, 0.8], scatter: 8, boxes: [b('post', 0, 0, 0.35, 0.35, 12, { color: '#8a8f94' })] },
  crate: { name: 'Supply Crate', role: 'Supplies', hp: 90, crush: true, size: [1.25, 1.25], scatter: 1.6, boxes: [b('crate', 0, 0, 1.25, 1.25, 1.25)] },
  ammocrate: { name: 'Ammo Crate', role: 'Explosive', hp: 60, crush: true, explosive: { radius: 3.2, damage: 100 }, size: [1.4, 0.9], scatter: 1.8, boxes: [b('ammo', 0, 0, 1.4, 0.9, 0.75)] },
  drum: { name: 'Oil Drum', role: 'Supplies', hp: 70, crush: true, size: [0.8, 0.8], scatter: 1.1, boxes: [b('drum', 0, 0, 0.8, 0.8, 1.1)] },
  fuel: { name: 'Fuel Barrel', role: 'Explosive', hp: 35, crush: true, explosive: { radius: 5, damage: 170 }, size: [0.8, 0.8], scatter: 1.4, boxes: [b('fuel', 0, 0, 0.8, 0.8, 1.1)] },
  hay: { name: 'Hay Bale', role: 'Farm', hp: 90, crush: true, size: [1.6, 1.2], scatter: 2, boxes: [b('hay', 0, 0, 1.6, 1.2, 1.2)] },
  fence: { name: 'Fence', role: 'Farm', hp: 55, crush: true, size: [4, 0.2], boxes: [b('fence', 0, 0, 4, 0.2, 1.1)] },
  tree: { name: 'Pine Tree', role: 'Nature', hp: 160, size: [0.7, 0.7], scatter: 3.5, boxes: [b('ptree', 0, 0, 0.7, 0.7, 6)] },
  bush: { name: 'Bush', role: 'Nature', hp: 45, crush: true, size: [1.4, 1.4], scatter: 1.8, boxes: [b('bush', 0, 0, 1.4, 1.4, 1.0)] },
  rock: { name: 'Rock', role: 'Nature', hp: 650, size: [1.8, 1.6], scatter: 2.4, boxes: [b('rock', 0, 0, 1.8, 1.6, 1.2)] },
  remove: { name: 'Remove', role: 'Take down', tool: true, hp: 0, size: [1, 1], boxes: [] },
}

export const BUILD_GROUPS = [
  { label: 'Dig in', keys: ['trench'] },
  { label: 'Cover', keys: ['sandbags', 'barrier', 'blastwall', 'sandwall', 'pipes'] },
  { label: 'Obstacles', keys: ['tanktrap', 'teeth', 'wire'] },
  { label: 'Buildings', keys: ['cwall', 'bunker', 'tower'] },
  { label: 'Base', keys: ['helipad', 'container', 'tent', 'camonet', 'floodlight', 'radiomast'] },
  { label: 'Supplies', keys: ['crate', 'ammocrate', 'drum', 'fuel'] },
  { label: 'Farm', keys: ['hay', 'fence'] },
  { label: 'Nature', keys: ['tree', 'bush', 'rock'] },
  { label: 'Tools', keys: ['remove'] },
]

export function createBuild() {
  return { list: [], nextId: 1, dirty: false, version: 0, wire: [], pending: [] }
}

/** A piece's boxes in world space for centre (x, z) and rotation `rot` (0 or 1). */
export function pieceBoxes(key, x, z, rot, out = []) {
  const t = BUILD_TYPES[key]
  for (const o of t.boxes) {
    const rx = rot ? o.z : o.x
    const rz = rot ? -o.x : o.z
    out.push({ ...o, x: x + rx, z: z + rz, w: rot ? o.d : o.w, d: rot ? o.w : o.d })
  }
  return out
}

/** Where each of `count` pieces goes: in a line along the piece, or a small cluster. */
export function piecePositions(key, x, z, count, rot) {
  const t = BUILD_TYPES[key]
  const out = []
  if (t.scatter) {
    const cols = Math.ceil(Math.sqrt(count))
    for (let i = 0; i < count; i += 1) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const jitter = count > 1 ? (((i * 7919) % 97) / 97 - 0.5) * t.scatter * 0.4 : 0
      out.push({ x: x + (c - (cols - 1) / 2) * t.scatter + jitter, z: z + (r - (Math.ceil(count / cols) - 1) / 2) * t.scatter - jitter })
    }
    return out
  }
  const len = t.size[0] + 0.05
  for (let i = 0; i < count; i += 1) {
    const along = (i - (count - 1) / 2) * len
    out.push({ x: x + (rot ? 0 : along), z: z + (rot ? -along : 0) })
  }
  return out
}

/** Builds up to `count` of piece `key` at (x, z). Returns { spawned, limited }. */
export function placeStructures(w, key, x, z, count, rot) {
  const t = BUILD_TYPES[key]
  if (t.tool) return removeStructureAt(w, x, z)
  const room = w.caps.structures - w.build.list.length
  if (room <= 0) return { spawned: 0, limited: `Build limit reached (${w.caps.structures} pieces)` }
  const n = Math.min(count, room)
  const lx = w.obs.limitX
  const lz = w.obs.limitZ
  let spawned = 0
  for (const p of piecePositions(key, x, z, n, rot)) {
    if (Math.abs(p.x) > lx || Math.abs(p.z) > lz) continue
    const st = {
      id: w.build.nextId++,
      key,
      x: p.x,
      z: p.z,
      rot,
      hp: t.hp,
      maxHp: t.hp,
      seed: (p.x * 13.1 + p.z * 7.7) % 1,
      boxes: pieceBoxes(key, p.x, p.z, rot),
    }
    for (const o of st.boxes) o.sid = st.id
    w.build.list.push(st)
    emitImpact(w.fx, p.x, 0.1, p.z, 3, w.time)
    spawned += 1
  }
  if (spawned) {
    emitSound(w.fx, 'build', x, 0.3, z, 0)
    rebuildStatic(w)
  }
  return { spawned, limited: n < count ? `Build limit reached (${w.caps.structures} pieces)` : null }
}

function removeStructureAt(w, x, z) {
  let best = -1
  let bestD = 3
  w.build.list.forEach((st, i) => {
    const t = BUILD_TYPES[st.key]
    const rx = (st.rot ? t.size[1] : t.size[0]) / 2
    const rz = (st.rot ? t.size[0] : t.size[1]) / 2
    const dx = Math.max(0, Math.abs(x - st.x) - rx)
    const dz = Math.max(0, Math.abs(z - st.z) - rz)
    const d = Math.hypot(dx, dz)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (best < 0) return { spawned: 0, limited: 'Click right on a structure to take it down' }
  const [st] = w.build.list.splice(best, 1)
  emitImpact(w.fx, st.x, 0.5, st.z, 3, w.time)
  rebuildStatic(w)
  return { spawned: 1, limited: null }
}

export function clearStructures(w) {
  if (!w.build.list.length) return
  w.build.list.length = 0
  w.build.pending.length = 0
  rebuildStatic(w)
}

/** Destroys piece `st` (in the sim): debris, maybe a blast, and a rebuild at tick end. */
function destroy(w, st) {
  st.hp = 0
  st.dead = true
  w.build.dirty = true
  for (let k = 0; k < 4; k += 1) emitImpact(w.fx, st.x + (Math.random() - 0.5) * 1.5, 0.6, st.z + (Math.random() - 0.5) * 1.5, 2, w.time)
  const t = BUILD_TYPES[st.key]
  if (t.explosive) w.build.pending.push(st.x, st.z, t.explosive.radius, t.explosive.damage)
}

/** A blast at (x, y, z) wears down every piece in reach (called by ordnance.explode). */
export function blastStructures(w, x, y, z, radius, damage, anti) {
  const list = w.build.list
  for (let i = 0; i < list.length; i += 1) {
    const st = list[i]
    if (st.dead || st.hp === Infinity) continue
    const t = BUILD_TYPES[st.key]
    const half = Math.max(t.size[0], t.size[1]) / 2
    const d = Math.max(0, Math.hypot(st.x - x, st.z - z) - half)
    if (d > radius) continue
    st.hp -= damage * (1 - d / radius) * (0.6 + 0.4 * anti)
    if (st.hp <= 0) destroy(w, st)
  }
}

/**
 * A zombie (or anything) hitting whatever piece is within `reach` of (x, z) for `dmg`.
 * Returns whether it hit something.
 */
export function damageStructureNear(w, x, z, reach, dmg) {
  const list = w.build.list
  for (let i = 0; i < list.length; i += 1) {
    const st = list[i]
    if (st.dead || st.hp === Infinity || !BUILD_TYPES[st.key].boxes.length) continue
    const t = BUILD_TYPES[st.key]
    const rx = (st.rot ? t.size[1] : t.size[0]) / 2
    const rz = (st.rot ? t.size[0] : t.size[1]) / 2
    const dx = Math.max(0, Math.abs(x - st.x) - rx)
    const dz = Math.max(0, Math.abs(z - st.z) - rz)
    if (dx * dx + dz * dz > reach * reach) continue
    st.hp -= dmg
    emitImpact(w.fx, x, 0.8, z, 2, w.time)
    if (st.hp <= 0) destroy(w, st)
    return true
  }
  return false
}

/** A vehicle flattening the flimsy pieces it drives into. */
export function crushStructures(w, x, z, radius) {
  const list = w.build.list
  for (let i = 0; i < list.length; i += 1) {
    const st = list[i]
    const t = BUILD_TYPES[st.key]
    if (st.dead || !t.crush) continue
    const rx = (st.rot ? t.size[1] : t.size[0]) / 2
    const rz = (st.rot ? t.size[0] : t.size[1]) / 2
    const dx = Math.max(0, Math.abs(x - st.x) - rx)
    const dz = Math.max(0, Math.abs(z - st.z) - rz)
    if (dx * dx + dz * dz < radius * radius) destroy(w, st)
  }
}

/** Whether (x, z) is inside barbed wire. */
export function inWire(w, x, z) {
  const zones = w.build.wire
  for (let i = 0; i < zones.length; i += 4) {
    if (x > zones[i] && x < zones[i + 2] && z > zones[i + 1] && z < zones[i + 3]) return true
  }
  return false
}

/** End of a sim tick: drop destroyed pieces, set off the explosive ones, rebuild once. */
export function settleStructures(w) {
  const build = w.build
  if (!build.dirty) return
  build.dirty = false
  build.list = build.list.filter((st) => !st.dead)
  const pending = build.pending.splice(0, build.pending.length)
  rebuildStatic(w)
  for (let i = 0; i < pending.length; i += 4) explode(w, pending[i], 0.6, pending[i + 1], pending[i + 2], pending[i + 3], null, 1.5)
}

/** Barbed-wire zones as a flat [x0, z0, x1, z1, ...] list (called on rebuild). */
export function wireZones(w) {
  const out = []
  for (const st of w.build.list) {
    if (!BUILD_TYPES[st.key].wire) continue
    const [sw, sd] = BUILD_TYPES[st.key].size
    const hw = (st.rot ? sd : sw) / 2
    const hd = (st.rot ? sw : sd) / 2
    out.push(st.x - hw, st.z - hd, st.x + hw, st.z + hd)
  }
  return out
}
