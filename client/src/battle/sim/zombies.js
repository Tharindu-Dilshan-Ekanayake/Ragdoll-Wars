import { emitImpact, emitSound } from './fx.js'
import { wrapAngle } from './rig.js'
import { damageStructureNear } from './structures.js'
import { UNIT_TYPES } from './units.js'
import { damageVehicle } from './vehicles.js'
import { meleeHit, removeSoldier, spawnOne } from './world.js'

/**
 * Zombie Horde: hold the west side of the map against 15 waves of the undead.
 *
 * Between waves there's a build phase (it ends when you press Start or the countdown
 * runs out). Every zombie killed pays its bounty, every wave cleared pays a bonus; you
 * spend it on troops, vehicles, defences and strikes (PRICES). Zombies come in from the
 * east edge - and from the flanks in later waves - walk at your nearest soldier or
 * vehicle and hit what they reach; walled in, they bash through. Each one that gets all
 * the way across to the west edge is a breach: ten breaches and it's over. Survive
 * wave 15 to win.
 *
 * Zombies are team 1 soldiers with a zombie type, so everything else - bullets, fire,
 * blasts, ragdolls, the renderer - just works on them. Only so many are alive at once
 * (the preset's team cap); the rest wait their turn at the edge.
 */

export const TOTAL_WAVES = 15
export const START_CASH = 500
const BUILD_TIME_FIRST = 35
const BUILD_TIME = 25
const MAX_BREACHES = 10

/** What everything costs in Zombie Horde. */
export const PRICES = {
  pistol: 40,
  smg: 70,
  rifle: 80,
  shotgun: 90,
  sniper: 150,
  mg: 180,
  rocket: 160,
  flame: 150,
  medic: 120,
  mortar: 220,
  mine: 30,
  jeep: 320,
  apc: 560,
  tank: 950,
  gunship: 850,
  scout: 520,
  airstrike: 450,
  heavybomb: 1300,
  trench: 40,
  sandbags: 25,
  barrier: 35,
  blastwall: 60,
  sandwall: 50,
  pipes: 45,
  tanktrap: 30,
  teeth: 50,
  wire: 20,
  cwall: 70,
  bunker: 260,
  tower: 120,
  helipad: 60,
  container: 90,
  tent: 30,
  camonet: 30,
  floodlight: 25,
  radiomast: 40,
  crate: 10,
  ammocrate: 40,
  drum: 15,
  fuel: 30,
  hay: 15,
  fence: 15,
  tree: 10,
  bush: 10,
  rock: 20,
  remove: 0,
}

const rand = Math.random

export function initZombieMode(w) {
  w.zmode = {
    wave: 0,
    total: TOTAL_WAVES,
    state: 'build',
    cash: START_CASH,
    buildT: BUILD_TIME_FIRST,
    queue: [],
    spawnT: 0,
    breaches: 0,
    maxBreaches: MAX_BREACHES,
    left: 0,
    kills: 0,
    result: null,
  }
}

/** The zombies of wave `n`, in the order they come. */
function composeWave(n) {
  const out = []
  const walkers = 6 + n * 3
  const runners = n >= 3 ? (n - 2) * 2 : 0
  const brutes = n >= 5 ? Math.floor((n - 3) / 2) : 0
  for (let i = 0; i < walkers; i += 1) out.push('zombie')
  // Runners and brutes mixed in through the second half of the wave.
  for (let i = 0; i < runners; i += 1) out.splice(Math.floor(out.length * (0.3 + rand() * 0.7)), 0, 'runner')
  for (let i = 0; i < brutes; i += 1) out.splice(Math.floor(out.length * (0.5 + rand() * 0.5)), 0, 'brute')
  if (n === 10) out.push('behemoth')
  if (n === TOTAL_WAVES) out.push('behemoth', 'behemoth')
  return out
}

/** Ends the build phase early. */
export function startWave(w) {
  const z = w.zmode
  if (!z || z.state !== 'build') return false
  z.wave += 1
  z.queue = composeWave(z.wave)
  z.state = 'wave'
  z.spawnT = 0.5
  emitSound(w.fx, 'horn', w.map.bases[1].x, 2, 0, 0)
  w.version += 1
  return true
}

/** Back to the start of a run (Try again). */
export function restartZombies(w) {
  initZombieMode(w)
  w.version += 1
}

function spawnZombie(w, key) {
  const lx = w.obs.limitX
  const lz = w.obs.limitZ
  let x
  let z
  // From the east edge; later waves send some round the flanks too.
  if (w.zmode.wave >= 6 && rand() < 0.3) {
    x = 10 + rand() * (lx - 14)
    z = (rand() < 0.5 ? -1 : 1) * (lz - 2)
  } else {
    x = lx - 2 - rand() * 18
    z = (rand() * 2 - 1) * (lz - 6)
  }
  const s = spawnOne(w, UNIT_TYPES[key], 1, x, z, -Math.PI / 2, 'attack')
  if (!s) return false
  s.dropY = 0
  s.scale = 1
  s.thinkT = rand() * 0.3
  return true
}

