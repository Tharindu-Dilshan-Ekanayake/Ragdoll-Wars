import { GRAVITY } from './constants.js'
import { emitImpact, emitSound } from './fx.js'
import { collideCircle, segmentClear2D, segmentHit3D } from './obstacles.js'
import { explode, fireProjectile } from './ordnance.js'
import { crushStructures } from './structures.js'
import { wrapAngle } from './rig.js'
import { UNIT_TYPES } from './units.js'
import { blastHit, castBullet } from './world.js'

/**
 * Phase 3: vehicles and strikes.
 *
 * Ground vehicles (jeep, APC, tank) drive to their goal - straight when the way is clear,
 * else along the flow field - turning at their own rate, backing up when stuck. Their
 * turret swings to the target and fires its gun (machine gun bullets, or cannon shells
 * that explode); the tank adds a coaxial machine gun. They run over enemy soldiers in
 * their way and shoulder their own aside.
 *
 * Helicopters (gunship, scout) fly at their altitude, circling their target, nose on it
 * when shooting. Shot down, they fall spinning and blow up where they land.
 *
 * Strikes: a jet crosses the map from your side and drops a line of bombs (or one big
 * one) on the spot, with a cooldown per team.
 *
 * Damage: bullets do their damage times the vehicle's `armor` (a tank shrugs them off);
 * blasts do damage times their `anti` (rockets, cannon shells, mines are the tank
 * killers). A destroyed vehicle explodes and leaves a burnt-out wreck for a while.
 */

export const MAX_VEHICLES = 24
export const MAX_JETS = 6
const WRECK_TIME = 25
const THINK = 0.25
const JET_SPEED = 75
const JET_ALT = 45
const JET_START = -300
const JET_END = 340
let nextVehicleId = 1e6

const rand = Math.random
const gauss = () => (rand() + rand() + rand() - 1.5) * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function makeVehicle(slot) {
  return {
    slot,
    id: 0,
    isVehicle: true,
    used: false,
    alive: false,
    wreck: false,
    crashing: false,
    team: 0,
    type: 'jeep',
    spec: null,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    turretYaw: 0,
    hp: 1,
    maxHp: 1,
    aimH: 1,
    hitR: 1,
    order: 'attack',
    holdX: 0,
    holdZ: 0,
    moveX: 0,
    moveZ: 0,
    goalX: 0,
    goalZ: 0,
    goalMode: 0,
    target: null,
    targetId: 0,
    thinkT: 0,
    fireT: 0,
    burstLeft: 1,
    coaxT: 0,
    coaxLeft: 1,
    progressT: 0,
    progressX: 0,
    progressZ: 0,
    reverseT: 0,
    reverseSide: 1,
    orbitA: 0,
    orbitDir: 1,
    spinV: 0,
    dropY: 0,
    dropV: 0,
    wreckT: 0,
    hitT: 9,
    kills: 0,
    selected: false,
    seed: 0,
    // So code written for soldiers can treat a vehicle as a target safely.
    wCrouch: 0,
    wProne: 0,
    wDown: 0,
    downed: false,
    suppress: 0,
  }
}

export function createVehicles() {
  return {
    list: Array.from({ length: MAX_VEHICLES }, (_, i) => makeVehicle(i)),
    living: [[], []],
    jets: Array.from({ length: MAX_JETS }, () => ({ active: false, team: 0, key: '', tx: 0, tz: 0, dx: 1, dz: 0, s: 0, dropped: 0, big: false })),
    /** Battle time each team's strike of each kind is ready again. */
    strikeReady: [{}, {}],
  }
}

export function clearVehicles(w) {
  for (const v of w.veh.list) freeVehicle(v)
  for (const j of w.veh.jets) j.active = false
  w.veh.strikeReady[0] = {}
  w.veh.strikeReady[1] = {}
}

function freeVehicle(v) {
  v.used = false
  v.alive = false
  v.wreck = false
  v.crashing = false
  v.selected = false
  v.target = null
}

// --- Spawning ---------------------------------------------------------------------------

