import {
  BULLET_SPEED,
  GRAVITY,
  MAX_SLOTS,
  PART_ARM_L,
  PART_ARM_R,
  PART_HEAD,
  PART_LEG_L,
  PART_LEG_R,
  PART_TORSO,
  SOLDIER_RADIUS,
} from './constants.js'
import { createFx, emitDecal, emitFlash, emitImpact, emitSound, emitTracer } from './fx.js'
import { buildLevels, floorAt, ladderItem, stepOnLevels, touchesLevels } from './levels.js'
import { createNavGrid, FlowFields, vehicleGrid } from './nav.js'
import {
  assignPatient,
  canRevive,
  clearOrdnance,
  clearPatient,
  createOrdnance,
  findPatient,
  flameBurst,
  healPatient,
  launchProjectile,
  needsMedic,
  patientPos,
  placeMines,
  updateMines,
  updateProjectiles,
} from './ordnance.js'
import { buildCoverSpots, buildObstacles, collideCircle, segmentClear2D, segmentHit3D } from './obstacles.js'
import { buildRampart, clampToDeck, deckAt } from './rampart.js'
import { BODIES_PER_RAGDOLL, startRagdoll, stepRagdoll } from './ragdoll.js'
import { animate, J_PELVIS, wrapAngle } from './rig.js'
import { makeSoldier, resetSoldier } from './soldier.js'
import { createSpatial, rebuildSpatial } from './spatial.js'
import { mapLevels } from './pieces.js'
import { BUILD_TYPES, clearStructures, createBuild, inWire, mapObstacles, placeStructures, settleStructures, wireZones } from './structures.js'
import { initZombieMode, onZombieKilled, updateZombieMode, zombieStep } from './zombies.js'
import { HEAVY_SHARE, UNIT_TYPES } from './units.js'
import {
  callStrike,
  clearVehicles,
  createVehicles,
  damageVehicle,
  deleteVehicles,
  moveVehicles,
  spawnVehicles,
  traceVehicles,
  updateVehicles,
  vehicleOrders,
} from './vehicles.js'

/**
 * The battle simulation: soldiers, their AI, shooting, wounds, deaths and ragdolls, and
 * (ordnance.js) rockets, mortar shells, explosions, mines, fire and medics, and
 * (vehicles.js) jeeps, APCs, tanks, helicopters and air strikes, and (structures.js)
 * whatever the player builds on the battlefield.
 *
 * Runs on its own clock (`w.time`) scaled by `w.timeScale` (pause / 0.5x / 1x / 2x), in
 * sub-steps of at most 1/60 s. Nothing here touches three.js or React: the renderer
 * reads soldiers and the fx rings each frame, and the HUD polls `w.stats` at 10 Hz.
 */

const MAX_STEP = 1 / 60
const STAND_EYE = 1.5
const STAND_MUZZLE = 1.38

const rand = Math.random
/** Scratch for a patient's position. */
const PPOS = { x: 0, z: 0 }
/** Scratch: taken cover spots near a search (gatherTaken). */
const TAKEN = []
const gauss = () => (rand() + rand() + rand() - 1.5) * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * @param {object} map a map definition (maps/*.js)
 * @param {{ units: number, corpses: number, ragdolls: number }} caps per-preset limits
 */
/** Cover spots that don't sit inside another box. */
function coverSpotsFor(obs, L) {
  const probe = { x: 0, z: 0 }
  return buildCoverSpots(obs).filter((sp) => {
    probe.x = sp.x
    probe.z = sp.z
    // Behind a platform's railing: high ground (the AI likes it).
    sp.up = L ? floorAt(L, sp.x, sp.z) > 1 : false
    return !collideCircle(obs, probe, SOLDIER_RADIUS * 0.9)
  })
}

/** How much a cover spot's high ground is worth to `type`, in metres of extra walk. */
const highGround = (sp, type) => (sp.up ? (type.heavy ? 9 : 6) : 0)

export function createWorld(map, caps, mode = 'sandbox') {
  // The map's own obstacles plus whatever gets built (structures.js) live here.
  const baseObstacles = mapObstacles(map)
  const obsMap = { ...map, obstacles: baseObstacles.slice() }
  const obs = buildObstacles(obsMap)
  const levels = buildLevels(mapLevels(map))
  const grid = createNavGrid(obsMap, obs, levels)
  const vgrid = vehicleGrid(grid)
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => makeSoldier(i))
  return {
    map,
    /** The map's obstacles plus its scenery pieces (built pieces are added on top). */
    baseObstacles,
    obsMap,
    obs,
    grid,
    flow: new FlowFields(grid, { budget: 1 }),
    /** Ground vehicles' flow fields, on maps with ramps and platforms (else null). */
    vflow: vgrid ? new FlowFields(vgrid, { budget: 1 }) : null,
    /** Platforms and ramps (levels.js), or null. */
    levels,
    coverSpots: coverSpotsFor(obs, levels),
    build: createBuild(),
    /** 'sandbox' or 'zombies' (Zombie Horde: zombies.js keeps its state in `zmode`). */
    mode,
    /** A wall troops stand on (rampart.js), on maps that have one; else null. */
    rampart: buildRampart(map),
    zmode: null,
    slots,
    free: slots.map((s) => s.slot).reverse(),
    living: [],
    teamLiving: [[], []],
    bodies: [],
    ragdolls: [],
    spatial: createSpatial(map, MAX_SLOTS),
    bullets: [],
    bulletPool: [],
    ord: createOrdnance(),
    veh: createVehicles(),
    fx: createFx(),
    time: 0,
    timeScale: 1,
    caps: { ...caps },
    stats: { alive: [0, 0], downed: [0, 0], lost: [0, 0], deployed: [0, 0], kills: [0, 0] },
    centroid: [
      { x: map.bases[0].x, z: map.bases[0].z, n: 0 },
      { x: map.bases[1].x, z: map.bases[1].z, n: 0 },
    ],
    centroidT: 0,
    /** Bumped when soldiers are added, removed or (de)selected: the HUD re-reads then. */
    version: 0,
  }
}

export { initZombieMode }

export function setCaps(w, caps) {
  Object.assign(w.caps, caps)
}

/**
 * After a piece is built or destroyed: rebuilds the obstacle grid, navigation, flow
 * fields and cover spots from the map's obstacles plus every standing piece. Everyone
 * lets go of their cover spot (they'll find a new one at their next think).
 */
export function rebuildStatic(w) {
  const obstacles = w.baseObstacles.slice()
  for (const st of w.build.list) for (const o of st.boxes) obstacles.push(o)
  w.obsMap.obstacles = obstacles
  w.obs = buildObstacles(w.obsMap)
  w.grid = createNavGrid(w.obsMap, w.obs, w.levels)
  w.flow = new FlowFields(w.grid, { budget: 1 })
  const vgrid = vehicleGrid(w.grid)
  w.vflow = vgrid ? new FlowFields(vgrid, { budget: 1 }) : null
  w.coverSpots = coverSpotsFor(w.obs, w.levels)
  w.build.wire = wireZones(w)
  for (const s of w.slots) s.cover = -1
  w.build.version += 1
  w.version += 1
}

// --- Stepping ------------------------------------------------------------------------

/** Advances the battle by `realDt` seconds of real time (scaled by w.timeScale). */
export function stepWorld(w, realDt) {
  const dt = Math.min(realDt, 0.1) * w.timeScale
  if (dt <= 0) return
  const steps = Math.min(6, Math.ceil(dt / MAX_STEP))
  const h = dt / steps
  // Flow-field budget per frame, not per sub-step: fast-forward mustn't spike.
  w.flow.tick()
  if (w.vflow) w.vflow.tick()
  for (let i = 0; i < steps; i += 1) tick(w, h)
}

function tick(w, h) {
  w.time += h

  // Living soldiers, per team.
  const living = w.living
  const blue = w.teamLiving[0]
  const red = w.teamLiving[1]
  living.length = 0
  blue.length = 0
  red.length = 0
  let downB = 0
  let downR = 0
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const s = w.slots[i]
    if (!s.used || !s.alive) continue
    living.push(s)
    if (s.team === 0) {
      blue.push(s)
      if (s.downed) downB += 1
    } else {
      red.push(s)
      if (s.downed) downR += 1
    }
  }
  w.stats.alive[0] = blue.length
  w.stats.alive[1] = red.length
  w.stats.downed[0] = downB
  w.stats.downed[1] = downR
  rebuildSpatial(w.spatial, living)

  w.centroidT -= h
  if (w.centroidT <= 0) {
    w.centroidT = 0.5
    for (let t = 0; t < 2; t += 1) {
      const list = w.teamLiving[t]
      const c = w.centroid[t]
      if (!list.length) {
        c.x = w.map.bases[t].x
        c.z = w.map.bases[t].z
        c.n = 0
        continue
      }
      let sx = 0
      let sz = 0
      for (let k = 0; k < list.length; k += 1) {
        sx += list[k].x
        sz += list[k].z
      }
      c.x = sx / list.length
      c.z = sz / list.length
      c.n = list.length
    }
  }

  for (let i = 0; i < living.length; i += 1) updateSoldier(w, living[i], h)
  updateVehicles(w, h)
  updateBullets(w)
  updateProjectiles(w, h)
  updateMines(w, h)
  updateBodies(w, h)
  settleStructures(w)
  if (w.zmode) updateZombieMode(w, h)
}

// --- Soldiers ------------------------------------------------------------------------

