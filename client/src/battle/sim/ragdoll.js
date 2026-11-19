import { GRAVITY } from './constants.js'
import { pushOutSphere } from './obstacles.js'
import { groundAt } from './terrain.js'
import {
  BONE,
  JOINT_COUNT,
  J_EL_L,
  J_EL_R,
  J_FT_L,
  J_FT_R,
  J_GRIP,
  J_HA_L,
  J_HA_R,
  J_HEAD,
  J_HIP_L,
  J_HIP_R,
  J_KN_L,
  J_KN_R,
  J_MUZZLE,
  J_NECK,
  J_NOSE,
  J_PELVIS,
  J_SH_L,
  J_SH_R,
} from './rig.js'

/**
 * Ragdolls: position-based dynamics on the 18 rig joints (verlet integration, distance
 * constraints, ground and box collision). No physics library and no rigid bodies - a
 * ragdoll is 18 points and ~30 sticks, which is far cheaper than a jointed rigid-body
 * ragdoll, and starting from the animated pose makes every death seamless.
 *
 * Each ragdoll counts as 10 "bodies" against the performance budget (its limb
 * segments); the world caps how many simulate at once and puts them to sleep as soon
 * as they settle, after which a body costs nothing but drawing.
 */

export const BODIES_PER_RAGDOLL = 10

const RADIUS = new Float32Array(JOINT_COUNT)
RADIUS[J_HEAD] = 0.16
RADIUS[J_NOSE] = 0.06
RADIUS[J_NECK] = 0.08
RADIUS[J_PELVIS] = 0.13
RADIUS[J_SH_L] = RADIUS[J_SH_R] = 0.09
RADIUS[J_EL_L] = RADIUS[J_EL_R] = 0.06
RADIUS[J_HA_L] = RADIUS[J_HA_R] = 0.05
RADIUS[J_HIP_L] = RADIUS[J_HIP_R] = 0.1
RADIUS[J_KN_L] = RADIUS[J_KN_R] = 0.07
RADIUS[J_FT_L] = RADIUS[J_FT_R] = 0.07
RADIUS[J_GRIP] = RADIUS[J_MUZZLE] = 0.04

/**
 * [a, b, stiffness, fixed length or -1 to measure it from the death pose]. Torso joints
 * are cross-braced into a rigid box; the head hangs on looser sticks so it flops.
 */
const STICKS = [
  [J_NECK, J_SH_L, 1, -1],
  [J_NECK, J_SH_R, 1, -1],
  [J_SH_L, J_SH_R, 1, -1],
  [J_NECK, J_PELVIS, 1, -1],
  [J_SH_L, J_PELVIS, 1, -1],
  [J_SH_R, J_PELVIS, 1, -1],
  [J_PELVIS, J_HIP_L, 1, -1],
  [J_PELVIS, J_HIP_R, 1, -1],
  [J_HIP_L, J_HIP_R, 1, -1],
  [J_SH_L, J_HIP_L, 1, -1],
  [J_SH_R, J_HIP_R, 1, -1],
  [J_SH_L, J_HIP_R, 1, -1],
  [J_SH_R, J_HIP_L, 1, -1],
  [J_HEAD, J_NECK, 1, BONE.head],
  [J_HEAD, J_NOSE, 1, BONE.nose],
  [J_NOSE, J_NECK, 1, -1],
  [J_HEAD, J_SH_L, 0.25, -1],
  [J_HEAD, J_SH_R, 0.25, -1],
  [J_SH_L, J_EL_L, 1, BONE.upperArm],
  [J_EL_L, J_HA_L, 1, BONE.foreArm],
  [J_SH_R, J_EL_R, 1, BONE.upperArm],
  [J_EL_R, J_HA_R, 1, BONE.foreArm],
  [J_HIP_L, J_KN_L, 1, BONE.thigh],
  [J_KN_L, J_FT_L, 1, BONE.shin],
  [J_HIP_R, J_KN_R, 1, BONE.thigh],
  [J_KN_R, J_FT_R, 1, BONE.shin],
  [J_GRIP, J_MUZZLE, 1, -1],
]
export const STICK_COUNT = STICKS.length

/** [a, b, minimum length]: stops joints folding through each other. */
const LIMITS = [
  [J_SH_L, J_HA_L, (BONE.upperArm + BONE.foreArm) * 0.35],
  [J_SH_R, J_HA_R, (BONE.upperArm + BONE.foreArm) * 0.35],
  [J_HIP_L, J_FT_L, (BONE.thigh + BONE.shin) * 0.5],
  [J_HIP_R, J_FT_R, (BONE.thigh + BONE.shin) * 0.5],
  [J_KN_L, J_KN_R, 0.14],
  [J_FT_L, J_FT_R, 0.14],
  [J_HEAD, J_PELVIS, BONE.neck * 0.95],
  [J_HA_L, J_PELVIS, 0.16],
  [J_HA_R, J_PELVIS, 0.16],
]

const ITERATIONS = 6

/** Which joints a hit to each zone shoves hardest (PART_* order). */
const HIT_JOINTS = [
  [J_HEAD, J_NOSE, J_NECK],
  [J_NECK, J_SH_L, J_SH_R, J_PELVIS],
  [J_SH_L, J_EL_L, J_HA_L],
  [J_SH_R, J_EL_R, J_HA_R],
  [J_HIP_L, J_KN_L, J_FT_L],
  [J_HIP_R, J_KN_R, J_FT_R],
]