const POS = { x: 0, z: 0 }

/** Drops up to `count` vehicles of `typeKey` for `team` in a row around (x, z). */
export function spawnVehicles(w, typeKey, team, x, z, count, order) {
  const type = UNIT_TYPES[typeKey]
  const spec = type.vehicle
  const list = w.veh.list
  let teamHave = 0
  let typeHave = 0
  for (const v of list) {
    if (!v.used || !v.alive || v.team !== team) continue
    teamHave += 1
    if (v.type === typeKey) typeHave += 1
  }
  if (teamHave >= w.caps.vehicles) return { spawned: 0, limited: `Vehicle limit reached (${w.caps.vehicles})` }
  if (typeHave >= type.max) return { spawned: 0, limited: `Max ${type.max} ${type.name}s per team` }
  const room = Math.min(w.caps.vehicles - teamHave, type.max - typeHave)
  const n = Math.min(count, room)
  const base = w.map.bases[1 - team]
  const face = Math.atan2(base.x - x, base.z - z)
  const sideX = Math.cos(face)
  const sideZ = -Math.sin(face)
  const gap = spec.radius * 2.8
  let spawned = 0
  for (let i = 0; i < n; i += 1) {
    const v = list.find((c) => !c.used)
    if (!v) break
    const off = (i - (n - 1) / 2) * gap
    POS.x = clamp(x + sideX * off, -w.obs.limitX + spec.radius, w.obs.limitX - spec.radius)
    POS.z = clamp(z + sideZ * off, -w.obs.limitZ + spec.radius, w.obs.limitZ - spec.radius)
    if (!spec.air) collideCircle(w.obs, POS, spec.radius)
    resetVehicle(v, typeKey, team, POS.x, POS.z, face, order)
    spawned += 1
  }
  if (spawned) {
    emitSound(w.fx, 'spawn', x, 0.5, z, 0)
    w.version += 1
  }
  return { spawned, limited: n < count ? `Vehicle limit reached` : null }
}

function resetVehicle(v, typeKey, team, x, z, yaw, order) {
  const spec = UNIT_TYPES[typeKey].vehicle
  v.id = nextVehicleId++
  v.used = true
  v.alive = true
  v.wreck = false
  v.crashing = false
  v.team = team
  v.type = typeKey
  v.spec = spec
  v.x = x
  v.z = z
  v.y = spec.air ? spec.alt + 10 : 0
  v.yaw = yaw
  v.turretYaw = yaw
  v.pitch = 0
  v.roll = 0
  v.speed = 0
  v.vx = 0
  v.vy = 0
  v.vz = 0
  v.hp = spec.hp
  v.maxHp = spec.hp
  v.aimH = spec.aimH
  v.hitR = spec.radius * (spec.air ? 0.85 : 0.8)
  v.order = order
  v.holdX = x
  v.holdZ = z
  v.goalMode = 0
  v.target = null
  v.targetId = 0
  v.thinkT = rand() * THINK
  v.fireT = 1 + rand()
  v.burstLeft = spec.gun.burst[0]
  v.coaxT = 1
  v.coaxLeft = 1
  v.progressT = 0
  v.progressX = x
  v.progressZ = z
  v.reverseT = 0
  v.orbitA = rand() * Math.PI * 2
  v.orbitDir = rand() < 0.5 ? 1 : -1
  v.dropY = spec.air ? 0 : 3.5
  v.dropV = 0
  v.wreckT = 0
  v.hitT = 9
  v.kills = 0
  v.selected = false
  v.seed = rand() * 100
}

