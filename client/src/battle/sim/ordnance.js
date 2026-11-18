import { emitExplosion, emitFlame, emitFlash, emitImpact, emitSound } from './fx.js'
import { collideCircle, segmentHit3D } from './obstacles.js'
import { startRagdoll } from './ragdoll.js'
import { J_PELVIS, wrapAngle } from './rig.js'
import { UNIT_TYPES } from './units.js'
import { blastHit } from './world.js'

/**
 * Phase 2 ordnance: rockets and mortar shells in flight, explosions, landmines, the
 * flamethrower's cone, and setting soldiers alight. Everything is pooled (fixed arrays
 * made once per battle); nothing allocates while the battle runs.
 *
 * Explosions hurt everyone in reach - friendly fire included - falling off with
 * distance, cut down to a third behind cover. They throw the dead as ragdolls (within
 * the ragdoll budget; the rest get a scripted fling), toss bodies already lying there,
 * and set off nearby mines, which go a moment later so chains ripple outwards.
 */

export const MAX_PROJECTILES = 48
export const MAX_MINES = 64
const ROCKET_GRAVITY = 0.8
const SHELL_GRAVITY = 9.8
const MINE_TRIGGER = 1.05
const MINE_ARM = 1.0

const rand = Math.random
const gauss = () => (rand() + rand() + rand() - 1.5) * 2

export function createOrdnance() {
  return {
    projectiles: Array.from({ length: MAX_PROJECTILES }, () => ({
      active: false,
      shell: false,
      team: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      life: 0,
      radius: 0,
      damage: 0,
      shooter: null,
      shooterId: 0,
    })),
    mines: Array.from({ length: MAX_MINES }, () => ({ active: false, team: 0, x: 0, z: 0, armT: 0, trip: false, seed: 0 })),
  }
}

export function clearOrdnance(w) {
  for (const p of w.ord.projectiles) {
    p.active = false
    p.shooter = null
  }
  for (const m of w.ord.mines) m.active = false
}

// --- Projectiles ----------------------------------------------------------------------

/**
 * Fires `type`'s projectile from the muzzle (mx, my, mz) at soldier `t`. Rockets fly
 * straight (a touch of drop, aimed for); shells are lobbed to land near the target.
 * Returns false when every projectile slot is in use.
 */
export function launchProjectile(w, s, type, t, mx, my, mz, targetY) {
  const pool = w.ord.projectiles
  let p = null
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].active) {
      p = pool[i]
      break
    }
  }
  if (!p) return false
  p.active = true
  p.team = s.team
  p.x = mx
  p.y = my
  p.z = mz
  p.age = 0
  p.radius = type.blast.radius
  p.damage = type.blast.damage
  p.shooter = s
  p.shooterId = s.id
  if (type.proj === 'shell') {
    p.shell = true
    const dist = Math.hypot(t.x - mx, t.z - mz)
    const err = dist * type.scatter
    // Lead a moving target a little.
    const tx = t.x + t.vx * 1.2 + gauss() * err
    const tz = t.z + t.vz * 1.2 + gauss() * err
    const T = 2 + dist / 55
    p.vx = (tx - mx) / T
    p.vz = (tz - mz) / T
    p.vy = (0.5 * SHELL_GRAVITY * T * T - my) / T
    p.life = T + 2
    emitSound(w.fx, 'mortar', mx, my, mz, 0)
  } else {
    p.shell = false
    const dx = t.x - mx
    const dz = t.z - mz
    const dist = Math.max(1, Math.hypot(dx, dz))
    const T = dist / type.projSpeed
    const yaw = Math.atan2(dx, dz) + gauss() * type.spread
    const pitch = Math.atan2(targetY - my + 0.5 * ROCKET_GRAVITY * T * T, dist) + gauss() * type.spread * 0.6
    const cp = Math.cos(pitch)
    p.vx = Math.sin(yaw) * cp * type.projSpeed
    p.vy = Math.sin(pitch) * type.projSpeed
    p.vz = Math.cos(yaw) * cp * type.projSpeed
    p.life = (type.range * 1.4) / type.projSpeed
    emitSound(w.fx, 'launch', mx, my, mz, 0)
  }
  const sp = Math.hypot(p.vx, p.vy, p.vz) || 1
  emitFlash(w.fx, mx, my, mz, p.vx / sp, p.vy / sp, p.vz / sp, w.time, p.shell ? 1.3 : 1.6)
  return true
}