/**
 * Starts soldier `s`'s ragdoll from its current joints (s.joints, freshly animated).
 * vx/vz: the soldier's own velocity. part: hit zone or -1. (dx, dy, dz): shove direction
 * (unit), `power` its speed in m/s.
 */
export function startRagdoll(s, vx, vz, part, dx, dy, dz, power) {
  const p = s.joints
  const q = s.prev
  const h = 1 / 60
  for (let i = 0; i < STICK_COUNT; i += 1) {
    const st = STICKS[i]
    if (st[3] > 0) {
      s.rest[i] = st[3]
    } else {
      const a = st[0] * 3
      const b = st[1] * 3
      s.rest[i] = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2])
    }
  }
  const base = power * 0.3
  for (let j = 0; j < JOINT_COUNT; j += 1) {
    const i = j * 3
    const up = 0.4 + Math.random() * 0.4
    q[i] = p[i] - (vx + dx * base) * h
    q[i + 1] = p[i + 1] - (dy * base + up) * h
    q[i + 2] = p[i + 2] - (vz + dz * base) * h
  }
  if (part >= 0) {
    const js = HIT_JOINTS[part]
    for (let k = 0; k < js.length; k += 1) {
      const i = js[k] * 3
      q[i] -= dx * power * h
      q[i + 1] -= dy * power * h
      q[i + 2] -= dz * power * h
    }
  }
  // The dropped weapon tumbles away.
  const spin = (Math.random() - 0.5) * 3
  q[J_MUZZLE * 3] -= spin * h
  q[J_MUZZLE * 3 + 1] -= 1.5 * h
  q[J_MUZZLE * 3 + 2] += spin * h
  s.ragAge = 0
  s.ragCalm = 0
  s.ragDt = h
  s.ragActive = true
  s.ragHitGround = false
}

/**
 * One step of soldier `s`'s ragdoll. Returns true on the first frame its body slams
 * into the ground (for the thud sound).
 */
export function stepRagdoll(s, dt, obs) {
  const p = s.joints
  const q = s.prev
  const k = dt / (s.ragDt || dt)
  const g = GRAVITY * dt * dt
  const damp = 0.996
  for (let i = 0; i < JOINT_COUNT * 3; i += 3) {
    const vx = (p[i] - q[i]) * k * damp
    const vy = (p[i + 1] - q[i + 1]) * k * damp
    const vz = (p[i + 2] - q[i + 2]) * k * damp
    q[i] = p[i]
    q[i + 1] = p[i + 1]
    q[i + 2] = p[i + 2]
    p[i] += vx
    p[i + 1] += vy - g
    p[i + 2] += vz
  }

  let landed = false
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (let c = 0; c < STICK_COUNT; c += 1) {
      const st = STICKS[c]
      const a = st[0] * 3
      const b = st[1] * 3
      const dx = p[b] - p[a]
      const dy = p[b + 1] - p[a + 1]
      const dz = p[b + 2] - p[a + 2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len < 1e-6) continue
      const diff = ((len - s.rest[c]) / len) * 0.5 * st[2]
      p[a] += dx * diff
      p[a + 1] += dy * diff
      p[a + 2] += dz * diff
      p[b] -= dx * diff
      p[b + 1] -= dy * diff
      p[b + 2] -= dz * diff
    }
    for (let c = 0; c < LIMITS.length; c += 1) {
      const lm = LIMITS[c]
      const a = lm[0] * 3
      const b = lm[1] * 3
      const dx = p[b] - p[a]
      const dy = p[b + 1] - p[a + 1]
      const dz = p[b + 2] - p[a + 2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len >= lm[2] || len < 1e-6) continue
      const diff = ((len - lm[2]) / len) * 0.5
      p[a] += dx * diff
      p[a + 1] += dy * diff
      p[a + 2] += dz * diff
      p[b] -= dx * diff
      p[b + 1] -= dy * diff
      p[b + 2] -= dz * diff
    }
    for (let j = 0; j < JOINT_COUNT; j += 1) {
      const i = j * 3
      const r = RADIUS[j]
      const ground = obs.terrain ? groundAt(obs.terrain, p[i], p[i + 2]) + r : r
      if (p[i + 1] < ground) {
        p[i + 1] = ground
        if (j === J_PELVIS || j === J_SH_L || j === J_HEAD) landed = true
      }
      pushOutSphere(obs, p, i, r)
    }
  }

  // Ground friction: joints touching the ground lose sideways speed.
  const keep = Math.exp(-9 * dt)
  let motion = 0
  for (let j = 0; j < JOINT_COUNT; j += 1) {
    const i = j * 3
    const floor = obs.terrain ? groundAt(obs.terrain, p[i], p[i + 2]) : 0
    if (p[i + 1] <= floor + RADIUS[j] + 0.01) {
      q[i] = p[i] - (p[i] - q[i]) * keep
      q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * keep
    }
    const mx = p[i] - q[i]
    const my = p[i + 1] - q[i + 1]
    const mz = p[i + 2] - q[i + 2]
    motion += mx * mx + my * my + mz * mz
  }

  s.ragDt = dt
  s.ragAge += dt
  const speed = Math.sqrt(motion / JOINT_COUNT) / dt
  if (speed < 0.22) s.ragCalm += dt
  else s.ragCalm = 0
  // Asleep: settled, or simply old enough.
  if (s.ragCalm > 0.4 || s.ragAge > 4) s.ragActive = false

  const firstLanding = landed && !s.ragHitGround
  if (landed) s.ragHitGround = true
  return firstLanding
}