/** Calls in a strike on (x, z): a jet comes over from `team`'s side of the map. */
export function callStrike(w, typeKey, team, x, z) {
  const type = UNIT_TYPES[typeKey]
  const ready = w.veh.strikeReady[team][typeKey] || 0
  if (ready > w.time) return { spawned: 0, limited: `${type.name} ready in ${Math.ceil(ready - w.time)} s` }
  const jet = w.veh.jets.find((j) => !j.active)
  if (!jet) return { spawned: 0, limited: 'The sky is busy - try again in a moment' }
  const from = w.map.bases[team]
  const to = w.map.bases[1 - team]
  let dx = to.x - from.x
  let dz = to.z - from.z
  const l = Math.hypot(dx, dz) || 1
  dx /= l
  dz /= l
  Object.assign(jet, { active: true, team, key: typeKey, tx: x, tz: z, dx, dz, s: JET_START, dropped: 0, big: Boolean(type.strike.big) })
  w.veh.strikeReady[team][typeKey] = w.time + type.strike.cooldown
  emitSound(w.fx, 'jet', x, 30, z, 0)
  return { spawned: 1, limited: null, info: `${type.name} inbound` }
}

// --- Damage ------------------------------------------------------------------------------

/** `dmg` damage to vehicle `v` (already scaled by armour / anti-armour). */
export function damageVehicle(w, v, dmg, attacker) {
  if (!v.alive) return
  v.hp -= dmg
  v.hitT = 0
  if (v.hp <= 0) destroyVehicle(w, v, attacker)
}

function destroyVehicle(w, v, attacker) {
  v.alive = false
  v.selected = false
  v.target = null
  if (attacker && attacker.alive && attacker.team !== v.team) attacker.kills += 1
  w.version += 1
  if (v.spec.air) {
    // Falls out of the sky, spinning; blows up on the ground.
    v.crashing = true
    v.vy = Math.min(v.vy, 0)
    v.spinV = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 2)
    emitImpact(w.fx, v.x, v.y, v.z, 2, w.time)
    return
  }
  becomeWreck(w, v)
}

function becomeWreck(w, v) {
  v.wreck = true
  v.crashing = false
  v.wreckT = 0
  v.speed = 0
  v.y = 0
  v.pitch = 0
  v.roll = 0
  explode(w, v.x, 1, v.z, 3.5 + v.spec.radius, 110, null, 1)
}

/**
 * First enemy vehicle hit by a bullet from (ox, oy, oz) along unit (dx, dy, dz) within
 * `maxDist`: returns { vehicle, dist } in `out`, or false.
 */
export function traceVehicles(w, team, ox, oy, oz, dx, dy, dz, maxDist, out) {
  const enemies = w.veh.living[1 - team]
  let best = maxDist
  let found = null
  for (let i = 0; i < enemies.length; i += 1) {
    const v = enemies[i]
    const cx = v.x - ox
    const cy = v.y + v.aimH - oy
    const cz = v.z - oz
    const along = cx * dx + cy * dy + cz * dz
    if (along < 0 || along - v.hitR > best) continue
    const px = cx - dx * along
    const py = cy - dy * along
    const pz = cz - dz * along
    const d2 = px * px + py * py + pz * pz
    if (d2 > v.hitR * v.hitR) continue
    const entry = Math.max(0, along - Math.sqrt(v.hitR * v.hitR - d2))
    if (entry < best) {
      best = entry
      found = v
    }
  }
  if (!found) return false
  out.vehicle = found
  out.dist = best
  return true
}

/** Vehicles caught in a blast at (x, y, z) (called by ordnance.explode). */
export function blastVehicles(w, x, y, z, radius, damage, attacker, anti) {
  const list = w.veh.list
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i]
    if (!v.used || !v.alive) continue
    const dx = v.x - x
    const dy = v.y + v.aimH * 0.5 - y
    const dz = v.z - z
    const d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - v.spec.radius * 0.6)
    if (d > radius) continue
    const k = 1 - d / radius
    damageVehicle(w, v, damage * (k + 0.2) * anti, attacker)
  }
}

// --- Thinking ----------------------------------------------------------------------------

function canSeeFrom(w, x, y, z, t) {
  const ty = t.isVehicle ? t.y + t.aimH : 1.0
  return segmentHit3D(w.obs, x, y, z, t.x, ty, t.z, 1.5) === Infinity
}

const CAND = [null, null, null]
const SCORE = [0, 0, 0]

