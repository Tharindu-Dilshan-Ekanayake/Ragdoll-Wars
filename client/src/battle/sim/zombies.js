import { emitImpact, emitSound } from './fx.js'
import { J_PELVIS, wrapAngle } from './rig.js'
import { damageStructureNear } from './structures.js'
import { UNIT_TYPES } from './units.js'
import { damageVehicle } from './vehicles.js'
import { fireAcid } from './ordnance.js'
import { segmentHit3D } from './obstacles.js'
import { meleeHit, rebuildStatic, removeSoldier, spawnOne } from './world.js'
import { clampToDeck, rampartHealth, segAt } from './rampart.js'
import { cellIndex, reachableFrom } from './nav.js'

/**
 * Zombie Horde: hold the west side of the map against 20 waves of the undead.
 *
 * Between waves there's a build phase (it ends when you press Start or the countdown
 * runs out). Every zombie killed pays its bounty, every wave cleared pays a bonus; you
 * spend it on troops, vehicles, defences and strikes (PRICES). Zombies come in from the
 * east edge - and from the flanks in later waves - walk at your nearest soldier or
 * vehicle and hit what they reach; walled in, they bash through. Each one that gets all
 * the way across to the west edge is a breach: ten breaches and it's over. Survive
 * wave 20 to win. Spitters (from wave 4) lob acid from range, up onto the wall too;
 * behemoths lead waves 10, 15 and 18, and the last wave is a horde of the big ones.
 *
 * On a map with a rampart (Mirefall Bastion) the wall is what you defend: your troops
 * stand up on it and the zombies can't reach them, so they pile up at its foot and batter
 * the section in front of them. A section battered to nothing falls - with whoever stood
 * on it - and the horde pours through the gap; one that gets right through to the camp
 * wrecks more of the wall. When the whole wall is down, it's over. Cleared waves patch
 * it up (a little) and rebuild what fell (at a quarter).
 *
 * Zombies are team 1 soldiers with a zombie type, so everything else - bullets, fire,
 * blasts, ragdolls, the renderer - just works on them. Only so many are alive at once
 * (the preset's team cap); the rest wait their turn at the edge.
 */

export const TOTAL_WAVES = 20
export const START_CASH = 450
const BUILD_TIME_FIRST = 35
const BUILD_TIME = 25
const MAX_BREACHES = 10
/** How hard zombies hit the wall (times their melee damage and `bash`). */
const WALL_BASH = 2.4
/** A zombie through to the camp behind a rampart: the wall damage it does. */
const BREACH_WALL = 1200
/** Zombies get tougher as the waves go on: this much more health per wave. */
const HP_PER_WAVE = 0.06
/** Share of a zombie's listed bounty you actually get. */
const BOUNTY = 0.7

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
  const walkers = 10 + n * 4
  const runners = n >= 2 ? (n - 1) * 3 : 0
  const brutes = (n >= 4 ? Math.floor((n - 2) / 2) : 0) + (n >= 15 ? 3 : 0) + (n >= 19 ? 4 : 0)
  const spitters = n >= 3 ? Math.min(14, Math.floor(n / 2) + 1) : 0
  for (let i = 0; i < walkers; i += 1) out.push('zombie')
  // Runners, spitters and brutes mixed in through the rest of the wave.
  for (let i = 0; i < runners; i += 1) out.splice(Math.floor(out.length * (0.3 + rand() * 0.7)), 0, 'runner')
  for (let i = 0; i < spitters; i += 1) out.splice(Math.floor(out.length * (0.2 + rand() * 0.8)), 0, 'spitter')
  for (let i = 0; i < brutes; i += 1) out.splice(Math.floor(out.length * (0.5 + rand() * 0.5)), 0, 'brute')
  if (n === 8 || n === 12) out.push('behemoth')
  if (n === 10 || n === 15 || n === 18) out.push('behemoth', 'behemoth')
  // The last wave: the big ones, one after another at the end.
  if (n === TOTAL_WAVES) out.push('brute', 'behemoth', 'brute', 'behemoth', 'brute', 'behemoth')
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
  repairRampart(w, true)
  w.version += 1
}

