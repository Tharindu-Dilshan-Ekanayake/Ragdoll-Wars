import { emitImpact, emitSound } from './fx.js'
import { levelFloorAt } from './levels.js'
import { groundAt } from './terrain.js'
import { explode } from './ordnance.js'
import { BUILD_TYPES, pieceBoxes, piecePositions } from './pieces.js'
import { rebuildStatic } from './world.js'

export { BUILD_GROUPS, BUILD_TYPES, mapObstacles, mapPieces, pieceBoxes, piecePositions } from './pieces.js'

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

export function createBuild() {
  return { list: [], nextId: 1, dirty: false, version: 0, wire: [], pending: [] }
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
  let steep = false
  for (const p of piecePositions(key, x, z, n, rot)) {
    if (Math.abs(p.x) > lx || Math.abs(p.z) > lz) continue
    // Pieces stand on level ground: not on a hillside, in a trench or up on a roof.
    if (!levelGround(w, p.x, p.z)) {
      steep = true
      continue
    }
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
  return { spawned, limited: n < count ? `Build limit reached (${w.caps.structures} pieces)` : steep ? 'Build on flat ground' : null }
}

/** Whether a piece at (x, z) would stand on level ground at ground level. */
function levelGround(w, x, z) {
  const L = w.levels
  if (!L) return true
  if (levelFloorAt(L, x, z) > 0.05) return false
  const T = L.terrain
  if (!T) return true
  for (const [dx, dz] of [
    [0, 0],
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
  ]) {
    if (Math.abs(groundAt(T, x + dx, z + dz)) > 0.25) return false
  }
  return true
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

/** Puts back saved pieces exactly where they were ([key, x, z, rot] each), one rebuild. */
export function addSavedPieces(w, list) {
  for (const [key, x, z, rot] of list) {
    const t = BUILD_TYPES[key]
    if (!t || t.tool || w.build.list.length >= w.caps.structures) continue
    const st = { id: w.build.nextId++, key, x, z, rot: rot ? 1 : 0, hp: t.hp, maxHp: t.hp, seed: ((x * 13.1 + z * 7.7) % 1 + 1) % 1, boxes: pieceBoxes(key, x, z, rot ? 1 : 0) }
    for (const o of st.boxes) o.sid = st.id
    w.build.list.push(st)
  }
  rebuildStatic(w)
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