function consider(t, score) {
  if (score >= SCORE[2]) return
  let k = 2
  while (k > 0 && score < SCORE[k - 1]) {
    SCORE[k] = SCORE[k - 1]
    CAND[k] = CAND[k - 1]
    k -= 1
  }
  SCORE[k] = score
  CAND[k] = t
}

/** Picks `v`'s target: soldiers and vehicles, by distance and what its gun is good for. */
function pickTarget(w, v) {
  const spec = v.spec
  const reach = spec.range * (spec.air ? 1.6 : 1.05)
  const reach2 = reach * reach
  SCORE[0] = SCORE[1] = SCORE[2] = Infinity
  CAND[0] = CAND[1] = CAND[2] = null
  const antiArmor = spec.gun.kind !== 'mg'
  const soldiers = w.teamLiving[1 - v.team]
  for (let i = 0; i < soldiers.length; i += 1) {
    const s = soldiers[i]
    if (s.dropY > 0) continue
    const d2 = (s.x - v.x) ** 2 + (s.z - v.z) ** 2
    if (d2 > reach2) continue
    consider(s, Math.sqrt(d2) + (s.downed ? 40 : 0) + (antiArmor ? 10 : 0))
  }
  const vehicles = w.veh.living[1 - v.team]
  for (let i = 0; i < vehicles.length; i += 1) {
    const e = vehicles[i]
    if (e.dropY > 0) continue
    // Cannons don't track aircraft.
    if (e.spec.air && spec.gun.kind === 'cannon' && !spec.air) continue
    const d2 = (e.x - v.x) ** 2 + (e.z - v.z) ** 2
    if (d2 > reach2) continue
    consider(e, Math.sqrt(d2) + (antiArmor ? -30 : e.spec.light ? 5 : 40))
  }
  for (let k = 0; k < 3; k += 1) {
    const t = CAND[k]
    if (!t) continue
    if (spec.air || canSeeFrom(w, v.x, (spec.gunH || 2) + v.y, v.z, t)) return t
  }
  return null
}

function nearestEnemy(w, v) {
  let best = null
  let bestD = Infinity
  for (const list of [w.teamLiving[1 - v.team], w.veh.living[1 - v.team]]) {
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i]
      if (e.downed) continue
      const d = (e.x - v.x) ** 2 + (e.z - v.z) ** 2
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
  }
  return best
}

function think(w, v) {
  const target = pickTarget(w, v)
  if (target && target !== v.target) v.fireT = Math.max(v.fireT, 0.5 + rand() * 0.5)
  v.target = target
  v.targetId = target ? target.id : 0
  if (v.spec.air) return
  if (v.order === 'move') {
    if (Math.hypot(v.moveX - v.x, v.moveZ - v.z) < v.spec.radius + 1) {
      v.order = 'hold'
      v.holdX = v.x
      v.holdZ = v.z
      v.goalMode = 0
    } else setGoal(v, v.moveX, v.moveZ)
    return
  }
  if (v.order === 'hold') {
    if (Math.hypot(v.holdX - v.x, v.holdZ - v.z) > 4) setGoal(v, v.holdX, v.holdZ)
    else v.goalMode = 0
    return
  }
  const d = target ? Math.hypot(target.x - v.x, target.z - v.z) : Infinity
  if (target && d < v.spec.range * 0.72) v.goalMode = 0
  else if (target) setGoal(v, target.x, target.z)
  else {
    const e = nearestEnemy(w, v)
    if (e) setGoal(v, e.x, e.z)
    else v.goalMode = 0
  }
}

function setGoal(v, x, z) {
  v.goalX = x
  v.goalZ = z
  v.goalMode = 1
}

// --- Shooting ----------------------------------------------------------------------------