// --- The rampart ------------------------------------------------------------------------

/** A blow to a rampart section; it falls when it's had enough. */
function hitWall(w, seg, dmg, s) {
  seg.hp -= dmg * WALL_BASH
  const r = w.rampart
  emitImpact(w.fx, r.front + 0.05, 0.4 + rand() * 2.6, s.z + (rand() - 0.5) * 0.8, 2, w.time)
  if (rand() < 0.35) emitSound(w.fx, 'thud', r.front, 1.5, s.z, 0)
  if (seg.hp <= 0) collapseSegment(w, seg)
  else r.version += 1
}

/**
 * A section comes down: its boxes go (zombies can walk through), the troops on top drop
 * to the ground with it (shaken and hurt), the dead up there land in the rubble, and a
 * cloud of dust goes up.
 */
export function collapseSegment(w, seg) {
  const r = w.rampart
  seg.up = false
  seg.hp = 0
  w.baseObstacles = w.baseObstacles.filter((o) => !seg.boxes.includes(o))
  rebuildStatic(w)
  for (const s of w.slots) {
    if (!s.used) continue
    if (s.alive) {
      if (s.deck !== seg.i) continue
      s.deck = -1
      s.dropY = s.fy
      s.dropV = 1.5
      s.fy = 0
      s.goalMode = 0
      s.hp = Math.max(1, s.hp - 25)
      s.hurtT = 0
    } else {
      const j = s.joints
      const px = j[J_PELVIS * 3]
      const pz = j[J_PELVIS * 3 + 2]
      if (px < seg.fx0 || px > seg.fx1 || pz < seg.fz0 || pz > seg.fz1 || j[J_PELVIS * 3 + 1] < seg.h * 0.5) continue
      for (let k = 1; k < j.length; k += 3) j[k] = Math.max(0.05, j[k] - seg.h)
      s.poseVersion += 1
    }
  }
  const cx = (seg.fx0 + seg.fx1) / 2
  const cz = (seg.fz0 + seg.fz1) / 2
  for (let k = 0; k < 14; k += 1) {
    emitImpact(w.fx, seg.fx0 + rand() * (seg.fx1 - seg.fx0), rand() * seg.h, seg.fz0 + rand() * (seg.fz1 - seg.fz0), 3, w.time)
  }
  emitSound(w.fx, 'boom', cx, 2, cz, 6)
  r.version += 1
  w.version += 1
}

/**
 * Between waves: every section patched up a third of the way, fallen ones rebuilt to
 * half strength (`full`: everything back as new). Anyone standing where a section goes
 * back up finds themselves on top of it; zombies there are shoved out in front.
 */
export function repairRampart(w, full = false) {
  const r = w.rampart
  if (!r) return
  let rebuilt = false
  for (const seg of r.segs) {
    if (seg.up) {
      seg.hp = full ? seg.max : Math.min(seg.max, seg.hp + seg.max * 0.12)
      continue
    }
    seg.up = true
    seg.hp = full ? seg.max : seg.max * 0.25
    for (const o of seg.boxes) if (!w.baseObstacles.includes(o)) w.baseObstacles.push(o)
    rebuilt = true
    const p = { x: 0, z: 0 }
    for (const s of w.slots) {
      if (!s.used || !s.alive || s.deck >= 0) continue
      if (s.x < seg.fx0 || s.x > seg.fx1 || s.z < seg.fz0 || s.z > seg.fz1) continue
      if (s.team === 0) {
        p.x = s.x
        p.z = s.z
        clampToDeck(r, seg.i, p)
        s.x = p.x
        s.z = p.z
        s.deck = seg.i
        s.fy = seg.h
      } else s.x = r.front + 0.6
    }
  }
  if (rebuilt) rebuildStatic(w)
  r.version += 1
  w.version += 1
}