function updateSoldier(w, s, h) {
  if (!s.alive) return
  const type = UNIT_TYPES[s.type]
  s.hurtT += h
  if (s.staggerT > 0) s.staggerT -= h
  if (s.suppress > 0) s.suppress = Math.max(0, s.suppress - h * 0.35)

  // Bleeding, with slow clotting; badly hurt soldiers leave a trail.
  if (s.bleed > 0) {
    s.hp -= s.bleed * h
    s.bleed = Math.max(s.downed ? 1.2 : 0, s.bleed - 0.015 * h)
    s.dripT -= h
    if (s.dripT <= 0) {
      s.dripT = 1.4 + rand()
      emitDecal(w.fx, s.x + gauss() * 0.2, s.z + gauss() * 0.2, 0.18 + s.bleed * 0.08, w.time)
    }
    if (s.hp <= 0) {
      kill(w, s, -1, 0, 0, 0, null, 1)
      return
    }
  }

  // On fire: it hurts, and they run about in a panic instead of fighting.
  if (s.burnT > 0) {
    s.burnT -= h
    s.hp -= s.burnDps * h
    s.hurtT = 0
    if (s.hp <= 0) {
      const b = w.slots[s.burnerSlot]
      s.charred = true
      kill(w, s, -1, 0, 0, 0, b && b.id === s.burnerId ? b : null, 1.5)
      return
    }
    if (!s.downed && s.dropY <= 0 && !type.zombieAI) {
      if (s.patient) clearPatient(s)
      releaseCover(w, s)
      s.target = null
      s.wantCrouch = false
      s.wantProne = false
      s.panicT -= h
      if (s.panicT <= 0) {
        s.panicT = 0.55 + rand() * 0.4
        const a = rand() * Math.PI * 2
        setGoal(s, clamp(s.x + Math.sin(a) * 5, -w.obs.limitX, w.obs.limitX), clamp(s.z + Math.cos(a) * 5, -w.obs.limitZ, w.obs.limitZ))
      }
      s.ready = Math.max(0, s.ready - h * 3)
      move(w, s, type, h)
      animStep(s, h)
      return
    }
  }

  // Dropping in from the spawn click.
  if (s.dropY > 0) {
    s.dropV -= GRAVITY * h
    s.dropY += s.dropV * h
    if (s.scale < 1) s.scale = Math.min(1, s.scale + h * 6)
    if (s.dropY <= 0) {
      s.dropY = 0
      s.scale = 1
      emitImpact(w.fx, s.x, 0.05, s.z, 3, w.time)
    }
    return
  }

  // Zombies have their own simple mind (zombies.js).
  if (type.zombieAI) {
    zombieStep(w, s, type, h)
    move(w, s, type, h)
    animStep(s, h)
    return
  }
  s.thinkT -= h
  if (s.thinkT <= 0) {
    s.thinkT = 0.2 + rand() * 0.14
    think(w, s, type)
  }
  combat(w, s, type, h)
  move(w, s, type, h)
  animStep(s, h)
}

/** Eye/muzzle/chest heights blend with stance. */
const standW = (s) => Math.max(0, 1 - s.wCrouch - s.wProne - s.wDown)
// All above the floor they stand on: the ground, or the top of the rampart.
const eyeH = (s) => s.fy + STAND_EYE * standW(s) + 1.15 * s.wCrouch + 0.38 * s.wProne + 0.3 * s.wDown
const muzzleH = (s) => s.fy + STAND_MUZZLE * standW(s) + 1.12 * s.wCrouch + 0.3 * s.wProne + 0.25 * s.wDown
const chestH = (s) => s.fy + 1.15 * standW(s) + 0.8 * s.wCrouch + 0.25 * s.wProne + 0.2 * s.wDown
const headH = (s) => s.fy + 1.62 * standW(s) + 1.15 * s.wCrouch + 0.42 * s.wProne + 0.25 * s.wDown

/** Where to aim at target `t`: a soldier's chest, or the middle of a vehicle. */
const aimY = (t) => (t.isVehicle ? t.y + t.aimH : chestH(t))

function canSee(w, s, e) {
  const ey = eyeH(s)
  if (e.isVehicle) return segmentHit3D(w.obs, s.x, ey, s.z, e.x, e.y + e.aimH, e.z, 1.2) === Infinity
  if (segmentHit3D(w.obs, s.x, ey, s.z, e.x, chestH(e), e.z, 1.2) === Infinity) return true
  return segmentHit3D(w.obs, s.x, ey, s.z, e.x, headH(e), e.z, 1.2) === Infinity
}

const CANDIDATES = [null, null, null]
const CAND_SCORE = [0, 0, 0]

function think(w, s, type) {
  // Pick a target: the best few by distance (downed ones count as far), then the first
  // of those actually in sight.
  const enemies = w.teamLiving[1 - s.team]
  const reach = type.range * 1.05
  const reach2 = reach * reach
  const min2 = type.minRange ? type.minRange * type.minRange : 0
  let nearest = null
  let nearestD2 = Infinity
  CAND_SCORE[0] = CAND_SCORE[1] = CAND_SCORE[2] = Infinity
  CANDIDATES[0] = CANDIDATES[1] = CANDIDATES[2] = null
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i]
    if (e.dropY > 0) continue
    const dx = e.x - s.x
    const dz = e.z - s.z
    const d2 = dx * dx + dz * dz
    if (!e.downed && d2 < nearestD2) {
      nearestD2 = d2
      nearest = e
    }
    if (d2 > reach2 || d2 < min2) continue
    let score = Math.sqrt(d2)
    if (e.downed) score += 40
    if (e === s.target) score -= 8
    if (score < CAND_SCORE[2]) {
      let k = 2
      while (k > 0 && score < CAND_SCORE[k - 1]) {
        CAND_SCORE[k] = CAND_SCORE[k - 1]
        CANDIDATES[k] = CANDIDATES[k - 1]
        k -= 1
      }
      CAND_SCORE[k] = score
      CANDIDATES[k] = e
    }
  }
  // Vehicles: rocket troops go for them first; small arms only bother light ones
  // (jeeps, APCs, helicopters); mortars can drop shells on anything on the ground.
  const evs = w.veh.living[1 - s.team]
  const antiArmor = type.proj === 'rocket'
  for (let i = 0; i < evs.length; i += 1) {
    const v = evs[i]
    if (v.dropY > 0 || type.flame || type.medic) continue
    if (type.indirect ? v.spec.air : !antiArmor && !v.spec.light) continue
    const dx = v.x - s.x
    const dz = v.z - s.z
    const d2 = dx * dx + dz * dz
    if (d2 > reach2 || d2 < min2) continue
    const score = Math.sqrt(d2) + (antiArmor ? -40 : 18)
    if (score < CAND_SCORE[2]) {
      let k = 2
      while (k > 0 && score < CAND_SCORE[k - 1]) {
        CAND_SCORE[k] = CAND_SCORE[k - 1]
        CANDIDATES[k] = CANDIDATES[k - 1]
        k -= 1
      }
      CAND_SCORE[k] = score
      CANDIDATES[k] = v
    }
  }
  let target = null
  if (!s.downed) {
    for (let k = 0; k < 3; k += 1) {
      const e = CANDIDATES[k]
      // Mortars lob shells over cover: they need no line of sight.
      if (e && (type.indirect || canSee(w, s, e))) {
        target = e
        break
      }
    }
  }
  if (target && target !== s.target) {
    // Reaction time on a new target.
    s.fireT = Math.max(s.fireT, 0.35 + rand() * 0.5)
  }
  s.target = target
  s.targetId = target ? target.id : 0
  s.sees = Boolean(target)
  s.nearest = nearest

  // Medics: see to the most urgent hurt teammate nearby, and do nothing else meanwhile
  // (a move order from the player comes first).
  if (type.medic && !s.downed && s.order !== 'move') {
    const p = s.patient
    if (p && (p.id !== s.patientId || (p.alive ? !needsMedic(p) : !canRevive(w, p, s.team)))) clearPatient(s)
    if (!s.patient) {
      // The fallen too, while the team has room for them back.
      const found = findPatient(w, s, s.order === 'hold' ? 14 : type.medic.range, teamCount(w, s.team) < w.caps.units)
      if (found) assignPatient(s, found)
    }
    if (s.patient) {
      const q = s.patient
      s.target = null
      s.targetId = 0
      s.sees = false
      releaseCover(w, s)
      patientPos(q, PPOS)
      const dx = PPOS.x - s.x
      const dz = PPOS.z - s.z
      const d = Math.hypot(dx, dz)
      if (d > 0.95) setGoal(s, PPOS.x - (dx / (d || 1)) * 0.75, PPOS.z - (dz / (d || 1)) * 0.75)
      else s.goalMode = 0
      s.wantProne = false
      s.wantCrouch = d < 1.6
      return
    }
  }

  // Mortar crew: a loader sticks by his gunner (shooting at what he can see from there);
  // a gunner who's lost his loader calls the nearest rifleman over.
  if (s.loaderOf >= 0) {
    const g = w.slots[s.loaderOf]
    if (!g || !g.alive || g.id !== s.loaderOfId) {
      s.loaderOf = -1
      s.loaderOfId = 0
    } else if (!s.downed && s.order !== 'move') {
      // Kneeling at the side of the tube, hands free for the rounds.
      releaseCover(w, s)
      s.target = null
      s.targetId = 0
      s.sees = false
      const fx = Math.sin(g.aimYaw)
      const fz = Math.cos(g.aimYaw)
      const lx = g.x + fx * 0.85 + fz * 0.8
      const lz = g.z + fz * 0.85 - fx * 0.8
      if (Math.hypot(lx - s.x, lz - s.z) > 0.5) setGoal(s, lx, lz)
      else s.goalMode = 0
      s.wantProne = false
      s.wantCrouch = s.goalMode === 0
      return
    }
  }
  if (type.crew && !s.downed && !hasLoader(w, s)) findLoader(w, s)

  if (s.downed) {
    // Drag themselves back a little, then lie there.
    s.goalMode = s.downT < 2.5 ? 1 : 0
    s.wantCrouch = false
    s.wantProne = false
    return
  }

  const crawling = s.legL > 0 && s.legR > 0
  const tdist = target ? Math.hypot(target.x - s.x, target.z - s.z) : Infinity
  let stationary = false

  if (s.order === 'move') {
    releaseCover(w, s)
    const d = Math.hypot(s.moveX - s.x, s.moveZ - s.z)
    if (d < 0.9) {
      s.order = 'hold'
      s.holdX = s.x
      s.holdZ = s.z
      s.goalMode = 0
      stationary = true
    } else {
      setGoal(s, s.moveX, s.moveZ)
    }
  } else if (s.order === 'hold') {
    stationary = !seekCover(w, s, type, target, s.holdX, s.holdZ, 8)
    if (stationary) {
      const d = Math.hypot(s.holdX - s.x, s.holdZ - s.z)
      if (d > 1.5 && s.cover < 0) setGoal(s, s.holdX, s.holdZ)
      else s.goalMode = 0
      stationary = s.goalMode === 0
    }
  } else {
    // attack / flank
    let flanking = false
    if (s.order === 'flank' && !s.flankDone) {
      const mine = w.centroid[s.team]
      const theirs = w.centroid[1 - s.team]
      let ax = theirs.x - mine.x
      let az = theirs.z - mine.z
      const al = Math.hypot(ax, az) || 1
      ax /= al
      az /= al
      // Waypoint out to the side of the enemy, then turn in.
      const wx = clamp(theirs.x - ax * 18 + -az * s.flankSide * 34, -w.obs.limitX + 3, w.obs.limitX - 3)
      const wz = clamp(theirs.z - az * 18 + ax * s.flankSide * 34, -w.obs.limitZ + 3, w.obs.limitZ - 3)
      if (Math.hypot(wx - s.x, wz - s.z) < 8 || tdist < type.engage * 0.7) s.flankDone = true
      else {
        releaseCover(w, s)
        setGoal(s, wx, wz)
        flanking = true
      }
    }
    if (!flanking) {
      if (target && tdist <= type.engage * s.engageK) {
        // Close enough: into cover near here - badly hurt, cover behind - or, with none,
        // stay put but out of a teammate's way.
        const hurt = s.hp < s.maxHp * 0.35
        const away = hurt ? 7 / (tdist || 1) : 0
        stationary = !seekCover(w, s, type, target, s.x - (target.x - s.x) * away, s.z - (target.z - s.z) * away, hurt ? 14 : 16, true)
        if (stationary) {
          s.goalMode = 0
          spreadOut(w, s, target)
        }
      } else if (target) {
        // Too far: bound forward from cover to cover, pausing in each to fire.
        if (!bound(w, s, type, target)) {
          releaseCover(w, s)
          setGoal(s, target.x, target.z)
        }
      } else if (nearest) {
        releaseCover(w, s)
        setGoal(s, nearest.x, nearest.z)
      } else {
        s.goalMode = 0
        stationary = true
      }
    }
  }

  const inCover = s.cover >= 0 && Math.hypot(w.coverSpots[s.cover].x - s.x, w.coverSpots[s.cover].z - s.z) < 0.7
  if (inCover) {
    stationary = true
    if (!s.coverAt) s.coverAt = w.time
  }
  // Pinned down in the open: get flat.
  const pinned = stationary && !inCover && Boolean(target) && s.suppress > 0.6 && !type.flame && !type.medic
  s.wantProne = crawling || pinned || (type.prone && stationary && (Boolean(target) || s.order === 'hold'))
  s.wantCrouch = !s.wantProne && stationary && (inCover || Boolean(target) || s.hurtT < 3 || s.suppress > 0.35)
}