/** Fires `gun` from (mx, my, mz) at target `t`. */
function shoot(w, v, gun, t, mx, my, mz) {
  const ty = t.isVehicle ? t.y + t.aimH : 1.0
  if (gun.kind === 'mg') {
    const yaw = Math.atan2(t.x - mx, t.z - mz) + gauss() * gun.spread
    const pitch = Math.atan2(ty - my, Math.max(0.5, Math.hypot(t.x - mx, t.z - mz))) + gauss() * gun.spread * 0.6
    const cp = Math.cos(pitch)
    castBullet(w, v.team, v, mx, my, mz, Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, v.spec.range * 1.3, gun.damage, true, true)
    if (t.suppress !== undefined && !t.isVehicle) t.suppress = Math.min(1, t.suppress + 0.08)
    emitSound(w.fx, 'shot', mx, my, mz, gun.sound)
  } else {
    fireProjectile(w, v.team, v, mx, my, mz, t.x + gauss() * gun.spread * 8, ty, t.z + gauss() * gun.spread * 8, gun)
  }
}

function gunStep(w, v, gun, h, timerKey, burstKey, t, mx, my, mz, aimed) {
  v[timerKey] -= h
  if (!t || !aimed || v[timerKey] > 0) return
  shoot(w, v, gun, t, mx, my, mz)
  v[burstKey] -= 1
  if (v[burstKey] <= 0) {
    v[burstKey] = gun.burst[0] + Math.floor(rand() * (gun.burst[1] - gun.burst[0] + 1))
    v[timerKey] = gun.interval + gun.pause * (0.7 + rand() * 0.6)
  } else v[timerKey] = gun.interval
}

// --- Updating ----------------------------------------------------------------------------

const FLOW = { x: 0, z: 0 }

export function updateVehicles(w, h) {
  const veh = w.veh
  veh.living[0].length = 0
  veh.living[1].length = 0
  for (const v of veh.list) if (v.used && v.alive) veh.living[v.team].push(v)

  for (let i = 0; i < veh.list.length; i += 1) {
    const v = veh.list[i]
    if (!v.used) continue
    v.hitT += h
    if (v.wreck) {
      v.wreckT += h
      if (v.wreckT > WRECK_TIME) {
        v.y -= h * 0.4
        if (v.wreckT > WRECK_TIME + 4) {
          freeVehicle(v)
          w.version += 1
        }
      }
      continue
    }
    if (v.crashing) {
      crashStep(w, v, h)
      continue
    }
    if (v.spec.air) airStep(w, v, h)
    else groundStep(w, v, h)
  }
  jetsStep(w, h)
}