/** Per tick: the build countdown, the spawner, breaches, and winning or losing. */
export function updateZombieMode(w, h) {
  const z = w.zmode
  if (!z || z.result) return
  if (z.state === 'build') {
    z.buildT -= h
    if (z.buildT <= 0) startWave(w)
    z.left = 0
    return
  }
  // Wave in progress: feed zombies in as there's room.
  const zombies = w.teamLiving[1]
  z.spawnT -= h
  while (z.spawnT <= 0 && z.queue.length) {
    if (zombies.length >= w.caps.units) {
      z.spawnT = 0.3
      break
    }
    if (!spawnZombie(w, z.queue[0])) break
    z.queue.shift()
    z.spawnT += Math.max(0.12, 0.5 - z.wave * 0.025)
  }
  // Through to the west edge: a breach.
  const edge = -w.obs.limitX + 4
  for (let i = 0; i < zombies.length; i += 1) {
    const s = zombies[i]
    if (s.alive && s.x < edge) {
      removeSoldier(w, s)
      z.breaches += 1
      emitSound(w.fx, 'breach', s.x, 1, s.z, 0)
      w.version += 1
    }
  }
  let alive = 0
  for (let i = 0; i < zombies.length; i += 1) if (zombies[i].alive) alive += 1
  z.left = z.queue.length + alive
  if (z.breaches >= z.maxBreaches) {
    z.result = 'lost'
    w.version += 1
    return
  }
  if (z.left === 0) {
    z.cash += 150 + z.wave * 30
    if (z.wave >= z.total) {
      z.result = 'won'
    } else {
      z.state = 'build'
      z.buildT = BUILD_TIME
    }
    w.version += 1
  }
}

/** A zombie went down: pay its bounty. */
export function onZombieKilled(w, s) {
  const z = w.zmode
  if (!z) return
  z.cash += UNIT_TYPES[s.type].zombieAI.reward
  z.kills += 1
}

// --- The zombies themselves -------------------------------------------------------------

function nearestPrey(w, s) {
  let best = null
  let bestD = Infinity
  const soldiers = w.teamLiving[0]
  for (let i = 0; i < soldiers.length; i += 1) {
    const e = soldiers[i]
    if (e.dropY > 0) continue
    const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  const vehicles = w.veh.living[0]
  for (let i = 0; i < vehicles.length; i += 1) {
    const v = vehicles[i]
    if (v.spec.air || v.dropY > 0) continue
    const d = (v.x - s.x) ** 2 + (v.z - s.z) ** 2
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}

/**
 * One zombie's turn: pick the nearest soldier or ground vehicle, walk at it (or west if
 * there's nobody), hit it when in reach, bash through anything built in the way.
 * Returns the goal for `move` via the soldier's own fields.
 */
export function zombieStep(w, s, type, h) {
  const ai = type.zombieAI
  s.thinkT -= h
  if (s.thinkT <= 0) {
    s.thinkT = 0.3 + rand() * 0.25
    const prey = nearestPrey(w, s)
    s.target = prey
    s.targetId = prey ? prey.id : 0
    s.goalMode = 1
    s.goalX = prey ? prey.x : -w.obs.limitX - 6
    s.goalZ = prey ? prey.z : s.z
    // Legs shot out: crawl.
    s.wantProne = s.legL > 0 && s.legR > 0
    s.wantCrouch = false
    if (rand() < 0.04) emitSound(w.fx, 'groan', s.x, 1.5, s.z, type.size || 1)
  }
  s.ready = 1
  s.aimPitch = 0
  s.aimYaw += wrapAngle(s.yaw - s.aimYaw) * Math.min(1, h * 6)
  s.fireT -= h

  const t = s.target
  if (t && (!t.alive || t.id !== s.targetId)) s.target = null
  const tg = s.target
  if (tg) {
    const dx = tg.x - s.x
    const dz = tg.z - s.z
    const d = Math.hypot(dx, dz)
    const reach = ai.reach * (type.size || 1) * 0.6 + (tg.isVehicle ? tg.spec.radius : 0.35)
    if (d < reach) {
      s.goalMode = 0
      s.yaw += wrapAngle(Math.atan2(dx, dz) - s.yaw) * Math.min(1, h * 8)
      if (s.fireT <= 0) {
        s.fireT = ai.interval * (0.85 + rand() * 0.3)
        s.recoil = 1
        if (tg.isVehicle) {
          damageVehicle(w, tg, ai.damage * ai.anti, s)
          emitImpact(w.fx, tg.x - dx * 0.3, 1, tg.z - dz * 0.3, 2, w.time)
        } else meleeHit(w, tg, ai.damage, dx / (d || 1), dz / (d || 1), s)
      }
    } else if (s.goalMode === 0) s.goalMode = 1
  }
  // Not getting anywhere? Something's built in the way: smash it.
  if (s.goalMode === 1 && s.detourT > 0 && s.fireT <= 0 && w.build.list.length) {
    s.fireT = ai.interval
    const fx = Math.sin(s.yaw)
    const fz = Math.cos(s.yaw)
    if (damageStructureNear(w, s.x + fx * 0.9, s.z + fz * 0.9, 1.2, ai.damage * ai.bash)) s.recoil = 1
  }
}