/**
 * Advancing on a target out of range: the next bit of cover on the way - nearer the
 * target, not too far a dash, facing the right way, not crowded - then a pause in it to
 * fire before the next. Returns false when there's no cover worth using (walk on).
 */
function bound(w, s, type, target) {
  if (type.prone || s.deck >= 0) return false
  const spots = w.coverSpots
  const tdist = Math.hypot(target.x - s.x, target.z - s.z)
  if (s.cover >= 0) {
    const sp = spots[s.cover]
    const d = Math.hypot(sp.x - s.x, sp.z - s.z)
    if (d > 0.5) {
      setGoal(s, sp.x, sp.z)
      return true
    }
    // In it: hold a moment (firing if he can) before the next dash.
    if (s.coverAt && w.time - s.coverAt < 2.5 + (s.slot % 5) * 0.5) {
      s.goalMode = 0
      return true
    }
    releaseCover(w, s)
  }
  let best = -1
  let bestScore = Infinity
  gatherTaken(spots, s.x, s.z, 21)
  for (let i = 0; i < spots.length; i += 1) {
    const sp = spots[i]
    if (sp.taken >= 0) continue
    const dx = sp.x - s.x
    const dz = sp.z - s.z
    const d = Math.hypot(dx, dz)
    if (d > 18 || d < 2) continue
    const tx = target.x - sp.x
    const tz = target.z - sp.z
    const td = Math.hypot(tx, tz)
    if (td > tdist - 4) continue
    if (tx * sp.nx + tz * sp.nz > -1) continue
    const score = d + td * 0.35 + crowding(sp) * 5 - highGround(sp, type)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  if (best < 0) return false
  spots[best].taken = s.slot
  s.cover = best
  s.coverAt = 0
  setGoal(s, spots[best].x, spots[best].z)
  return true
}

/** Gathers the taken cover spots within `r` of (x, z) into TAKEN (for crowding()). */
function gatherTaken(spots, x, z, r) {
  TAKEN.length = 0
  for (let i = 0; i < spots.length; i += 1) {
    const o = spots[i]
    if (o.taken >= 0 && Math.abs(o.x - x) < r && Math.abs(o.z - z) < r) TAKEN.push(o)
  }
}

/** How many of the gathered taken spots are within 2.5 m of `sp`. */
function crowding(sp) {
  let n = 0
  for (let i = 0; i < TAKEN.length; i += 1) {
    const o = TAKEN[i]
    if (o !== sp && Math.abs(o.x - sp.x) < 2.5 && Math.abs(o.z - sp.z) < 2.5) n += 1
  }
  return n
}

/**
 * Holding a spot in the open: if a teammate stands right beside him, step out to the side
 * (across the line to the target), so they don't make one big target in a row.
 */
function spreadOut(w, s, target) {
  const mates = w.teamLiving[s.team]
  for (let i = 0; i < mates.length; i += 1) {
    const m = mates[i]
    if (m === s || m.loaderOf >= 0 || m.buddySlot === s.slot) continue
    const dx = m.x - s.x
    const dz = m.z - s.z
    if (dx * dx + dz * dz > 2.6) continue
    const tx = target.x - s.x
    const tz = target.z - s.z
    const tl = Math.hypot(tx, tz) || 1
    // Sideways, away from the teammate.
    let px = -tz / tl
    let pz = tx / tl
    if (px * dx + pz * dz > 0) {
      px = -px
      pz = -pz
    }
    setGoal(s, clamp(s.x + px * 2.2, -w.obs.limitX + 1, w.obs.limitX - 1), clamp(s.z + pz * 2.2, -w.obs.limitZ + 1, w.obs.limitZ - 1))
    return
  }
}

/** Whether mortar gunner `s` has his loader alive beside him. */
function hasLoader(w, s) {
  if (s.buddySlot < 0) return false
  const l = w.slots[s.buddySlot]
  if (!l || !l.alive || l.id !== s.buddyId || l.loaderOfId !== s.id) {
    s.buddySlot = -1
    s.buddyId = 0
    return false
  }
  return true
}

/** A gunner without a loader takes the nearest free rifleman within 20 m as his new one. */
function findLoader(w, s) {
  const mates = w.teamLiving[s.team]
  let best = null
  let bestD = 400
  for (let i = 0; i < mates.length; i += 1) {
    const m = mates[i]
    if (m === s || m.downed || m.loaderOf >= 0 || m.dropY > 0) continue
    const t = UNIT_TYPES[m.type]
    if (t.medic || t.crew || t.proj || t.flame || t.prone || t.zombieAI) continue
    const d2 = (m.x - s.x) ** 2 + (m.z - s.z) ** 2
    if (d2 < bestD) {
      bestD = d2
      best = m
    }
  }
  if (best) linkCrew(s, best)
}

function linkCrew(gunner, loader) {
  gunner.buddySlot = loader.slot
  gunner.buddyId = loader.id
  loader.loaderOf = gunner.slot
  loader.loaderOfId = gunner.id
}

function setGoal(s, x, z) {
  s.goalX = x
  s.goalZ = z
  s.goalMode = 1
}

function releaseCover(w, s) {
  if (s.cover >= 0) {
    const sp = w.coverSpots[s.cover]
    if (sp.taken === s.slot) sp.taken = -1
    s.cover = -1
  }
}

/**
 * Low cover between us and the target, within `radius` of (cx, cz). Takes and walks to
 * it; returns true while heading there or sitting in it.
 */
function seekCover(w, s, type, target, cx, cz, radius, always = false) {
  // Up on the rampart the parapet is the cover.
  if (type.prone || !target || s.deck >= 0) {
    releaseCover(w, s)
    return false
  }
  if (s.cover >= 0) {
    const sp = w.coverSpots[s.cover]
    // Still shelters us from the target?
    if ((target.x - sp.x) * sp.nx + (target.z - sp.z) * sp.nz < -0.5) {
      const d = Math.hypot(sp.x - s.x, sp.z - s.z)
      if (d > 0.4) setGoal(s, sp.x, sp.z)
      else s.goalMode = 0
      return true
    }
    releaseCover(w, s)
  }
  // Holding: only bother when under fire or ready to settle in. Fighting: always.
  if (!always && s.hurtT > 6 && s.suppress < 0.3 && !s.crouchy) return false
  let best = -1
  let bestScore = Infinity
  const spots = w.coverSpots
  gatherTaken(spots, cx, cz, radius + 3)
  for (let i = 0; i < spots.length; i += 1) {
    const sp = spots[i]
    if (sp.taken >= 0) continue
    const d = Math.hypot(sp.x - cx, sp.z - cz)
    if (d >= radius) continue
    const tx = target.x - sp.x
    const tz = target.z - sp.z
    if (tx * sp.nx + tz * sp.nz > -1) continue
    if (Math.hypot(tx, tz) > type.range * 0.95) continue
    // Nearest first, but not bunched up with the others; high ground's worth a walk.
    const score = d + crowding(sp) * 4 - highGround(sp, type)
    if (score < bestScore) {
      best = i
      bestScore = score
    }
  }
  if (best < 0) return false
  spots[best].taken = s.slot
  s.cover = best
  s.coverAt = 0
  setGoal(s, spots[best].x, spots[best].z)
  return true
}

function combat(w, s, type, h) {
  if (s.downed) {
    s.ready = Math.max(0, s.ready - h * 3)
    return
  }
  // A medic at work: kneel by the patient until they're patched up.
  if (s.patient) {
    const p = s.patient
    if (p.id !== s.patientId || (!p.alive && !canRevive(w, p, s.team))) clearPatient(s)
    else {
      patientPos(p, PPOS)
      const dx = PPOS.x - s.x
      const dz = PPOS.z - s.z
      s.aimYaw += wrapAngle(Math.atan2(dx, dz) - s.aimYaw) * Math.min(1, h * 6)
      s.aimPitch *= 1 - Math.min(1, h * 3)
      s.ready = Math.max(0, s.ready - h * 3)
      if (Math.hypot(dx, dz) < 1.4) {
        s.healT += h
        if (s.healT >= (p.alive ? type.medic.time : type.medic.revive)) {
          if (p.alive) healPatient(w, p, type.medic)
          else if (teamCount(w, p.team) < w.caps.units) reviveSoldier(w, p)
          clearPatient(s)
        }
      } else s.healT = 0
      return
    }
  }
  // A mortar loader: face the tube and drop a round in each time it fires.
  if (s.loaderOf >= 0) {
    const g = w.slots[s.loaderOf]
    if (g && g.alive && g.id === s.loaderOfId) {
      const tx = g.x + Math.sin(g.aimYaw) * 0.8 - s.x
      const tz = g.z + Math.cos(g.aimYaw) * 0.8 - s.z
      const face = Math.atan2(tx, tz)
      s.yaw += wrapAngle(face - s.yaw) * Math.min(1, h * 5)
      s.aimYaw += wrapAngle(face - s.aimYaw) * Math.min(1, h * 6)
      s.aimPitch *= 1 - Math.min(1, h * 3)
      s.ready = Math.max(0, s.ready - h * 3)
      if (s.loadT > 0) {
        s.loadT = Math.max(0, s.loadT - h)
        s.reloadP = 1 - s.loadT
      } else s.reloadP = -1
      return
    }
  }
  if (s.reloadT > 0) {
    s.reloadT -= h
    const total = type.reload * (1 + 0.4 * (s.armL + s.armR))
    s.reloadP = clamp(1 - s.reloadT / total, 0, 1)
    if (s.reloadT <= 0) {
      s.reloadT = 0
      s.reloadP = -1
      s.mag = type.mag
    }
  }
  if (s.fireT > 0) s.fireT -= h
  // A crewed mortar is set up once its gunner has been still a moment.
  if (type.crew) s.setT = s.vx * s.vx + s.vz * s.vz > 0.05 ? 0 : s.setT + h

  let t = s.target
  if (t && (!t.alive || t.id !== s.targetId)) {
    s.target = null
    t = null
  }
  if (!t) {
    if (w.time - s.lastShotT > 1.5) s.ready = Math.max(0, s.ready - h * 1.5)
    // Relax the aim back towards where the body faces.
    s.aimYaw += wrapAngle(s.yaw - s.aimYaw) * Math.min(1, h * 3)
    s.aimPitch *= 1 - Math.min(1, h * 3)
    if (s.reloadT <= 0 && s.mag < type.mag * 0.5) startReload(w, s, type)
    return
  }

  const dx = t.x - s.x
  const dz = t.z - s.z
  const dist = Math.hypot(dx, dz)
  const want = Math.atan2(dx, dz)
  const turn = (s.armL + s.armR > 0 ? 3.5 : 6.5) * h
  const diff = wrapAngle(want - s.aimYaw)
  s.aimYaw += clamp(diff, -turn, turn)
  // Mortars point the tube high; everything else aims at the chest.
  const pitch = type.indirect ? 0.95 : Math.atan2(aimY(t) - muzzleH(s), Math.max(1, dist))
  s.aimPitch += (pitch - s.aimPitch) * Math.min(1, h * 8)
  s.ready = Math.min(1, s.ready + h * 3.5)
  // Mortar set up on the ground: hands down at the tube, not up holding it.
  if (type.crew && s.setT > 0.5) s.ready = Math.max(0, s.ready - h * 7)

  if (s.reloadT > 0 || s.fireT > 0 || s.mag <= 0) return
  if (Math.abs(wrapAngle(want - s.aimYaw)) > 0.12) return
  // Flamethrowers keep pouring it on when hit; everyone else flinches.
  if (dist > type.range || (s.ready < 0.8 && !type.crew) || (s.staggerT > 0 && !type.flame)) return
  const moving = s.vx * s.vx + s.vz * s.vz > 0.6
  if (moving && !type.runAndGun) return
  if (Math.abs(wrapAngle(s.aimYaw - s.yaw)) > 1.15) return
  if (s.wantProne && s.wProne < 0.9) return

  if (type.proj) {
    if (type.minRange && dist < type.minRange) return
    // A mortar fires once it's set up, with its loader beside it to drop the round in.
    if (type.crew && (s.setT < 1.2 || !hasLoader(w, s))) return
    const sy = Math.sin(s.aimYaw)
    const cy = Math.cos(s.aimYaw)
    const up = type.indirect ? 0.45 : 0
    // A set-up mortar fires from its muzzle on the ground in front of the gunner.
    const mx = type.crew ? s.x + sy * 1.3 : s.x + sy * 0.7 - cy * 0.1
    const my = type.crew ? s.fy + 1.2 : muzzleH(s) + up
    const mz = type.crew ? s.z + cy * 1.3 : s.z + cy * 0.7 + sy * 0.1
    if (!launchProjectile(w, s, type, t, mx, my, mz, aimY(t))) return
    s.recoil = 1
    s.lastShotT = w.time
    if (type.crew) w.slots[s.buddySlot].loadT = 0.9
  } else if (type.flame) {
    const sy = Math.sin(s.aimYaw)
    const cy = Math.cos(s.aimYaw)
    flameBurst(w, s, type, s.x + sy * 0.66 - cy * 0.1, muzzleH(s), s.z + cy * 0.66 + sy * 0.1)
    s.lastShotT = w.time
  } else fire(w, s, t, type, dist, moving)
  s.mag -= 1
  s.burstLeft -= 1
  s.shotsInBurst += 1
  if (s.burstLeft <= 0) {
    s.burstLeft = type.burst[0] + Math.floor(rand() * (type.burst[1] - type.burst[0] + 1))
    s.shotsInBurst = 0
    s.fireT = type.interval + type.pause * (0.7 + rand() * 0.7)
  } else {
    s.fireT = type.interval
  }
  if (s.mag <= 0) startReload(w, s, type)
}

function startReload(w, s, type) {
  s.reloadT = type.reload * (1 + 0.4 * (s.armL + s.armR))
  s.reloadP = 0
  emitSound(w.fx, 'reload', s.x, 1, s.z, s.type)
}

const HIT = { soldier: null, dist: 0, part: 0 }

function fire(w, s, t, type, dist, moving) {
  const sy = Math.sin(s.aimYaw)
  const cy = Math.cos(s.aimYaw)
  // Muzzle: ahead of the body, a little to the right (-left).
  const mx = s.x + sy * 0.62 - cy * 0.1
  const my = muzzleH(s)
  const mz = s.z + cy * 0.62 + sy * 0.1
  const aimHead = !t.isVehicle && type.headshots && rand() < type.headshots
  const ty = (aimHead ? headH(t) : aimY(t)) + gauss() * (t.isVehicle ? 0.25 : 0.05)
  let spread = type.spread
  if (moving) spread *= 2.2
  spread *= 1 - 0.25 * s.wCrouch - 0.45 * s.wProne
  spread *= 1 + 0.6 * (s.armL + s.armR)
  spread *= 1 + Math.min(10, s.shotsInBurst) * 0.05
  if (s.staggerT > 0 || s.hurtT < 0.5) spread *= 1.8
  spread *= 1 + s.suppress * 1.2
  // Being shot at keeps heads down.
  t.suppress = Math.min(1, t.suppress + 0.07 * Math.min(2, type.pellets))
  const baseYaw = Math.atan2(t.x - mx, t.z - mz)
  const basePitch = Math.atan2(ty - my, Math.max(0.5, Math.hypot(t.x - mx, t.z - mz)))
  const len = type.range * 1.25

  for (let p = 0; p < type.pellets; p += 1) {
    const yaw = baseYaw + gauss() * spread
    const pitch = basePitch + gauss() * spread * 0.7
    const cp = Math.cos(pitch)
    castBullet(w, s.team, s, mx, my, mz, Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, len, type.damage, p < 3, type.key === 'mg' || type.key === 'sniper')
  }
  emitFlash(w.fx, mx, my, mz, Math.sin(s.aimYaw) * Math.cos(s.aimPitch), Math.sin(s.aimPitch), Math.cos(s.aimYaw) * Math.cos(s.aimPitch), w.time, type.pellets > 1 ? 1.4 : type.key === 'pistol' ? 0.7 : 1)
  emitSound(w.fx, 'shot', mx, my, mz, type.key)
  s.recoil = 1
  s.lastShotT = w.time
}

const VHIT = { vehicle: null, dist: 0 }

/**
 * One bullet from (mx, my, mz) along unit (dx, dy, dz), up to `len` metres: stops at
 * cover, the ground, an enemy soldier (with the hit zone) or an enemy vehicle, and lands
 * after its flight time. Used by soldiers and vehicle machine guns alike.
 */
export function castBullet(w, team, shooter, mx, my, mz, dx, dy, dz, len, damage, tracer, heavy) {
  let tEnd = segmentHit3D(w.obs, mx, my, mz, mx + dx * len, my + dy * len, mz + dz * len, 1.0)
  let kind = 2 // concrete/obstacle
  if (dy < 0) {
    const tg = -my / (dy * len)
    if (tg < tEnd) {
      tEnd = tg
      kind = 0
    }
  }
  if (tEnd > 1) {
    tEnd = 1
    kind = -1
  }
  const hit = traceSoldiers(w, team, mx, my, mz, dx, dy, dz, len * tEnd)
  let hitDist = hit ? HIT.dist : len * tEnd
  const vhit = traceVehicles(w, team, mx, my, mz, dx, dy, dz, hitDist, VHIT)
  if (vhit) hitDist = VHIT.dist
  const ix = mx + dx * hitDist
  const iy = my + dy * hitDist
  const iz = mz + dz * hitDist
  const b = w.bulletPool.pop() || {}
  b.arrive = w.time + hitDist / BULLET_SPEED
  b.x = ix
  b.y = iy
  b.z = iz
  b.dx = dx
  b.dy = dy
  b.dz = dz
  // kind: 1 soldier, 4 vehicle, else what the bullet hits (0 dirt, 2 hard, -1 nothing).
  b.kind = vhit ? 4 : hit ? 1 : kind
  b.target = vhit ? VHIT.vehicle : hit ? HIT.soldier : null
  b.targetId = b.target ? b.target.id : 0
  b.part = hit ? HIT.part : 0
  b.damage = damage
  b.shooter = shooter
  b.shooterId = shooter ? shooter.id : 0
  w.bullets.push(b)
  if (tracer) emitTracer(w.fx, mx, my, mz, ix, iy, iz, w.time, heavy)
}

// Closest approach between the bullet segment and each enemy's body capsule.
function traceSoldiers(w, team, ox, oy, oz, dx, dy, dz, maxDist) {
  const enemies = w.teamLiving[1 - team]
  let best = maxDist
  let found = null
  let foundPart = 0
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i]
    // Quick 2D reject: distance from the soldier to the bullet's ground line.
    const ex = e.x - ox
    const ez = e.z - oz
    const along = ex * dx + ez * dz
    const hd2 = dx * dx + dz * dz
    if (hd2 < 1e-9) continue
    const tProj = along / hd2
    if (tProj < -1 || tProj * Math.sqrt(hd2) > best + 1.2) continue
    const px = ex - dx * tProj
    const pz = ez - dz * tProj
    if (px * px + pz * pz > 1.6) continue

    // Body capsule: upright (feet to shoulders) or lying along the body.
    const lying = e.wProne > 0.5 || e.wDown > 0.5
    let ax
    let ay
    let az
    let bx
    let by
    let bz
    let r
    if (!lying) {
      const top = 1.82 - 0.55 * e.wCrouch
      ax = e.x
      ay = e.fy + 0.2
      az = e.z
      bx = e.x
      by = e.fy + top - 0.22
      bz = e.z
      r = 0.24
    } else {
      // Feet -> head. Prone: head forward; downed: head back.
      const sgn = e.wDown > 0.5 ? -1 : 1
      const fx = Math.sin(e.yaw) * sgn
      const fz = Math.cos(e.yaw) * sgn
      ax = e.x - fx * 0.85
      ay = e.fy + 0.2
      az = e.z - fz * 0.85
      bx = e.x + fx * 0.75
      by = e.fy + 0.25
      bz = e.z + fz * 0.75
      r = 0.22
    }
    // Segment-segment closest points (ray: o + d*s, s in [0, maxDist]; body: a + u*t).
    const ux = bx - ax
    const uy = by - ay
    const uz = bz - az
    const wx = ox - ax
    const wy = oy - ay
    const wz = oz - az
    const aa = dx * dx + dy * dy + dz * dz
    const bb = dx * ux + dy * uy + dz * uz
    const cc = ux * ux + uy * uy + uz * uz
    const dd = dx * wx + dy * wy + dz * wz
    const ee = ux * wx + uy * wy + uz * wz
    const den = aa * cc - bb * bb
    let sc = den > 1e-9 ? (bb * ee - cc * dd) / den : 0
    sc = clamp(sc, 0, best)
    let tc = (bb * sc + ee) / cc
    if (tc < 0 || tc > 1) {
      tc = clamp(tc, 0, 1)
      sc = clamp((bb * tc - dd) / aa, 0, best)
    }
    const qx = ox + dx * sc - (ax + ux * tc)
    const qy = oy + dy * sc - (ay + uy * tc)
    const qz = oz + dz * sc - (az + uz * tc)
    const dist2 = qx * qx + qy * qy + qz * qz
    if (dist2 > r * r) continue
    const entry = Math.max(0, sc - Math.sqrt(Math.max(0, r * r - dist2)))
    if (entry >= best) continue
    best = entry
    found = e
    // Which part: height up the body (or distance along it), and which side.
    const lx = Math.cos(e.yaw)
    const lz = -Math.sin(e.yaw)
    const side = qx * lx + qz * lz
    if (!lying) {
      const y = ay + uy * tc - e.fy
      const hipY = 0.84 - 0.34 * e.wCrouch
      const neckY = 1.44 - 0.42 * e.wCrouch
      if (y > neckY) foundPart = PART_HEAD
      else if (y > hipY) foundPart = Math.abs(side) > 0.16 ? (side > 0 ? PART_ARM_L : PART_ARM_R) : PART_TORSO
      else foundPart = side > 0 ? PART_LEG_L : PART_LEG_R
    } else if (tc > 0.84) foundPart = PART_HEAD
    else if (tc > 0.45) foundPart = PART_TORSO
    else foundPart = side > 0 ? PART_LEG_L : PART_LEG_R
  }
  if (!found) return false
  HIT.soldier = found
  HIT.dist = best
  HIT.part = foundPart
  return true
}