/** Where a zombie of the coming wave climbs out: by the rampart, out of the mist off the wall. */
function spawnPoint(w) {
  const lx = w.obs.limitX
  const lz = w.obs.limitZ
  const r = w.rampart
  // Facing a rampart they come out of the mist 40-70 m off the wall, not the far edge.
  if (r) {
    if (w.zmode.wave >= 6 && rand() < 0.25) return [r.front + 14 + rand() * 40, (rand() < 0.5 ? -1 : 1) * (lz - 2)]
    return [r.front + 40 + rand() * 30, (rand() * 2 - 1) * (lz - 4)]
  }
  // From the east edge; later waves send some round the flanks too.
  if (w.zmode.wave >= 6 && rand() < 0.3) return [10 + rand() * (lx - 14), (rand() < 0.5 ? -1 : 1) * (lz - 2)]
  return [lx - 2 - rand() * 18, (rand() * 2 - 1) * (lz - 6)]
}

function spawnZombie(w, key) {
  // Only on open ground that joins up with the rest of the field (not shut in a ruin).
  const g = w.grid
  if (!g.zReach) {
    const far = w.map.bases[1]
    g.zReach = reachableFrom(g, far.x, far.z)
  }
  let x = 0
  let z = 0
  for (let tries = 0; tries < 10; tries += 1) {
    ;[x, z] = spawnPoint(w)
    if (g.zReach[cellIndex(g, x, z)]) break
  }
  const s = spawnOne(w, UNIT_TYPES[key], 1, x, z, -Math.PI / 2, 'attack')
  if (!s) return false
  s.dropY = 0
  s.scale = 1
  s.thinkT = rand() * 0.3
  s.hp = s.maxHp = Math.round(s.maxHp * (1 + (w.zmode.wave - 1) * HP_PER_WAVE))
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
    z.spawnT += Math.max(0.1, 0.45 - z.wave * 0.025)
  }
  // Through to the west edge: a breach (behind a rampart, it wrecks more of the wall).
  const edge = -w.obs.limitX + 4
  const r = w.rampart
  for (let i = 0; i < zombies.length; i += 1) {
    const s = zombies[i]
    if (s.alive && s.x < edge) {
      removeSoldier(w, s)
      z.breaches += 1
      emitSound(w.fx, 'breach', s.x, 1, s.z, 0)
      if (r) {
        let weakest = null
        for (const g of r.segs) if (g.up && (!weakest || g.hp < weakest.hp)) weakest = g
        if (weakest) {
          weakest.hp -= BREACH_WALL
          if (weakest.hp <= 0) collapseSegment(w, weakest)
          else r.version += 1
        }
      }
      w.version += 1
    }
  }
  let alive = 0
  for (let i = 0; i < zombies.length; i += 1) if (zombies[i].alive) alive += 1
  z.left = z.queue.length + alive
  // The wall is down (with a rampart), or too many got through (without).
  if (r ? rampartHealth(r) <= 0 : z.breaches >= z.maxBreaches) {
    z.result = 'lost'
    w.version += 1
    return
  }
  if (z.left === 0) {
    repairRampart(w)
    z.cash += 100 + z.wave * 15
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
  z.cash += Math.round(UNIT_TYPES[s.type].zombieAI.reward * BOUNTY)
  z.kills += 1
}

// --- The zombies themselves -------------------------------------------------------------

/**
 * A spitter's turn at range: the nearest soldier within reach that it can see (wall-top
 * troops included) - stop, face them, retch up a gob of acid. True while it's busy.
 */