export function updateProjectiles(w, h) {
  const pool = w.ord.projectiles
  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[i]
    if (!p.active) continue
    const ox = p.x
    const oy = p.y
    const oz = p.z
    p.vy -= (p.shell ? SHELL_GRAVITY : ROCKET_GRAVITY) * h
    p.x += p.vx * h
    p.y += p.vy * h
    p.z += p.vz * h
    p.age += h
    // First thing hit along this step: cover, the ground, or (rockets) an enemy.
    let tHit = segmentHit3D(w.obs, ox, oy, oz, p.x, p.y, p.z, 0)
    if (p.y <= 0) {
      const tg = oy / (oy - p.y)
      if (tg < tHit) tHit = tg
    }
    if (!p.shell && tHit > 1) {
      const enemies = w.teamLiving[1 - p.team]
      for (let k = 0; k < enemies.length; k += 1) {
        const e = enemies[k]
        if (e.dropY > 0) continue
        const dx = e.x - p.x
        const dz = e.z - p.z
        if (dx * dx + dz * dz < 0.36 && p.y < 1.9) {
          tHit = 1
          break
        }
      }
    }
    const expired = p.age > p.life || Math.abs(p.x) > w.obs.halfW + 40 || Math.abs(p.z) > w.obs.halfD + 40
    if (tHit <= 1 || expired) {
      const k = tHit <= 1 ? tHit : 1
      const hx = ox + (p.x - ox) * k
      const hy = Math.max(0.15, oy + (p.y - oy) * k)
      const hz = oz + (p.z - oz) * k
      const attacker = p.shooter && p.shooter.id === p.shooterId ? p.shooter : null
      p.active = false
      p.shooter = null
      explode(w, hx, hy, hz, p.radius, p.damage, attacker)
    }
  }
}

// --- Explosions -------------------------------------------------------------------------

/**
 * A blast at (x, y, z): damages and throws every soldier within `radius` (any team),
 * tosses bodies already down, and trips mines close by.
 */
export function explode(w, x, y, z, radius, damage, attacker) {
  emitExplosion(w.fx, x, y, z, radius, w.time)
  emitSound(w.fx, 'boom', x, y, z, radius)
  for (let k = 0; k < 6; k += 1) emitImpact(w.fx, x + gauss() * radius * 0.25, 0.05, z + gauss() * radius * 0.25, 0, w.time)
  emitImpact(w.fx, x, 0.4, z, 3, w.time)

  const living = w.living
  for (let i = 0; i < living.length; i += 1) {
    const s = living[i]
    if (!s.alive || s.dropY > 0) continue
    const dx = s.x - x
    const dz = s.z - z
    const dy = 0.9 - y
    const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.5)
    if (d > radius) continue
    const k = 1 - d / radius
    const covered = segmentHit3D(w.obs, x, y + 0.3, z, s.x, 0.9, s.z, 0) < 0.97
    const dmg = (damage * k * k + 12 * k) * (covered ? 0.3 : 1)
    const hl = Math.hypot(dx, dz) || 1
    blastHit(w, s, dmg, dx / hl, dz / hl, covered ? k * 0.4 : k, attacker)
  }

  // Bodies already lying here get thrown about again (within the ragdoll budget).
  const bodies = w.bodies
  for (let i = 0; i < bodies.length && w.ragdolls.length < w.caps.ragdolls; i += 1) {
    const b = bodies[i]
    if (b.ragActive || b.crumple || b.flinging || b.sinkT > 0) continue
    const px = b.joints[J_PELVIS * 3]
    const pz = b.joints[J_PELVIS * 3 + 2]
    const dx = px - x
    const dz = pz - z
    const d = Math.hypot(dx, dz)
    if (d > radius * 1.2) continue
    const k = 1 - d / (radius * 1.2)
    const hl = d || 1
    startRagdoll(b, 0, 0, -1, (dx / hl) * 0.6, 0.8, (dz / hl) * 0.6, 8 + 18 * k)
    w.ragdolls.push(b)
  }

  // Mines close by go off a moment later.
  const mines = w.ord.mines
  const reach2 = radius * 0.75 * (radius * 0.75)
  for (let i = 0; i < mines.length; i += 1) {
    const m = mines[i]
    if (!m.active) continue
    const dx = m.x - x
    const dz = m.z - z
    if (dx * dx + dz * dz < reach2) m.trip = true
  }
}

// --- Mines ------------------------------------------------------------------------------

const POS = { x: 0, z: 0 }

/** Lays up to `count` mines for `team` in a small spiral round (x, z). */
export function placeMines(w, team, x, z, count) {
  const type = UNIT_TYPES.mine
  const mines = w.ord.mines
  let have = 0
  for (const m of mines) if (m.active && m.team === team) have += 1
  const room = type.max - have
  if (room <= 0) return { spawned: 0, limited: `Max ${type.max} mines per team` }
  const n = Math.min(count, room)
  let spawned = 0
  for (let i = 0; i < n; i += 1) {
    let m = null
    for (const c of mines) {
      if (!c.active) {
        m = c
        break
      }
    }
    if (!m) break
    const a = i * 2.4
    const r = 1.7 * Math.sqrt(i)
    POS.x = Math.max(-w.obs.limitX, Math.min(w.obs.limitX, x + Math.sin(a) * r))
    POS.z = Math.max(-w.obs.limitZ, Math.min(w.obs.limitZ, z + Math.cos(a) * r))
    collideCircle(w.obs, POS, 0.3)
    m.active = true
    m.team = team
    m.x = POS.x
    m.z = POS.z
    m.armT = MINE_ARM
    m.trip = false
    m.seed = rand() * 10
    emitImpact(w.fx, m.x, 0.05, m.z, 3, w.time)
    spawned += 1
  }
  if (spawned) emitSound(w.fx, 'reload', x, 0.2, z, 'mine')
  return { spawned, limited: n < count ? `Max ${type.max} mines per team` : null }
}