function updateBullets(w) {
  const list = w.bullets
  let n = 0
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i]
    if (b.arrive > w.time) {
      list[n++] = b
      continue
    }
    if (b.kind === 1) {
      const t = b.target
      if (t && t.alive && t.id === b.targetId) {
        hitSoldier(w, t, b.part, b.damage, b.dx, b.dy, b.dz, b.shooter && b.shooter.id === b.shooterId ? b.shooter : null, b.x, b.y, b.z)
      }
    } else if (b.kind === 4) {
      // Off a vehicle: sparks, and whatever gets through its armour.
      const v = b.target
      emitImpact(w.fx, b.x, b.y, b.z, 2, w.time)
      emitSound(w.fx, 'impact', b.x, b.y, b.z, 2)
      if (v && v.alive && v.id === b.targetId) damageVehicle(w, v, b.damage * v.spec.armor, b.shooter && b.shooter.id === b.shooterId ? b.shooter : null)
    } else if (b.kind >= 0) {
      emitImpact(w.fx, b.x, b.y, b.z, b.kind, w.time)
      emitSound(w.fx, 'impact', b.x, b.y, b.z, b.kind)
    }
    b.target = null
    b.shooter = null
    w.bulletPool.push(b)
  }
  list.length = n
}

const PART_MULT = [2.6, 1, 0.55, 0.55, 0.65, 0.65]
const PART_BLEED = [1.2, 0.9, 0.35, 0.35, 0.5, 0.5]