function groundStep(w, v, h) {
  const spec = v.spec
  if (v.dropY > 0) {
    v.dropV -= GRAVITY * h
    v.dropY += v.dropV * h
    if (v.dropY <= 0) {
      v.dropY = 0
      emitImpact(w.fx, v.x, 0.1, v.z, 3, w.time)
      emitImpact(w.fx, v.x + spec.radius, 0.1, v.z, 3, w.time)
      emitSound(w.fx, 'thud', v.x, 0.2, v.z, 0)
    }
    return
  }
  v.thinkT -= h
  if (v.thinkT <= 0) {
    v.thinkT = THINK
    think(w, v)
  }

  // Driving.
  let targetSpeed = 0
  let wantYaw = v.yaw
  if (v.reverseT > 0) {
    v.reverseT -= h
    targetSpeed = -spec.speed * 0.45
    wantYaw = v.yaw + v.reverseSide * 0.8
  } else if (v.goalMode === 1) {
    const gx = v.goalX - v.x
    const gz = v.goalZ - v.z
    const dist = Math.hypot(gx, gz)
    let dx = gx / (dist || 1)
    let dz = gz / (dist || 1)
    if (!(dist < 45 && segmentClear2D(w.obs, v.x, v.z, v.goalX, v.goalZ, spec.radius * 0.7))) {
      const field = w.flow.get(v.goalX, v.goalZ)
      if (field && w.flow.direction(field, v.x, v.z, FLOW)) {
        dx = FLOW.x
        dz = FLOW.z
      }
    }
    wantYaw = Math.atan2(dx, dz)
    const off = Math.abs(wrapAngle(wantYaw - v.yaw))
    targetSpeed = spec.speed * clamp(1.15 - off / 1.4, 0.2, 1) * Math.min(1, dist / 8)
    // Stuck? Back up and turn.
    v.progressT += h
    if (v.progressT > 1.6) {
      if (Math.hypot(v.x - v.progressX, v.z - v.progressZ) < 1.2) {
        v.reverseT = 1.1
        v.reverseSide = rand() < 0.5 ? -1 : 1
      }
      v.progressT = 0
      v.progressX = v.x
      v.progressZ = v.z
    }
  } else {
    v.progressT = 0
    v.progressX = v.x
    v.progressZ = v.z
  }
  const turn = spec.turn * h * (v.reverseT > 0 ? 0.7 : 1)
  v.yaw += clamp(wrapAngle(wantYaw - v.yaw), -turn, turn)
  const dv = targetSpeed - v.speed
  v.speed += clamp(dv, -spec.accel * 2 * h, spec.accel * h)
  v.vx = Math.sin(v.yaw) * v.speed
  v.vz = Math.cos(v.yaw) * v.speed
  POS.x = v.x + v.vx * h
  POS.z = v.z + v.vz * h
  collideCircle(w.obs, POS, spec.radius)
  v.x = clamp(POS.x, -w.obs.limitX + spec.radius, w.obs.limitX - spec.radius)
  v.z = clamp(POS.z, -w.obs.limitZ + spec.radius, w.obs.limitZ - spec.radius)
  // A little body roll and pitch from speed and turning.
  v.pitch += (-(dv / Math.max(1, spec.accel)) * 0.03 - v.pitch) * Math.min(1, h * 5)
  v.roll += (clamp(wrapAngle(wantYaw - v.yaw), -0.6, 0.6) * Math.abs(v.speed) * 0.006 - v.roll) * Math.min(1, h * 5)

  crowd(w, v)

  // Turret and guns.
  const t = v.target
  if (t && (!t.alive || t.id !== v.targetId)) v.target = null
  const tg = v.target
  let aimed = false
  if (tg) {
    const want = Math.atan2(tg.x - v.x, tg.z - v.z)
    const rate = (spec.gun.big ? 1.1 : 2.4) * h
    v.turretYaw += clamp(wrapAngle(want - v.turretYaw), -rate, rate)
    const dist = Math.hypot(tg.x - v.x, tg.z - v.z)
    aimed = Math.abs(wrapAngle(want - v.turretYaw)) < 0.06 && dist <= spec.range
  } else {
    v.turretYaw += clamp(wrapAngle(v.yaw - v.turretYaw), -h, h)
  }
  const sy = Math.sin(v.turretYaw)
  const cy = Math.cos(v.turretYaw)
  const reach = spec.length * 0.55
  gunStep(w, v, spec.gun, h, 'fireT', 'burstLeft', tg, v.x + sy * reach, spec.gunH, v.z + cy * reach, aimed)
  // The tank's coaxial machine gun works on soldiers.
  if (spec.coax) gunStep(w, v, spec.coax, h, 'coaxT', 'coaxLeft', tg && !tg.isVehicle ? tg : null, v.x + sy * reach * 0.8 - cy * 0.4, spec.gunH - 0.1, v.z + cy * reach * 0.8 + sy * 0.4, aimed)
}