export function updateMines(w, h) {
  const mines = w.ord.mines
  const blast = UNIT_TYPES.mine.blast
  for (let i = 0; i < mines.length; i += 1) {
    const m = mines[i]
    if (!m.active) continue
    let go = m.trip
    if (!go) {
      if (m.armT > 0) {
        m.armT -= h
        continue
      }
      const enemies = w.teamLiving[1 - m.team]
      for (let k = 0; k < enemies.length; k += 1) {
        const e = enemies[k]
        if (e.dropY > 0) continue
        const dx = e.x - m.x
        const dz = e.z - m.z
        if (dx * dx + dz * dz < MINE_TRIGGER * MINE_TRIGGER) {
          go = true
          break
        }
      }
    }
    if (go) {
      m.active = false
      explode(w, m.x, 0.15, m.z, blast.radius, blast.damage, null)
    }
  }
}

// --- Fire -------------------------------------------------------------------------------

let flameTick = 0

/**
 * One burst of flame from the muzzle along soldier `s`'s aim: sets alight every enemy
 * in the cone who isn't behind a wall.
 */
export function flameBurst(w, s, type, mx, my, mz) {
  const yaw = s.aimYaw + gauss() * 0.04
  const len = type.range * (0.85 + rand() * 0.2)
  const cp = Math.cos(s.aimPitch)
  emitFlame(w.fx, mx, my, mz, Math.sin(yaw) * cp, Math.sin(s.aimPitch), Math.cos(yaw) * cp, len, w.time)
  flameTick += 1
  if (flameTick % 3 === 0) emitSound(w.fx, 'flame', mx, my, mz, 0)
  const enemies = w.teamLiving[1 - s.team]
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i]
    if (e.dropY > 0) continue
    const dx = e.x - s.x
    const dz = e.z - s.z
    const d = Math.hypot(dx, dz)
    if (d > len + 0.4) continue
    const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw))
    if (off > 0.26 + 0.5 / (d + 1)) continue
    if (segmentHit3D(w.obs, mx, 0.9, mz, e.x, 0.9, e.z, 0) < 0.95) continue
    ignite(e, type.flame, s, type.interval)
  }
}

/** Sets soldier `e` alight (or keeps them burning), with a first lick of damage. */
export function ignite(e, flame, attacker, dt) {
  e.burnT = Math.max(e.burnT, flame.burn)
  e.burnDps = flame.dps
  e.hp -= flame.dps * dt
  e.hurtT = 0
  e.suppress = 1
  e.burnerSlot = attacker ? attacker.slot : -1
  e.burnerId = attacker ? attacker.id : 0
}

// --- Medics -----------------------------------------------------------------------------

/** How badly soldier `p` needs a medic: 0 not at all, higher is more urgent. */
export function needsMedic(p) {
  if (p.downed) return 3
  if (p.burnT > 0) return 2.5
  if (p.hp < p.maxHp * 0.7 || p.bleed > 0.6) return 1
  return 0
}

/** Whether another living medic is already on its way to `p`. */
function claimed(w, p, medic) {
  if (!p.medicId || p.medicId === medic.id) return false
  const m = w.slots[p.medicSlot]
  return Boolean(m && m.alive && m.id === p.medicId && m.patient === p)
}

/** The most urgent hurt teammate within `range` of medic `s` that no one's seeing to. */
export function findPatient(w, s, range) {
  const friends = w.teamLiving[s.team]
  let best = null
  let bestScore = Infinity
  for (let i = 0; i < friends.length; i += 1) {
    const p = friends[i]
    if (p === s || p.dropY > 0) continue
    const need = needsMedic(p)
    if (!need) continue
    const d = Math.hypot(p.x - s.x, p.z - s.z)
    if (d > range || claimed(w, p, s)) continue
    const score = d - need * 12
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

export function assignPatient(s, p) {
  s.patient = p
  s.patientId = p.id
  s.healT = 0
  p.medicId = s.id
  p.medicSlot = s.slot
}

export function clearPatient(s) {
  const p = s.patient
  if (p && p.medicId === s.id) {
    p.medicId = 0
    p.medicSlot = -1
  }
  s.patient = null
  s.patientId = 0
  s.healT = 0
}

/** Patches `p` up: health back, bleeding and fire out, back on their feet. */
export function healPatient(w, p, medic) {
  p.hp = Math.min(p.maxHp, p.hp + medic.heal)
  p.bleed = 0
  p.burnT = 0
  p.legL = 0
  p.legR = 0
  p.armL = 0
  p.armR = 0
  p.staggerT = 0
  if (p.downed) {
    p.downed = false
    p.downT = 0
    p.goalMode = 0
    p.hp = Math.max(p.hp, p.maxHp * 0.5)
  }
  emitSound(w.fx, 'heal', p.x, 1, p.z, 0)
  w.version += 1
}