function hitSoldier(w, s, part, damage, dx, dy, dz, shooter, hx, hy, hz) {
  const dmg = damage * PART_MULT[part] * (0.85 + rand() * 0.3)
  s.hp -= dmg
  s.hurtT = 0
  s.staggerT = 0.25
  if (part === PART_HEAD) s.headW += 1
  else if (part === PART_TORSO) s.torsoW += 1
  else if (part === PART_ARM_L) s.armL += 1
  else if (part === PART_ARM_R) s.armR += 1
  else if (part === PART_LEG_L) s.legL += 1
  else s.legR += 1
  if (rand() < 0.75) s.bleed += PART_BLEED[part]
  const shove = Math.min(1, dmg / 35)
  s.flinchX += dx * shove * 0.7
  s.flinchZ += dz * shove * 0.7
  emitImpact(w.fx, hx, hy, hz, 1, w.time)
  emitSound(w.fx, 'hit', hx, hy, hz, part)
  if (rand() < 0.5) emitDecal(w.fx, s.x + dx * 0.6 + gauss() * 0.2, s.z + dz * 0.6 + gauss() * 0.2, 0.25 + rand() * 0.2, w.time)

  if (s.hp <= 0) {
    kill(w, s, part, dx, dy, dz, shooter, clamp(damage / 9, 2.5, 9))
    return
  }
  if (!s.downed && part !== PART_HEAD && !UNIT_TYPES[s.type].zombieAI) {
    const legs = s.legL > 0 && s.legR > 0
    if ((s.hp < s.maxHp * 0.22 && rand() < 0.5) || (legs && s.hp < s.maxHp * 0.5 && rand() < 0.5)) setDowned(w, s)
  }
}

/**
 * A blast reaching soldier `s` (ordnance.js): `dmg` damage, pushed along (nx, nz), `k`
 * how close to the centre (0 edge .. 1 point blank). Wounds land mostly on the legs;
 * survivors are left reeling, close ones knocked flat.
 */
export function blastHit(w, s, dmg, nx, nz, k, attacker) {
  s.hp -= dmg
  s.hurtT = 0
  s.staggerT = 0.5 + k
  s.suppress = 1
  const r = rand()
  if (r < 0.35) s.legL += 1
  else if (r < 0.7) s.legR += 1
  else if (r < 0.85) s.torsoW += 1
  else if (r < 0.93) s.armL += 1
  else s.armR += 1
  s.bleed += 0.5 + k
  s.flinchX += nx * k * 2
  s.flinchZ += nz * k * 2
  emitImpact(w.fx, s.x, 1, s.z, 1, w.time)
  if (s.hp <= 0) {
    const up = 0.75 + rand() * 0.35
    const l = Math.hypot(nx, up, nz)
    kill(w, s, -1, nx / l, up / l, nz / l, attacker, 9 + 22 * k, true)
    return
  }
  if (!s.downed && k > 0.35 && rand() < k && !UNIT_TYPES[s.type].zombieAI) setDowned(w, s)
}

function setDowned(w, s) {
  s.downed = true
  s.downT = 0
  s.bleed = Math.max(s.bleed, 1.2)
  s.target = null
  releaseCover(w, s)
  // Drag back away from the fight.
  const back = s.yaw + Math.PI
  setGoal(s, s.x + Math.sin(back) * 2.5, s.z + Math.cos(back) * 2.5)
  w.version += 1
}

function kill(w, s, part, dx, dy, dz, killer, power, blast = false) {
  // Multiplayer: the server tells clients how each soldier died so they can play the
  // ragdoll themselves (bodies are cosmetic).
  if (w.deaths) w.deaths.push(s.id, part, dx, dy, dz, power, blast ? 1 : 0, s.charred ? 1 : 0)
  s.alive = false
  s.deadT = w.time
  s.selected = false
  releaseCover(w, s)
  if (s.patient) clearPatient(s)
  // The charred keep smouldering a while.
  if (s.charred) s.burnT = Math.max(s.burnT, 3)
  w.stats.lost[s.team] += 1
  if (UNIT_TYPES[s.type].zombieAI) onZombieKilled(w, s)
  if (killer && killer.alive && killer.team !== s.team) {
    killer.kills += 1
    w.stats.kills[killer.team] += 1
  }
  animate(s, s.joints, w.time)
  s.poseVersion += 1
  if (w.ragdolls.length < w.caps.ragdolls) {
    startRagdoll(s, s.vx, s.vz, part, dx, dy, dz, power)
    w.ragdolls.push(s)
  } else {
    // Over the ragdoll budget: crumple to the ground with a canned fall instead - thrown
    // through the air first, tumbling once, when a blast did it.
    s.crumple = true
    s.downed = true
    if (blast) startFling(s, dx, dy, dz, power)
  }
  w.bodies.push(s)
  w.version += 1
}