/** Soldiers in the way: enemies get run over at speed, friends shouldered aside; other vehicles pushed apart. */
function crowd(w, v) {
  const r = v.spec.radius
  const living = w.living
  const fast = Math.abs(v.speed) > 2.5
  // Touching is enough: flimsy pieces go down under the tracks.
  if (Math.abs(v.speed) > 1 && w.build.list.length) crushStructures(w, v.x, v.z, r + 0.45)
  for (let i = 0; i < living.length; i += 1) {
    const s = living[i]
    if (!s.alive || s.dropY > 0) continue
    const dx = s.x - v.x
    const dz = s.z - v.z
    const reach = r + 0.35
    const d2 = dx * dx + dz * dz
    if (d2 > reach * reach) continue
    const d = Math.sqrt(d2) || 0.01
    const nx = dx / d
    const nz = dz / d
    if (s.team !== v.team && fast) {
      blastHit(w, s, 120 + Math.abs(v.speed) * 18, nx * 0.6 + Math.sin(v.yaw) * 0.4, nz * 0.6 + Math.cos(v.yaw) * 0.4, 0.75, v)
    } else {
      s.x = v.x + nx * reach
      s.z = v.z + nz * reach
    }
  }
  const others = w.veh.list
  for (let i = 0; i < others.length; i += 1) {
    const o = others[i]
    if (o === v || !o.used || o.spec.air || (o.crashing && !o.wreck)) continue
    const dx = o.x - v.x
    const dz = o.z - v.z
    const reach = r + o.spec.radius
    const d2 = dx * dx + dz * dz
    if (d2 > reach * reach || d2 < 1e-6) continue
    const d = Math.sqrt(d2)
    const push = (reach - d) * 0.5
    v.x -= (dx / d) * push
    v.z -= (dz / d) * push
    if (!o.wreck) {
      o.x += (dx / d) * push
      o.z += (dz / d) * push
    }
  }
}

function airStep(w, v, h) {
  const spec = v.spec
  v.thinkT -= h
  if (v.thinkT <= 0) {
    v.thinkT = THINK
    think(w, v)
  }
  const t = v.target && v.target.alive && v.target.id === v.targetId ? v.target : null
  if (!t) v.target = null
  // Where to be: circling the target, at the player's move point, or near our side.
  let px
  let pz
  if (v.order === 'move' && Math.hypot(v.moveX - v.x, v.moveZ - v.z) > 3) {
    px = v.moveX
    pz = v.moveZ
  } else if (t) {
    v.orbitA += ((spec.speed * 0.7) / spec.orbit) * h * v.orbitDir
    px = t.x + Math.sin(v.orbitA) * spec.orbit
    pz = t.z + Math.cos(v.orbitA) * spec.orbit
  } else {
    const e = nearestEnemy(w, v)
    const c = w.centroid[v.team]
    px = e ? (e.x + c.x) / 2 : v.order === 'hold' || v.order === 'move' ? v.holdX : c.x
    pz = e ? (e.z + c.z) / 2 : v.order === 'hold' || v.order === 'move' ? v.holdZ : c.z
  }
  px = clamp(px, -w.obs.limitX - 10, w.obs.limitX + 10)
  pz = clamp(pz, -w.obs.limitZ - 10, w.obs.limitZ + 10)
  const dx = px - v.x
  const dz = pz - v.z
  const dist = Math.hypot(dx, dz)
  const want = Math.min(spec.speed, dist * 1.2)
  const tvx = (dx / (dist || 1)) * want
  const tvz = (dz / (dist || 1)) * want
  const k = Math.min(1, h * 1.6)
  const ax = (tvx - v.vx) * k
  const az = (tvz - v.vz) * k
  v.vx += ax
  v.vz += az
  v.x += v.vx * h
  v.z += v.vz * h
  const alt = spec.alt + Math.sin(w.time * 0.7 + v.seed) * 0.8
  v.vy = (alt - v.y) * 1.5
  v.y += v.vy * h
  // Nose on the target when in reach, else into the direction of travel.
  let face = Math.hypot(v.vx, v.vz) > 1 ? Math.atan2(v.vx, v.vz) : v.yaw
  let dTarget = Infinity
  if (t) {
    dTarget = Math.hypot(t.x - v.x, t.z - v.z)
    if (dTarget < spec.range * 1.2) face = Math.atan2(t.x - v.x, t.z - v.z)
  }
  v.yaw += clamp(wrapAngle(face - v.yaw), -h * 2, h * 2)
  // Lean into acceleration: nose down to speed up, bank into turns.
  const fwdX = Math.sin(v.yaw)
  const fwdZ = Math.cos(v.yaw)
  const fwdA = (ax * fwdX + az * fwdZ) / Math.max(h, 1e-3)
  const sideA = (ax * fwdZ - az * fwdX) / Math.max(h, 1e-3)
  v.pitch += (clamp(fwdA * 0.02 + Math.hypot(v.vx, v.vz) * 0.006, -0.3, 0.35) - v.pitch) * Math.min(1, h * 3)
  v.roll += (clamp(-sideA * 0.03, -0.45, 0.45) - v.roll) * Math.min(1, h * 3)
  v.turretYaw = v.yaw
  const aimed = Boolean(t) && dTarget <= spec.range && Math.abs(wrapAngle(Math.atan2(t.x - v.x, t.z - v.z) - v.yaw)) < 0.3
  const side = v.burstLeft % 2 === 0 ? 1 : -1
  const s = spec.scale || 1
  gunStep(w, v, spec.gun, h, 'fireT', 'burstLeft', t, v.x + fwdX * 2 * s + fwdZ * side * 1.1 * s, v.y + 1.2 * s, v.z + fwdZ * 2 * s - fwdX * side * 1.1 * s, aimed)
}