function spit(w, s, sp, h) {
  s.spitT = (s.spitT || 0) - h
  let best = null
  let bestD = sp.range * sp.range
  const soldiers = w.teamLiving[0]
  for (let i = 0; i < soldiers.length; i += 1) {
    const e = soldiers[i]
    if (!e.alive || e.dropY > 0) continue
    const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  if (!best) return false
  const my = s.fy + 1.5 * (UNIT_TYPES[s.type].size || 1)
  // Lobbed: it drops in from above, so it only needs the target clear from the arc's
  // height (over a parapet, not through a roof).
  if (segmentHit3D(w.obs, (s.x + best.x) / 2, Math.max(my, best.fy) + 6, (s.z + best.z) / 2, best.x, best.fy + 1.2, best.z, 0) <= 1) return false
  s.goalMode = 0
  s.target = null
  s.yaw += wrapAngle(Math.atan2(best.x - s.x, best.z - s.z) - s.yaw) * Math.min(1, h * 6)
  if (s.spitT <= 0) {
    s.spitT = sp.interval * (0.85 + rand() * 0.3)
    s.recoil = 1
    const lead = Math.sqrt(bestD) / 18
    fireAcid(w, s, s.x, my, s.z, best.x + best.vx * lead, best.fy + 0.9, best.z + best.vz * lead, sp)
  }
  return true
}

/** The fallen rampart section nearest z, or null. */
function nearestGap(r, z) {
  let best = null
  let bestD = Infinity
  for (const seg of r.segs) {
    if (seg.up) continue
    const d = Math.abs((seg.fz0 + seg.fz1) / 2 - z)
    if (d < bestD) {
      bestD = d
      best = seg
    }
  }
  return best
}

function nearestPrey(w, s) {
  let best = null
  let bestD = Infinity
  const soldiers = w.teamLiving[0]
  for (let i = 0; i < soldiers.length; i += 1) {
    const e = soldiers[i]
    // Up on the rampart: out of reach.
    if (e.dropY > 0 || e.fy > 0) continue
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
    let prey = nearestPrey(w, s)
    s.goalMode = 1
    s.goalX = prey ? prey.x : -w.obs.limitX - 6
    s.goalZ = prey ? prey.z : s.z
    s.wallSeg = -1
    const r = w.rampart
    if (r && s.x > r.back - 0.5) {
      // Still out in front of the wall: only what's out here too can be reached.
      if (prey && prey.x < r.front + 0.5) prey = null
      if (!prey) {
        const seg = segAt(r, s.z)
        const gap = nearestGap(r, s.z)
        // Some of them make for a gap when there is one; the rest pound their bit.
        if (seg && seg.up && !(gap && (s.seed * 0.137) % 1 < 0.55)) {
          s.wallSeg = seg.i
          s.goalX = r.front + 0.5
          s.goalZ = Math.max(seg.fz0 + 0.8, Math.min(seg.fz1 - 0.8, s.z))
        } else if (gap) {
          s.goalX = r.back - 4
          s.goalZ = Math.max(gap.fz0 + 1.2, Math.min(gap.fz1 - 1.2, s.z))
        }
      }
    }
    s.target = prey
    s.targetId = prey ? prey.id : 0
    // Legs shot out: crawl.
    s.wantProne = s.legL > 0 && s.legR > 0
    s.wantCrouch = false
    if (rand() < 0.04) emitSound(w.fx, 'groan', s.x, 1.5, s.z, type.size || 1)
  }
  s.ready = 1
  s.aimPitch = 0
  s.aimYaw += wrapAngle(s.yaw - s.aimYaw) * Math.min(1, h * 6)
  s.fireT -= h
  // A spitter: anyone in range and in sight - on the wall or not - gets a gob of acid.
  if (ai.spit && spit(w, s, ai.spit, h)) return

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
  // At the foot of the rampart: batter it.
  if (s.wallSeg >= 0 && !s.target) {
    const r = w.rampart
    const seg = r.segs[s.wallSeg]
    if (!seg.up) s.wallSeg = -1
    else if (s.x > r.front - 1 && s.x - r.front < ai.reach * (type.size || 1) * 0.6 + 0.9) {
      s.goalMode = 0
      s.yaw += wrapAngle(-Math.PI / 2 - s.yaw) * Math.min(1, h * 8)
      if (s.fireT <= 0) {
        s.fireT = ai.interval * (0.85 + rand() * 0.3)
        s.recoil = 1
        hitWall(w, seg, ai.damage * ai.bash, s)
      }
    }
  }
  // Not getting anywhere? Something's built in the way: smash it.
  if (s.goalMode === 1 && s.detourT > 0 && s.fireT <= 0 && w.build.list.length) {
    s.fireT = ai.interval
    const fx = Math.sin(s.yaw)
    const fz = Math.cos(s.yaw)
    if (damageStructureNear(w, s.x + fx * 0.9, s.z + fz * 0.9, 1.2, ai.damage * ai.bash)) s.recoil = 1
  }
}