/**
 * A multiplayer client's half of a death: the body falls (ragdoll within the budget,
 * otherwise a crumple - flung by a blast) but no stats or kills, which the server owns.
 */
export function localKill(w, s, part, dx, dy, dz, power, blast, charred) {
  s.alive = false
  s.deadT = w.time
  s.selected = false
  s.charred = Boolean(charred)
  if (s.charred) s.burnT = Math.max(s.burnT, 3)
  s.patient = null
  animate(s, s.joints, w.time)
  s.poseVersion += 1
  if (w.ragdolls.length < w.caps.ragdolls) {
    startRagdoll(s, s.vx, s.vz, part, dx, dy, dz, power)
    w.ragdolls.push(s)
  } else {
    s.crumple = true
    s.downed = true
    if (blast) startFling(s, dx, dy, dz, power)
  }
  w.bodies.push(s)
  w.version += 1
}

/** A multiplayer client's bodies: ragdolls, falls, sinking (no soldiers simulated). */
export function stepBodies(w, h) {
  w.time += h
  updateBodies(w, h)
}

/** Frees a slot on a multiplayer client (a soldier the server removed). */
export function dropSlot(w, s) {
  const i = w.bodies.indexOf(s)
  if (i >= 0) w.bodies.splice(i, 1)
  const r = w.ragdolls.indexOf(s)
  if (r >= 0) w.ragdolls.splice(r, 1)
  freeSlot(w, s)
}

/** A free slot (for a multiplayer client mirroring a new soldier), or null. */
export function takeSlot(w) {
  return allocSlot(w)
}

function startFling(s, dx, dy, dz, power) {
  s.flinging = true
  s.flingVX = dx * power * 0.4
  s.flingVZ = dz * power * 0.4
  s.flingVY = 3 + dy * power * 0.32
  s.flingY = 0
  s.flingAng = 0
  const T = (2 * s.flingVY) / GRAVITY
  s.flingSpin = ((Math.PI * 2) / T) * (rand() < 0.5 ? 1 : -1)
  const l = Math.hypot(dx, dz)
  s.flingAX = l > 1e-3 ? -dz / l : 1
  s.flingAZ = l > 1e-3 ? dx / l : 0
}

/** Moves a flung body along its arc (the joints are turned to match in applyFling). */
function stepFling(w, s, h) {
  s.x = clamp(s.x + s.flingVX * h, -w.obs.limitX, w.obs.limitX)
  s.z = clamp(s.z + s.flingVZ * h, -w.obs.limitZ, w.obs.limitZ)
  s.flingVY -= GRAVITY * h
  s.flingY += s.flingVY * h
  s.flingAng += s.flingSpin * h
  if (s.flingY <= 0 && s.flingVY < 0) {
    s.flinging = false
    s.flingY = 0
    s.flingAng = 0
    emitImpact(w.fx, s.x, 0.05, s.z, 3, w.time)
    emitSound(w.fx, 'thud', s.x, 0.2, s.z, 0)
  }
}

function applyFling(s) {
  const j = s.joints
  const px = j[J_PELVIS * 3]
  const py = j[J_PELVIS * 3 + 1]
  const pz = j[J_PELVIS * 3 + 2]
  const c = Math.cos(s.flingAng)
  const sn = Math.sin(s.flingAng)
  const kx = s.flingAX
  const kz = s.flingAZ
  for (let i = 0; i < j.length; i += 3) {
    const vx = j[i] - px
    const vy = j[i + 1] - py
    const vz = j[i + 2] - pz
    // Rodrigues: rotate about the horizontal axis (kx, 0, kz).
    const dot = kx * vx + kz * vz
    const cx = -kz * vy
    const cy = kz * vx - kx * vz
    const cz = kx * vy
    j[i] = px + vx * c + cx * sn + kx * dot * (1 - c)
    j[i + 1] = py + vy * c + cy * sn + s.flingY
    j[i + 2] = pz + vz * c + cz * sn + kz * dot * (1 - c)
  }
}

function updateBodies(w, h) {
  // Simulated ragdolls.
  const rag = w.ragdolls
  let n = 0
  for (let i = 0; i < rag.length; i += 1) {
    const s = rag[i]
    if (!s.used || s.alive) continue
    if (stepRagdoll(s, h, w.obs)) emitSound(w.fx, 'thud', s.joints[J_PELVIS * 3], 0.2, s.joints[J_PELVIS * 3 + 2], 0)
    s.poseVersion += 1
    if (s.ragActive) rag[n++] = s
    else onSettled(w, s)
  }
  rag.length = n

  // Canned falls, sinking bodies and the body cap.
  const bodies = w.bodies
  let excess = bodies.length - w.caps.corpses
  let m = 0
  for (let i = 0; i < bodies.length; i += 1) {
    const s = bodies[i]
    if (s.burnT > 0) s.burnT -= h
    if (s.crumple) {
      s.wDown = Math.min(1, s.wDown + h * 2.4)
      s.wCrouch = Math.max(0, s.wCrouch - h * 4)
      s.animMove = 0
      s.ready = 0
      s.dropY = 0
      if (s.flinging) stepFling(w, s, h)
      animate(s, s.joints, s.deadT)
      if (s.flinging) applyFling(s)
      s.poseVersion += 1
      if (s.wDown >= 1 && !s.flinging) {
        s.crumple = false
        onSettled(w, s)
      }
    }
    if (excess > 0 && s.sinkT === 0 && !s.ragActive && !s.crumple) {
      s.sinkT = 0.0001
      excess -= 1
    }
    if (s.sinkT > 0) {
      s.sinkT += h
      const j = s.joints
      for (let k = 1; k < j.length; k += 3) j[k] -= h * 0.45
      s.poseVersion += 1
      if (s.sinkT > 1.4) {
        freeSlot(w, s)
        continue
      }
    }
    bodies[m++] = s
  }
  bodies.length = m
}

function onSettled(w, s) {
  if (s.headW + s.torsoW + s.legL + s.legR + s.armL + s.armR > 0) {
    const j = s.joints
    emitDecal(w.fx, j[J_PELVIS * 3] + gauss() * 0.15, j[J_PELVIS * 3 + 2] + gauss() * 0.15, 0.55 + rand() * 0.35, w.time)
  }
}

function freeSlot(w, s) {
  if (!s.used) return
  releaseCover(w, s)
  if (s.patient) clearPatient(s)
  s.flinging = false
  s.burnT = 0
  s.used = false
  s.alive = false
  s.selected = false
  s.ragActive = false
  s.crumple = false
  s.sinkT = 0
  s.target = null
  s.nearest = null
  w.free.push(s.slot)
  w.version += 1
}