function crashStep(w, v, h) {
  v.vy -= 9.8 * h
  v.y += v.vy * h
  v.x += v.vx * h * 0.8
  v.z += v.vz * h * 0.8
  v.yaw += v.spinV * h
  v.roll += h * 0.6
  v.pitch += h * 0.3
  if (v.y <= 0.3) {
    v.y = 0
    emitImpact(w.fx, v.x, 0.5, v.z, 3, w.time)
    becomeWreck(w, v)
  }
}

function jetsStep(w, h) {
  for (const j of w.veh.jets) {
    if (!j.active) continue
    j.s += JET_SPEED * h
    const type = UNIT_TYPES[j.key]
    const st = type.strike
    const fall = Math.sqrt((2 * JET_ALT) / st.fall)
    // Each bomb leaves the jet so it lands on its spot along the line.
    while (j.dropped < st.bombs) {
      const along = (j.dropped - (st.bombs - 1) / 2) * st.spacing
      if (j.s < along - JET_SPEED * fall) break
      const x = j.tx + j.dx * j.s
      const z = j.tz + j.dz * j.s
      fireProjectile(w, j.team, null, x, JET_ALT - 1.5, z, j.tx + j.dx * along, 0, j.tz + j.dz * along, { kind: 'bomb', blast: st.blast, fall: st.fall, speed: JET_SPEED, big: Boolean(st.big) })
      j.dropped += 1
    }
    if (j.s > JET_END) j.active = false
  }
}

/** Where a jet is right now (for drawing): writes x, y, z into `out`. */
export function jetPosition(j, out) {
  out.x = j.tx + j.dx * j.s
  out.y = JET_ALT
  out.z = j.tz + j.dz * j.s
  return out
}

// --- Selection and orders ----------------------------------------------------------------

export function vehicleOrders(w, order) {
  for (const v of w.veh.list) {
    if (!v.used || !v.alive || !v.selected) continue
    v.order = order
    v.holdX = v.x
    v.holdZ = v.z
  }
}

/** Sends the selected vehicles towards (x, z), spread out around it. Returns how many. */
export function moveVehicles(w, x, z) {
  const sel = w.veh.list.filter((v) => v.used && v.alive && v.selected)
  sel.forEach((v, i) => {
    const a = (i / Math.max(1, sel.length)) * Math.PI * 2
    const r = sel.length > 1 ? 4 + v.spec.radius : 0
    v.order = 'move'
    v.moveX = x + Math.sin(a) * r
    v.moveZ = z + Math.cos(a) * r
    v.holdX = v.moveX
    v.holdZ = v.moveZ
    v.thinkT = 0
    v.reverseT = 0
  })
  return sel.length
}

export function deleteVehicles(w) {
  let n = 0
  for (const v of w.veh.list) {
    if (!v.used || !v.alive || !v.selected) continue
    emitImpact(w.fx, v.x, 1, v.z, 3, w.time)
    freeVehicle(v)
    n += 1
  }
  if (n) w.version += 1
  return n
}