function move(w, s, type, h) {
  let speed = 0
  let dirX = 0
  let dirZ = 0
  const crawling = s.legL > 0 && s.legR > 0
  // Up on the rampart, wherever they're headed they stop at its edge.
  if (s.deck >= 0 && s.goalMode === 1) {
    GOAL.x = s.goalX
    GOAL.z = s.goalZ
    clampToDeck(w.rampart, s.deck, GOAL)
    s.goalX = GOAL.x
    s.goalZ = GOAL.z
  }
  if (s.goalMode === 1) {
    const gx = s.goalX - s.x
    const gz = s.goalZ - s.z
    const dist = Math.hypot(gx, gz)
    if (dist < 0.35) {
      s.goalMode = 0
    } else {
      // Straight there when the way is clear (always, up on the rampart), else follow
      // the flow field.
      // (Over raised floors the field knows where the ramps are.)
      if (s.deck >= 0 || (dist < 30 && segmentClear2D(w.obs, s.x, s.z, s.goalX, s.goalZ, 0.35) && !touchesLevels(w.levels, s.x, s.z, s.goalX, s.goalZ, 0.6))) {
        dirX = gx / dist
        dirZ = gz / dist
      } else {
        const field = w.flow.get(s.goalX, s.goalZ)
        if (field && w.flow.direction(field, s.x, s.z, DIR_OUT, w.levels ? s.fy : null)) {
          dirX = DIR_OUT.x
          dirZ = DIR_OUT.z
        } else {
          dirX = gx / dist
          dirZ = gz / dist
        }
      }
      // Unsticking: no progress for a while -> sidestep.
      s.progressT += h
      if (s.progressT > 1.2) {
        if (s.progressD - dist < 0.5 && s.detourT <= 0) {
          const side = rand() < 0.5 ? 1 : -1
          s.detourX = -dirZ * side
          s.detourZ = dirX * side
          s.detourT = 0.9
        }
        s.progressT = 0
        s.progressD = dist
      }
      if (s.detourT > 0) {
        s.detourT -= h
        dirX = dirX * 0.3 + s.detourX
        dirZ = dirZ * 0.3 + s.detourZ
        const l = Math.hypot(dirX, dirZ) || 1
        dirX /= l
        dirZ /= l
      }
      speed = type.speed
      // Zombies each shamble at their own pace.
      if (type.zombieAI) speed *= 0.82 + ((s.seed * 0.37) % 0.36)
      if (s.burnT > 0 && !s.downed && !type.zombieAI) speed *= 1.15
      // Barbed wire: picking a way through is slow going.
      if (w.build.wire.length && inWire(w, s.x, s.z)) speed *= 0.32
      if (s.downed) speed = 0.45
      else if (crawling) speed = 0.7
      else {
        const legs = s.legL + s.legR
        if (legs > 0) speed *= Math.max(0.45, 1 - 0.3 * legs)
        // Must get up before running off.
        if (s.wProne > 0.3 || s.wDown > 0.3) speed = 0
        if (s.staggerT > 0) speed *= 0.4
        if (s.target && type.runAndGun) speed *= 0.8
      }
      speed *= Math.min(1, dist / 1.2)
      // Hand over hand up (or down) a ladder.
      if (w.levels && ladderItem(w.levels, s.x, s.z)) speed = Math.min(speed, 1.3)
    }
  }

  // Separation from nearby friends and foes.
  let sepX = 0
  let sepZ = 0
  const sp = w.spatial
  const c0 = Math.max(0, Math.floor((s.x - 0.8 + sp.halfW) / 4))
  const c1 = Math.min(sp.cols - 1, Math.floor((s.x + 0.8 + sp.halfW) / 4))
  const r0 = Math.max(0, Math.floor((s.z - 0.8 + sp.halfD) / 4))
  const r1 = Math.min(sp.rows - 1, Math.floor((s.z + 0.8 + sp.halfD) / 4))
  const living = w.living
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const cell = r * sp.cols + c
      for (let k = sp.start[cell]; k < sp.start[cell + 1]; k += 1) {
        const o = living[sp.items[k]]
        if (o === s || o.dropY > 0) continue
        const ox = s.x - o.x
        const oz = s.z - o.z
        const d2 = ox * ox + oz * oz
        if (d2 > 0.64 || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const push = (0.8 - d) / 0.8
        sepX += (ox / d) * push
        sepZ += (oz / d) * push
      }
    }
  }

  let tvx = dirX * speed + sepX * 1.6
  let tvz = dirZ * speed + sepZ * 1.6
  // On a ladder: straight up or down it, nobody shoved off the side.
  const lad = w.levels ? ladderItem(w.levels, s.x, s.z) : null
  if (lad) {
    if (lad.ramp[0] === 'x') {
      tvx = dirX * speed
      tvz = ((lad.z0 + lad.z1) / 2 - s.z) * 4
    } else {
      tvz = dirZ * speed
      tvx = ((lad.x0 + lad.x1) / 2 - s.x) * 4
    }
  }
  const k = Math.min(1, h * 8)
  s.vx += (tvx - s.vx) * k
  s.vz += (tvz - s.vz) * k
  const ox = s.x
  const oz = s.z
  POS.x = s.x + s.vx * h
  POS.z = s.z + s.vz * h
  // On the rampart: anywhere on your section's top, never over the edge.
  if (s.deck >= 0) {
    clampToDeck(w.rampart, s.deck, POS)
  } else {
    collideCircle(w.obs, POS, SOLDIER_RADIUS)
    // Up and down ramps, about on platforms; never off an edge or up a sheer side.
    if (w.levels) stepOnLevels(w.levels, ox, oz, POS, s.fy)
  }
  s.x = POS.x
  s.z = POS.z
  if (w.levels && s.deck < 0) s.fy = floorAt(w.levels, s.x, s.z)
  const moved = Math.hypot(s.x - ox, s.z - oz)
  const realSpeed = moved / h

  // Facing: legs follow movement; standing still, the body turns to the aim.
  if (!s.downed) {
    if (realSpeed > 0.4) {
      const heading = Math.atan2(s.vx, s.vz)
      s.yaw += clamp(wrapAngle(heading - s.yaw), -h * 7, h * 7)
    } else if (s.target || s.ready > 0.5) {
      const rel = wrapAngle(s.aimYaw - s.yaw)
      if (Math.abs(rel) > 0.55) s.yaw += clamp(rel, -h * 4, h * 4)
    }
  } else {
    s.downT += h
  }
  const stepLen = 0.55 + 0.35 * Math.min(1, realSpeed / 4.5)
  s.gait += (moved * Math.PI) / stepLen
  if (s.gait > 1000) s.gait -= Math.PI * 300
  const mv = s.downed ? 0 : Math.min(1, realSpeed / 4.5)
  s.animMove += (mv - s.animMove) * Math.min(1, h * 10)
}

const POS = { x: 0, z: 0 }
const GOAL = { x: 0, z: 0 }
const DIR_OUT = { x: 0, z: 0 }

function animStep(s, h) {
  const proneT = s.wantProne ? 1 : 0
  const downT = s.downed ? 1 : 0
  const crouchT = s.wantCrouch && s.animMove < 0.2 ? 1 : 0
  s.wDown += clamp(downT - s.wDown, -h * 2.5, h * 2.5)
  s.wProne += clamp(proneT - s.wProne, -h * 2.4, h * 2.2)
  s.wCrouch += clamp((s.wProne > 0.05 ? 0 : crouchT) - s.wCrouch, -h * 6, h * 5)
  const decay = Math.exp(-14 * h)
  s.recoil *= decay
  const fd = Math.exp(-6 * h)
  s.flinchX *= fd
  s.flinchZ *= fd
}

// --- Commands (from the HUD / input) -------------------------------------------------

/** Living soldiers of `team` (not counting ones still dropping in). */
const teamCount = (w, team) => w.slots.reduce((n, s) => n + (s.used && s.alive && s.team === team ? 1 : 0), 0)

/**
 * Drops `count` soldiers of `typeKey` for `team` in a tight block around (x, z).
 * Returns { spawned, limited } - limited is a reason string if the caps cut it short.
 */
export function spawnUnits(w, typeKey, team, x, z, count, order, rot = 0) {
  if (BUILD_TYPES[typeKey]) return placeStructures(w, typeKey, x, z, count, rot)
  const type = UNIT_TYPES[typeKey]
  if (!type) return { spawned: 0, limited: null }
  if (type.trap) return placeMines(w, team, x, z, count)
  if (type.vehicle) return spawnVehicles(w, typeKey, team, x, z, count, order)
  if (type.strike) return callStrike(w, typeKey, team, x, z)
  let room = w.caps.units - teamCount(w, team)
  let limited = null
  if (room <= 0) return { spawned: 0, limited: `Team limit reached (${w.caps.units})` }
  if (type.heavy) {
    const cap = Math.max(2, Math.floor(w.caps.units * HEAVY_SHARE))
    const have = w.slots.reduce((n, s) => n + (s.used && s.alive && s.team === team && s.type === typeKey ? 1 : 0), 0)
    if (have >= cap) return { spawned: 0, limited: `Max ${cap} ${type.name} per team` }
    if (cap - have < room) room = cap - have
  }
  if (type.max) {
    const have = w.slots.reduce((n, s) => n + (s.used && s.alive && s.team === team && s.type === typeKey ? 1 : 0), 0)
    if (have >= type.max) return { spawned: 0, limited: `Max ${type.max} ${type.name}s per team` }
    if (type.max - have < room) room = type.max - have
  }
  // Crewed weapons come with their crew (a mortar and its loader): room for all of them.
  const crew = type.crew || 1
  if (count * crew > room) {
    limited = `Team limit reached (${w.caps.units})`
    count = Math.floor(room / crew)
    if (count <= 0) return { spawned: 0, limited }
  }
  const enemyBase = w.map.bases[1 - team]
  const face = Math.atan2(enemyBase.x - x, enemyBase.z - z)
  const cols = Math.ceil(Math.sqrt(count))
  const spacing = 1.25
  const onDeck = deckAt(w.rampart, x, z)
  const fx = Math.sin(face)
  const fz = Math.cos(face)
  let spawned = 0
  for (let i = 0; i < count; i += 1) {
    const s = allocSlot(w)
    if (!s) break
    const col = i % cols
    const row = Math.floor(i / cols)
    const ox = (col - (cols - 1) / 2) * spacing + (count > 1 ? gauss() * 0.15 : 0)
    const oz = -row * spacing
    POS.x = x + fz * ox + fx * oz
    POS.z = z - fx * ox + fz * oz
    // Dropped onto the rampart: they stand on top of it.
    const deck = onDeck >= 0 ? onDeck : -1
    if (deck >= 0) clampToDeck(w.rampart, deck, POS)
    else {
      collideCircle(w.obs, POS, SOLDIER_RADIUS)
      // Dropped on a roof or platform: the whole squad lands up there.
      if (w.levels) sameFloor(w.levels, x, z, POS)
    }
    resetSoldier(s, type, team, POS.x, POS.z, face, order)
    if (deck >= 0) {
      s.deck = deck
      s.fy = w.rampart.segs[deck].h
    } else if (w.levels) s.fy = floorAt(w.levels, s.x, s.z)
    s.dropY = 2.2 + rand() * 0.8 + row * 0.15
    s.dropV = 0
    s.scale = 0.2
    spawned += 1
    if (crew > 1) {
      // The loader lands beside his gunner.
      const l = allocSlot(w)
      if (l) {
        POS.x = s.x + fz * 1.3
        POS.z = s.z - fx * 1.3
        if (deck >= 0) clampToDeck(w.rampart, deck, POS)
        else collideCircle(w.obs, POS, SOLDIER_RADIUS)
        resetSoldier(l, UNIT_TYPES.rifle, team, POS.x, POS.z, face, order)
        if (deck >= 0) {
          l.deck = deck
          l.fy = s.fy
        } else if (w.levels) {
          // Beside his gunner, on the same floor (a railing or edge between: next to him).
          stepOnLevels(w.levels, s.x, s.z, POS)
          l.x = POS.x
          l.z = POS.z
          l.fy = floorAt(w.levels, l.x, l.z)
        }
        l.dropY = s.dropY + 0.3
        l.dropV = 0
        l.scale = 0.2
        linkCrew(s, l)
        spawned += 1
      }
    }
  }
  w.stats.deployed[team] += spawned
  if (spawned) {
    emitSound(w.fx, 'spawn', x, 0.5, z, 0)
    w.version += 1
  }
  return { spawned, limited }
}

/** One soldier of `type` at exactly (x, z) (no drop-in), within the team cap; or null. */
export function spawnOne(w, type, team, x, z, yaw, order) {
  if (teamCount(w, team) >= w.caps.units) return null
  const s = allocSlot(w)
  if (!s) return null
  POS.x = x
  POS.z = z
  collideCircle(w.obs, POS, SOLDIER_RADIUS)
  resetSoldier(s, type, team, POS.x, POS.z, yaw, order)
  w.stats.deployed[team] += 1
  w.version += 1
  return s
}

/**
 * A medic brings fallen soldier `b` back: up off the ground where he lay, badly hurt but
 * able to fight. Multiplayer clients are told (w.revives) so they clear the body they drew.
 */
export function reviveSoldier(w, b) {
  const j = b.joints
  POS.x = clamp(j[J_PELVIS * 3], -w.obs.limitX, w.obs.limitX)
  POS.z = clamp(j[J_PELVIS * 3 + 2], -w.obs.limitZ, w.obs.limitZ)
  collideCircle(w.obs, POS, SOLDIER_RADIUS)
  b.x = POS.x
  b.z = POS.z
  let i = w.bodies.indexOf(b)
  if (i >= 0) w.bodies.splice(i, 1)
  i = w.ragdolls.indexOf(b)
  if (i >= 0) w.ragdolls.splice(i, 1)
  b.alive = true
  b.ragActive = false
  b.crumple = false
  b.flinging = false
  b.sinkT = 0
  b.burnT = 0
  b.hp = b.maxHp * 0.35
  b.bleed = 0
  b.downed = false
  b.downT = 0
  b.staggerT = 1.2
  b.hurtT = 0
  b.suppress = 0.5
  // Lying down to start with: he gets up (animStep blends it).
  b.wDown = 1
  b.wProne = 0
  b.wCrouch = 0
  b.vx = 0
  b.vz = 0
  b.goalMode = 0
  b.target = null
  b.targetId = 0
  b.order = 'hold'
  b.holdX = b.x
  b.holdZ = b.z
  b.legL = 0
  b.legR = 0
  b.armL = 0
  b.armR = 0
  b.medicId = 0
  b.medicSlot = -1
  b.dropY = 0
  b.cover = -1
  w.stats.lost[b.team] = Math.max(0, w.stats.lost[b.team] - 1)
  if (w.revives) w.revives.push(b.id)
  emitSound(w.fx, 'heal', b.x, 1, b.z, 0)
  b.poseVersion += 1
  w.version += 1
}

/**
 * A crewman thrown out of a destroyed vehicle at (x, z), flung along (nx, nz): dead (a
 * body - no unit cap, it's not a unit), or `survive`: alive but hurt, a soldier who
 * fights on - only if the team has room, otherwise he doesn't make it either.
 */
export function ejectCrew(w, team, x, z, nx, nz, survive, charred) {
  const yaw = Math.atan2(nx, nz)
  if (survive) {
    const s = spawnOne(w, UNIT_TYPES.smg, team, x, z, yaw, 'hold')
    if (s) {
      s.hp *= 0.5
      s.staggerT = 0.9
      s.bleed = 0.4
      s.suppress = 1
      return s
    }
  }
  const s = allocSlot(w)
  if (!s) return null
  POS.x = x
  POS.z = z
  collideCircle(w.obs, POS, SOLDIER_RADIUS)
  resetSoldier(s, UNIT_TYPES.smg, team, POS.x, POS.z, yaw, 'hold')
  w.stats.deployed[team] += 1
  s.charred = Boolean(charred)
  const up = 0.9 + rand() * 0.4
  const l = Math.hypot(nx, up, nz)
  kill(w, s, -1, nx / l, up / l, nz / l, null, 14 + rand() * 12, true)
  return s
}

/** Takes a living soldier off the field at once (no body). */
export function removeSoldier(w, s) {
  freeSlot(w, s)
}

/** A melee blow (zombies): `dmg` to the body, pushed along (dx, dz). */
export function meleeHit(w, t, dmg, dx, dz, attacker) {
  hitSoldier(w, t, PART_TORSO, dmg, dx, 0.1, dz, attacker, t.x - dx * 0.2, 1.2, t.z - dz * 0.2)
}

function allocSlot(w) {
  let slot = w.free.pop()
  if (slot === undefined) {
    // Out of slots: make room by clearing the oldest body.
    const old = w.bodies.shift()
    if (!old) return null
    const i = w.ragdolls.indexOf(old)
    if (i >= 0) w.ragdolls.splice(i, 1)
    freeSlot(w, old)
    slot = w.free.pop()
  }
  return w.slots[slot]
}

/** Gives every selected living soldier `order`. */
export function orderSelected(w, order) {
  vehicleOrders(w, order)
  for (const s of w.slots) {
    if (!s.used || !s.alive || !s.selected || s.downed) continue
    s.order = order
    s.holdX = s.x
    s.holdZ = s.z
    s.flankDone = false
    const c = w.centroid[s.team]
    s.flankSide = s.z >= c.z ? 1 : -1
  }
}

/** Whether (x, z) and the ground half a metre round it are all on floor f. */
const onFloor = (L, x, z, f) => Math.abs(floorAt(L, x, z) - f) <= 0.3 && Math.abs(floorAt(L, x + 0.5, z) - f) <= 0.3 && Math.abs(floorAt(L, x - 0.5, z) - f) <= 0.3 && Math.abs(floorAt(L, x, z + 0.5) - f) <= 0.3 && Math.abs(floorAt(L, x, z - 0.5) - f) <= 0.3

/** Pulls p towards (x, z) until it's well onto the same floor (levels.js) as that point. */
function sameFloor(L, x, z, p) {
  const f = floorAt(L, x, z)
  for (let k = 0; k < 12 && !onFloor(L, p.x, p.z, f); k += 1) {
    p.x += (x - p.x) * 0.3
    p.z += (z - p.z) * 0.3
  }
}

/** Sends the selected soldiers to (x, z) in a block, nearest soldier to nearest spot. */
export function moveSelected(w, x, z) {
  const vehicles = moveVehicles(w, x, z)
  const units = w.slots.filter((s) => s.used && s.alive && s.selected && !s.downed)
  if (!units.length) return vehicles
  let cx = 0
  let cz = 0
  for (const s of units) {
    cx += s.x
    cz += s.z
  }
  cx /= units.length
  cz /= units.length
  const face = Math.atan2(x - cx, z - cz)
  const fx = Math.sin(face)
  const fz = Math.cos(face)
  const cols = Math.ceil(Math.sqrt(units.length * 1.6))
  const spacing = 1.6
  const spots = []
  // Sent somewhere along the top of the rampart: the spots are up there too.
  const toDeck = deckAt(w.rampart, x, z)
  for (let i = 0; i < units.length; i += 1) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const ox = (col - (cols - 1) / 2) * spacing
    const oz = -row * spacing
    POS.x = x + fz * ox + fx * oz
    POS.z = z - fx * ox + fz * oz
    if (toDeck >= 0) clampToDeck(w.rampart, toDeck, POS)
    else collideCircle(w.obs, POS, SOLDIER_RADIUS + 0.1)
    // Sent up onto a platform (or down beside one): every spot on that same floor.
    if (w.levels) sameFloor(w.levels, x, z, POS)
    spots.push({ x: POS.x, z: POS.z, used: false })
  }
  for (const s of units) {
    let best = null
    let bestD = Infinity
    for (const sp of spots) {
      if (sp.used) continue
      const d = (sp.x - s.x) ** 2 + (sp.z - s.z) ** 2
      if (d < bestD) {
        bestD = d
        best = sp
      }
    }
    best.used = true
    releaseCover(w, s)
    s.order = 'move'
    POS.x = best.x
    POS.z = best.z
    // Nobody climbs: those on the wall walk along their own section, those below go
    // to the foot of it.
    if (s.deck >= 0) clampToDeck(w.rampart, s.deck, POS)
    else if (toDeck >= 0) collideCircle(w.obs, POS, SOLDIER_RADIUS + 0.1)
    s.moveX = POS.x
    s.moveZ = POS.z
    s.thinkT = 0
    s.progressT = 0
    s.progressD = Infinity
  }
  return units.length + vehicles
}

/**
 * Multiplayer commands name units by id (the server keeps no one's selection): selects
 * exactly those of `team`'s living units, runs `fn`, and clears the selection again.
 */
export function withUnits(w, team, soldierIds, vehicleIds, fn) {
  const want = new Set(soldierIds || [])
  const wantV = new Set(vehicleIds || [])
  for (const s of w.slots) s.selected = s.used && s.alive && s.team === team && want.has(s.id)
  for (const v of w.veh.list) v.selected = v.used && v.alive && v.team === team && wantV.has(v.id)
  const out = fn()
  for (const s of w.slots) s.selected = false
  for (const v of w.veh.list) v.selected = false
  return out
}

/** Removes the selected living soldiers at once (no ragdoll). */
export function deleteSelected(w) {
  let n = deleteVehicles(w)
  for (const s of w.slots) {
    if (!s.used || !s.alive || !s.selected) continue
    emitImpact(w.fx, s.x, 0.6, s.z, 3, w.time)
    freeSlot(w, s)
    n += 1
  }
  return n
}

/** Clears the battlefield: every soldier, body, bullet and mark. */
export function clearAll(w) {
  for (const s of w.slots) if (s.used) freeSlot(w, s)
  w.bodies.length = 0
  w.ragdolls.length = 0
  for (const b of w.bullets) w.bulletPool.push(b)
  w.bullets.length = 0
  clearOrdnance(w)
  clearVehicles(w)
  clearStructures(w)
  for (const sp of w.coverSpots) sp.taken = -1
  w.stats.lost[0] = w.stats.lost[1] = 0
  w.stats.kills[0] = w.stats.kills[1] = 0
  w.stats.deployed[0] = w.stats.deployed[1] = 0
  w.fx.clearDecals = true
  w.fx.clearScorches = true
  w.version += 1
}

export function setSelection(w, slots, additive = false, vehicles = []) {
  if (!additive) {
    for (const s of w.slots) s.selected = false
    for (const v of w.veh.list) v.selected = false
  }
  for (const i of slots) {
    const s = w.slots[i]
    if (s && s.used && s.alive) s.selected = true
  }
  for (const i of vehicles) {
    const v = w.veh.list[i]
    if (v && v.used && v.alive) v.selected = true
  }
  w.version += 1
}

export function selectTeam(w, team) {
  for (const s of w.slots) s.selected = s.used && s.alive && s.team === team && !s.downed
  for (const v of w.veh.list) v.selected = v.used && v.alive && v.team === team
  w.version += 1
}

export function clearSelection(w) {
  for (const s of w.slots) s.selected = false
  for (const v of w.veh.list) v.selected = false
  w.version += 1
}

/** Whether anything (soldier or vehicle) is selected. */
export const anySelected = (w) => w.slots.some((s) => s.used && s.alive && s.selected) || w.veh.list.some((v) => v.used && v.alive && v.selected)

/** Active ragdolls as "bodies" for the performance budget. */
export const activeBodies = (w) => w.ragdolls.length * BODIES_PER_RAGDOLL
