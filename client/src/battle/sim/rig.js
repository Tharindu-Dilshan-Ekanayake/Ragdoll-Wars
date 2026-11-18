import { unitType } from './units.js'

/**
 * The soldier rig: procedural animation into joint positions, and joint positions into
 * the transforms of the body parts that get drawn.
 *
 * Living soldiers are posed here every frame from their state (walk cycle, kneel,
 * prone, crawl, downed writhing, aim, recoil, reload, flinch); dead ones get their joints
 * from the ragdoll. Both then go through `buildParts`, so a death is seamless: the
 * ragdoll starts from exactly the pose the soldier was in.
 *
 * Plain JS on typed arrays, no allocation per call. Body space: +Z forward, +X is the
 * soldier's LEFT, +Y up; `yaw` turns +Z towards +X.
 */

export const JOINT_COUNT = 18
export const J_HEAD = 0
export const J_NECK = 1
export const J_PELVIS = 2
export const J_SH_L = 3
export const J_SH_R = 4
export const J_EL_L = 5
export const J_EL_R = 6
export const J_HA_L = 7
export const J_HA_R = 8
export const J_HIP_L = 9
export const J_HIP_R = 10
export const J_KN_L = 11
export const J_KN_R = 12
export const J_FT_L = 13
export const J_FT_R = 14
export const J_GRIP = 15
export const J_MUZZLE = 16
export const J_NOSE = 17

export const BONE = {
  thigh: 0.41,
  shin: 0.41,
  upperArm: 0.27,
  foreArm: 0.27,
  /** Pelvis centre to the base of the neck. */
  neck: 0.6,
  /** Pelvis centre up the spine to the shoulder line. */
  shoulderUp: 0.55,
  shoulderW: 0.24,
  hipW: 0.11,
  hipDrop: 0.03,
  /** Neck to the centre of the head. */
  head: 0.17,
  /** Head centre to the nose marker (gives the head its facing). */
  nose: 0.12,
  ankle: 0.07,
}

/** Drawn parts, in the order the renderer's instanced meshes expect. */
export const PART_COUNT = 18
export const P_PELVIS = 0
export const P_TORSO = 1
export const P_VEST = 2
export const P_HEAD = 3
export const P_HELMET = 4
export const P_UARM_L = 5
export const P_UARM_R = 6
export const P_FARM_L = 7
export const P_FARM_R = 8
export const P_THIGH_L = 9
export const P_THIGH_R = 10
export const P_SHIN_L = 11
export const P_SHIN_R = 12
export const P_BOOT_L = 13
export const P_BOOT_R = 14
export const P_HAND_L = 15
export const P_HAND_R = 16
export const P_WEAPON = 17
/** Floats per part: position xyz, quaternion xyzw, uniform scale. */
export const TRS = 8

const N3 = JOINT_COUNT * 3
const POSE_U = new Float32Array(N3)
const POSE_P = new Float32Array(N3)
const POSE_D = new Float32Array(N3)
const POSE_L = new Float32Array(N3)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2)
  if (a < 0) a += Math.PI * 2
  return a - Math.PI
}

function setJ(arr, j, x, y, z) {
  arr[j * 3] = x
  arr[j * 3 + 1] = y
  arr[j * 3 + 2] = z
}

/** arr[j] = arr[base] + v * k  (v given as components) */
function offsetJ(arr, j, base, vx, vy, vz, k) {
  arr[j * 3] = arr[base * 3] + vx * k
  arr[j * 3 + 1] = arr[base * 3 + 1] + vy * k
  arr[j * 3 + 2] = arr[base * 3 + 2] + vz * k
}

/**
 * Two-bone IK. arr[root] is the hip/shoulder, arr[end] the wanted foot/hand (pulled in if
 * out of reach). Writes the knee/elbow to arr[mid], bending towards the pole direction.
 */
function ik(arr, root, mid, end, l1, l2, px, py, pz) {
  const ax = arr[root * 3]
  const ay = arr[root * 3 + 1]
  const az = arr[root * 3 + 2]
  let dx = arr[end * 3] - ax
  let dy = arr[end * 3 + 1] - ay
  let dz = arr[end * 3 + 2] - az
  let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dist < 1e-5) {
    dx = 0
    dy = -1
    dz = 0
    dist = 1e-5
  }
  const nx = dx / dist
  const ny = dy / dist
  const nz = dz / dist
  const reach = l1 + l2 - 1e-4
  const minReach = Math.abs(l1 - l2) + 0.02
  const d = clamp(dist, minReach, reach)
  if (d !== dist) setJ(arr, end, ax + nx * d, ay + ny * d, az + nz * d)
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  // Pole projected onto the plane perpendicular to root->end.
  const pd = px * nx + py * ny + pz * nz
  let qx = px - nx * pd
  let qy = py - ny * pd
  let qz = pz - nz * pd
  let ql = Math.sqrt(qx * qx + qy * qy + qz * qz)
  if (ql < 1e-5) {
    qx = 0
    qy = 0
    qz = 1
    ql = 1
  }
  setJ(arr, mid, ax + nx * a + (qx / ql) * h, ay + ny * a + (qy / ql) * h, az + nz * a + (qz / ql) * h)
}

// Scratch vectors for the pose builders.
const UP = new Float32Array(3)
const LEFT = new Float32Array(3)
const FWD = new Float32Array(3)
const DIR = new Float32Array(3)

/** Rotate (x, z) about Y by angle a (body yaw convention). */
const rotX = (x, z, c, s) => x * c + z * s
const rotZ = (x, z, c, s) => -x * s + z * c

/**
 * Weapon and both arms, shared by the upright and prone poses. Expects the shoulders,
 * UP/LEFT/FWD (torso axes) and DIR (weapon direction) filled in.
 */
function poseArms(out, type, ready, reloadP, t, seed) {
  const shR = J_SH_R * 3
  const pistol = type.foregrip === 0
  let gx
  let gy
  let gz
  if (pistol) {
    // Arms out in front of the chest when aiming; down by the hip when relaxed.
    const cx = (out[J_SH_L * 3] + out[shR]) / 2
    const cy = (out[J_SH_L * 3 + 1] + out[shR + 1]) / 2
    const cz = (out[J_SH_L * 3 + 2] + out[shR + 2]) / 2
    const ax = cx + DIR[0] * 0.44 - UP[0] * 0.05
    const ay = cy + DIR[1] * 0.44 - UP[1] * 0.05
    const az = cz + DIR[2] * 0.44 - UP[2] * 0.05
    const rx = out[shR] - UP[0] * 0.4 + FWD[0] * 0.12
    const ry = out[shR + 1] - UP[1] * 0.4 + FWD[1] * 0.12
    const rz = out[shR + 2] - UP[2] * 0.4 + FWD[2] * 0.12
    gx = lerp(rx, ax, ready)
    gy = lerp(ry, ay, ready)
    gz = lerp(rz, az, ready)
  } else {
    // Stock in the right shoulder pocket, lower when relaxed.
    const low = 1 - ready
    const px = out[shR] + FWD[0] * 0.06 + LEFT[0] * 0.06 - UP[0] * (0.03 + low * 0.12)
    const py = out[shR + 1] + FWD[1] * 0.06 + LEFT[1] * 0.06 - UP[1] * (0.03 + low * 0.12)
    const pz = out[shR + 2] + FWD[2] * 0.06 + LEFT[2] * 0.06 - UP[2] * (0.03 + low * 0.12)
    gx = px + DIR[0] * type.back
    gy = py + DIR[1] * type.back
    gz = pz + DIR[2] * type.back
  }
  setJ(out, J_GRIP, gx, gy, gz)
  setJ(out, J_MUZZLE, gx + DIR[0] * type.front, gy + DIR[1] * type.front, gz + DIR[2] * type.front)
  // Right hand on the grip.
  setJ(out, J_HA_R, gx, gy - 0.02, gz)
  // Left hand on the foregrip (or cupping a pistol), or at the magazine while reloading.
  let lx
  let ly
  let lz
  if (pistol) {
    lx = gx + LEFT[0] * 0.05
    ly = gy - 0.03
    lz = gz + LEFT[2] * 0.05
  } else {
    lx = gx + DIR[0] * type.foregrip
    ly = gy + DIR[1] * type.foregrip - 0.04
    lz = gz + DIR[2] * type.foregrip
  }
  if (reloadP >= 0) {
    const k = Math.sin(Math.PI * reloadP)
    const wob = Math.sin(t * 14 + seed) * 0.02
    lx = lerp(lx, gx + DIR[0] * 0.08 - UP[0] * 0.16, k) + wob
    ly = lerp(ly, gy + DIR[1] * 0.08 - UP[1] * 0.16, k)
    lz = lerp(lz, gz + DIR[2] * 0.08 - UP[2] * 0.16, k)
  }
  setJ(out, J_HA_L, lx, ly, lz)
  // Elbows down and out.
  ik(out, J_SH_R, J_EL_R, J_HA_R, BONE.upperArm, BONE.foreArm, -LEFT[0] * 0.7 - UP[0] - FWD[0] * 0.3, -LEFT[1] * 0.7 - UP[1] - FWD[1] * 0.3, -LEFT[2] * 0.7 - UP[2] - FWD[2] * 0.3)
  ik(out, J_SH_L, J_EL_L, J_HA_L, BONE.upperArm, BONE.foreArm, LEFT[0] * 0.5 - UP[0], LEFT[1] * 0.5 - UP[1], LEFT[2] * 0.5 - UP[2])
}

/** Standing, walking, running, limping and kneeling (crouch weight). Body space. */
function poseUpright(s, out, t, type) {
  const mv = s.animMove
  const ph = s.gait
  const c = s.wCrouch
  const cy = Math.cos(s.yaw)
  const sy = Math.sin(s.yaw)
  const aimRel = clamp(wrapAngle(s.aimYaw - s.yaw), -1.5, 1.5)
  const twist = clamp(aimRel, -1.05, 1.05) * 0.85
  const headYaw = clamp(aimRel - twist, -0.7, 0.7)
  // Flinch: the world-space shove, in body space.
  const flF = s.flinchX * sy + s.flinchZ * cy
  const flS = s.flinchX * cy - s.flinchZ * sy
  const limpL = s.legL > 0 ? 1 : 0
  const limpR = s.legR > 0 ? 1 : 0
  const limp = Math.max(limpL, limpR) * mv

  const bob = -0.03 * mv * Math.cos(2 * ph)
  const dip = limp * 0.05 * Math.max(0, limpL ? -Math.cos(ph) : -Math.cos(ph + Math.PI))
  const pelvisY = lerp(0.84, 0.5, c) + bob * (1 - c) - dip
  const leanF = 0.04 + 0.2 * mv + 0.16 * c + flF * 0.9
  const leanS = flS * 0.9 + (limpL - limpR) * limp * 0.1
  const sway = 0.1 * mv * Math.sin(ph)

  setJ(out, J_PELVIS, 0, pelvisY, 0)
  // Torso axes: roll, then lean forward, then twist.
  const cr = Math.cos(leanS)
  const sr = Math.sin(leanS)
  const cl = Math.cos(leanF)
  const sl = Math.sin(leanF)
  const ct = Math.cos(twist + sway * 0.5)
  const st = Math.sin(twist + sway * 0.5)
  // up = rotY(lean(roll(0,1,0)))
  let ux = sr
  let uy = cr * cl
  let uz = cr * sl
  UP[0] = rotX(ux, uz, ct, st)
  UP[1] = uy
  UP[2] = rotZ(ux, uz, ct, st)
  // left = rotY(lean(roll(1,0,0)))
  ux = cr
  uy = -sr * cl
  uz = -sr * sl
  LEFT[0] = rotX(ux, uz, ct, st)
  LEFT[1] = uy
  LEFT[2] = rotZ(ux, uz, ct, st)
  // fwd = left x up
  FWD[0] = LEFT[1] * UP[2] - LEFT[2] * UP[1]
  FWD[1] = LEFT[2] * UP[0] - LEFT[0] * UP[2]
  FWD[2] = LEFT[0] * UP[1] - LEFT[1] * UP[0]

  offsetJ(out, J_NECK, J_PELVIS, UP[0], UP[1], UP[2], BONE.neck)
  const shx = UP[0] * BONE.shoulderUp
  const shy = UP[1] * BONE.shoulderUp
  const shz = UP[2] * BONE.shoulderUp
  setJ(out, J_SH_L, shx + LEFT[0] * BONE.shoulderW, pelvisY + shy + LEFT[1] * BONE.shoulderW, shz + LEFT[2] * BONE.shoulderW)
  setJ(out, J_SH_R, shx - LEFT[0] * BONE.shoulderW, pelvisY + shy - LEFT[1] * BONE.shoulderW, shz - LEFT[2] * BONE.shoulderW)

  // Head looks along the aim.
  const hp = clamp(leanF * 0.4 - s.aimPitch * 0.6, -0.6, 0.8)
  const hy = twist + headYaw
  const chy = Math.cos(hy)
  const shy2 = Math.sin(hy)
  const hux = 0
  const huy = Math.cos(hp)
  const huz = Math.sin(hp)
  const headUx = rotX(hux, huz, chy, shy2) + UP[0] * 0.3
  const headUy = huy
  const headUz = rotZ(hux, huz, chy, shy2) + UP[2] * 0.3
  const hl = Math.sqrt(headUx * headUx + headUy * headUy + headUz * headUz)
  offsetJ(out, J_HEAD, J_NECK, headUx / hl, headUy / hl, headUz / hl, BONE.head)
  // Nose: forward from the head, pitched with the aim.
  const npx = Math.cos(-s.aimPitch * 0.7)
  const nfx = Math.sin(hy) * npx
  const nfz = Math.cos(hy) * npx
  const nfy = Math.sin(s.aimPitch * 0.7)
  offsetJ(out, J_NOSE, J_HEAD, nfx, nfy, nfz, BONE.nose)

  // Hips and legs.
  const cs = Math.cos(sway)
  const ss = Math.sin(sway)
  setJ(out, J_HIP_L, rotX(BONE.hipW, 0, cs, ss), pelvisY - BONE.hipDrop, rotZ(BONE.hipW, 0, cs, ss))
  setJ(out, J_HIP_R, rotX(-BONE.hipW, 0, cs, ss), pelvisY - BONE.hipDrop, rotZ(-BONE.hipW, 0, cs, ss))
  const stride = 0.22 + 0.2 * mv
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? 1 : -1
    const p = ph + (k === 0 ? 0 : Math.PI)
    const hurt = k === 0 ? limpL : limpR
    const amp = mv * (hurt ? 0.55 : 1)
    let fx = side * 0.12
    let fy = BONE.ankle + 0.13 * Math.max(0, Math.cos(p)) * amp * (hurt ? 0.4 : 1)
    let fz = stride * Math.sin(p) * amp
    // Kneel: left foot planted forward, right knee down.
    if (c > 0) {
      fx = lerp(fx, side > 0 ? 0.15 : -0.12, c)
      fy = lerp(fy, side > 0 ? BONE.ankle : 0.05, c)
      fz = lerp(fz, side > 0 ? 0.3 : -0.4, c)
    }
    const foot = k === 0 ? J_FT_L : J_FT_R
    setJ(out, foot, rotX(fx, fz, cs * 0.5 + 0.5, ss * 0.5), fy, rotZ(fx, fz, cs * 0.5 + 0.5, ss * 0.5))
    ik(out, k === 0 ? J_HIP_L : J_HIP_R, k === 0 ? J_KN_L : J_KN_R, foot, BONE.thigh, BONE.shin, side * 0.15, 0, 1)
  }

  // Weapon direction: aim, relaxed carry, recoil, and a shaky aim with a hurt arm.
  const shake = s.armL + s.armR > 0 ? Math.sin(t * 9 + s.seed) * 0.03 * (s.armL + s.armR) : 0
  const ap = clamp(s.aimPitch + s.recoil * 0.2, -0.8, 0.8) + shake
  const ay = aimRel + shake * 0.7
  const ax2 = Math.sin(ay) * Math.cos(ap)
  const ay2 = Math.sin(ap)
  const az2 = Math.cos(ay) * Math.cos(ap)
  // Relaxed: low ready, muzzle forward-down and a little across the body.
  const ry = twist * 0.6 + 0.3
  const rp = -0.45
  const rx2 = Math.sin(ry) * Math.cos(rp)
  const ry2 = Math.sin(rp)
  const rz2 = Math.cos(ry) * Math.cos(rp)
  let ready = s.ready
  let dx = lerp(rx2, ax2, ready)
  let dy = lerp(ry2, ay2, ready)
  let dz = lerp(rz2, az2, ready)
  if (s.reloadP >= 0) {
    const k = Math.sin(Math.PI * s.reloadP)
    dy -= 0.45 * k
    ready *= 1 - k * 0.6
  }
  const dl = Math.sqrt(dx * dx + dy * dy + dz * dz)
  DIR[0] = dx / dl
  DIR[1] = dy / dl
  DIR[2] = dz / dl
  poseArms(out, type, ready, s.reloadP, t, s.seed)
}

/** Lying on the stomach, weapon forward; crawling when moving. Body space. */
function poseProne(s, out, t, type) {
  const mv = s.animMove
  const ph = s.gait
  const aimRel = clamp(wrapAngle(s.aimYaw - s.yaw), -0.7, 0.7)
  const pelvisY = 0.17
  setJ(out, J_PELVIS, 0, pelvisY, -0.1)
  const raise = s.ready > 0.5 ? 0.34 : 0.2
  const tw = aimRel * 0.4
  const ct = Math.cos(tw)
  const st = Math.sin(tw)
  let l = Math.sqrt(raise * raise + 1)
  UP[0] = rotX(0, 1 / l, ct, st)
  UP[1] = raise / l
  UP[2] = rotZ(0, 1 / l, ct, st)
  LEFT[0] = ct
  LEFT[1] = 0
  LEFT[2] = -st
  FWD[0] = LEFT[1] * UP[2] - LEFT[2] * UP[1]
  FWD[1] = LEFT[2] * UP[0] - LEFT[0] * UP[2]
  FWD[2] = LEFT[0] * UP[1] - LEFT[1] * UP[0]
  offsetJ(out, J_NECK, J_PELVIS, UP[0], UP[1], UP[2], BONE.neck)
  const px = out[J_PELVIS * 3]
  const pz = out[J_PELVIS * 3 + 2]
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? 1 : -1
    const j = k === 0 ? J_SH_L : J_SH_R
    setJ(out, j, px + UP[0] * BONE.shoulderUp + LEFT[0] * side * BONE.shoulderW, pelvisY + UP[1] * BONE.shoulderUp, pz + UP[2] * BONE.shoulderUp + LEFT[2] * side * BONE.shoulderW)
  }
  // Head up, looking ahead.
  const hy = aimRel
  let hx = Math.sin(hy) * 0.66
  let hyy = 0.75
  let hz = Math.cos(hy) * 0.66
  l = Math.sqrt(hx * hx + hyy * hyy + hz * hz)
  offsetJ(out, J_HEAD, J_NECK, hx / l, hyy / l, hz / l, BONE.head)
  offsetJ(out, J_NOSE, J_HEAD, Math.sin(hy), 0.05, Math.cos(hy), BONE.nose)
  // Hips; legs splayed back, frog-kicking while crawling.
  setJ(out, J_HIP_L, px + LEFT[0] * BONE.hipW, pelvisY, pz + LEFT[2] * BONE.hipW)
  setJ(out, J_HIP_R, px - LEFT[0] * BONE.hipW, pelvisY, pz - LEFT[2] * BONE.hipW)
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? 1 : -1
    const pull = Math.max(0, Math.sin(ph + (k === 0 ? 0 : Math.PI))) * mv
    const foot = k === 0 ? J_FT_L : J_FT_R
    setJ(out, foot, px + side * (0.22 + 0.12 * pull), 0.07, pz - 0.86 + 0.32 * pull)
    ik(out, k === 0 ? J_HIP_L : J_HIP_R, k === 0 ? J_KN_L : J_KN_R, foot, BONE.thigh, BONE.shin, side, 0.25, 0)
  }
  // Weapon forward along the ground.
  const ap = clamp(s.aimPitch + s.recoil * 0.12, -0.15, 0.2)
  hx = Math.sin(aimRel) * Math.cos(ap)
  hyy = Math.sin(ap)
  hz = Math.cos(aimRel) * Math.cos(ap)
  if (mv > 0.05) {
    // Crawling: weapon cradled, elbows working.
    hyy -= 0.25
  }
  l = Math.sqrt(hx * hx + hyy * hyy + hz * hz)
  DIR[0] = hx / l
  DIR[1] = hyy / l
  DIR[2] = hz / l
  poseArms(out, type, Math.max(0.6, s.ready), s.reloadP, t, s.seed)
  if (mv > 0.05) {
    const w = Math.sin(ph) * 0.1 * mv
    out[J_HA_L * 3 + 2] += w
    out[J_HA_R * 3 + 2] -= w
  }
}

/** Badly wounded on the ground, on their back, clutching the wound. Body space. */
function poseDowned(s, out, t) {
  const seed = s.seed
  const writhe = Math.sin(t * 1.3 + seed)
  const pelvisY = 0.15
  setJ(out, J_PELVIS, 0, pelvisY, 0)
  // Spine runs back along -Z (fell backwards), chest up; left is +X.
  const lift = 0.14 + 0.08 * writhe
  let l = Math.sqrt(lift * lift + 1)
  UP[0] = 0.05 * Math.sin(t * 0.9 + seed)
  UP[1] = lift / l
  UP[2] = -1 / l
  LEFT[0] = 1
  LEFT[1] = 0
  LEFT[2] = 0
  offsetJ(out, J_NECK, J_PELVIS, UP[0], UP[1], UP[2], BONE.neck)
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? 1 : -1
    setJ(out, k === 0 ? J_SH_L : J_SH_R, UP[0] * BONE.shoulderUp + side * BONE.shoulderW, pelvisY + UP[1] * BONE.shoulderUp, UP[2] * BONE.shoulderUp)
  }
  const roll = Math.sin(t * 1.7 + seed * 2) * 0.35
  let hx = UP[0] + roll
  let hy = UP[1] + 0.45 + 0.15 * Math.sin(t * 2.1 + seed)
  let hz = UP[2]
  l = Math.sqrt(hx * hx + hy * hy + hz * hz)
  offsetJ(out, J_HEAD, J_NECK, hx / l, hy / l, hz / l, BONE.head)
  offsetJ(out, J_NOSE, J_HEAD, roll, 1, 0.15, BONE.nose * 0.7)
  // Right hand presses the wound; the left one reaches and claws.
  setJ(out, J_HA_R, -0.05, pelvisY + 0.17 + 0.02 * writhe, -0.22)
  setJ(out, J_HA_L, BONE.shoulderW + 0.3, 0.1 + 0.18 * Math.max(0, Math.sin(t * 2.3 + seed)), -0.45 + 0.12 * Math.sin(t * 1.5 + seed))
  ik(out, J_SH_R, J_EL_R, J_HA_R, BONE.upperArm, BONE.foreArm, -1, 0.4, 0)
  ik(out, J_SH_L, J_EL_L, J_HA_L, BONE.upperArm, BONE.foreArm, 0.3, -1, 0.2)
  // Legs: knees up, pushing at the ground in turn.
  setJ(out, J_HIP_L, BONE.hipW, pelvisY, 0.02)
  setJ(out, J_HIP_R, -BONE.hipW, pelvisY, 0.02)
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? 1 : -1
    const push = Math.max(0, Math.sin(t * 1.6 + seed + k * Math.PI))
    const foot = k === 0 ? J_FT_L : J_FT_R
    setJ(out, foot, side * 0.17, 0.07, 0.74 - 0.3 * push)
    ik(out, k === 0 ? J_HIP_L : J_HIP_R, k === 0 ? J_KN_L : J_KN_R, foot, BONE.thigh, BONE.shin, side * 0.2, 1, 0.2)
  }
  // The weapon is dropped beside them.
  setJ(out, J_GRIP, -0.45, 0.04, 0.1)
  setJ(out, J_MUZZLE, -0.5, 0.04, 0.7)
}

/**
 * Writes soldier `s`'s current animated pose, in world space, into `out`
 * (JOINT_COUNT * 3 floats). `t` is battle time in seconds.
 */
export function animate(s, out, t) {
  const type = unitType(s.type)
  const wd = s.wDown
  const wp = s.wProne * (1 - wd)
  const wu = 1 - wp - wd
  if (wu > 0.001) poseUpright(s, POSE_U, t, type)
  if (wp > 0.001) poseProne(s, POSE_P, t, type)
  if (wd > 0.001) poseDowned(s, POSE_D, t)
  let src = POSE_L
  if (wu >= 0.999) src = POSE_U
  else if (wp >= 0.999) src = POSE_P
  else if (wd >= 0.999) src = POSE_D
  else {
    for (let i = 0; i < N3; i += 1) {
      let v = 0
      if (wu > 0.001) v += POSE_U[i] * wu
      if (wp > 0.001) v += POSE_P[i] * wp
      if (wd > 0.001) v += POSE_D[i] * wd
      POSE_L[i] = v
    }
  }
  const c = Math.cos(s.yaw)
  const sn = Math.sin(s.yaw)
  const y0 = s.dropY
  for (let j = 0; j < JOINT_COUNT; j += 1) {
    const lx = src[j * 3]
    const lz = src[j * 3 + 2]
    out[j * 3] = s.x + lx * c + lz * sn
    out[j * 3 + 1] = src[j * 3 + 1] + y0
    out[j * 3 + 2] = s.z - lx * sn + lz * c
  }
}

// --- Joints -> part transforms ------------------------------------------------------

const BX = new Float32Array(3)
const BY = new Float32Array(3)
const BZ = new Float32Array(3)
const TY = new Float32Array(3)
const TZ = new Float32Array(3)

function sub(o, arr, a, b) {
  o[0] = arr[a * 3] - arr[b * 3]
  o[1] = arr[a * 3 + 1] - arr[b * 3 + 1]
  o[2] = arr[a * 3 + 2] - arr[b * 3 + 2]
}
function norm(o) {
  const l = Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2])
  if (l > 1e-8) {
    o[0] /= l
    o[1] /= l
    o[2] /= l
  } else {
    o[0] = 0
    o[1] = 1
    o[2] = 0
  }
}
/** a -= b * dot(a, b), then normalise (b unit). */
function orthoNorm(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  a[0] -= b[0] * d
  a[1] -= b[1] * d
  a[2] -= b[2] * d
  norm(a)
}
function cross(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1]
  const y = a[2] * b[0] - a[0] * b[2]
  const z = a[0] * b[1] - a[1] * b[0]
  o[0] = x
  o[1] = y
  o[2] = z
}

/** Quaternion from an orthonormal basis (columns X, Y, Z) into out[o+3..o+6]. */
function quatFromBasis(out, o, X, Y, Z) {
  const m00 = X[0]
  const m01 = Y[0]
  const m02 = Z[0]
  const m10 = X[1]
  const m11 = Y[1]
  const m12 = Z[1]
  const m20 = X[2]
  const m21 = Y[2]
  const m22 = Z[2]
  const tr = m00 + m11 + m22
  let x
  let y
  let z
  let w
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1)
    w = 0.25 / s
    x = (m21 - m12) * s
    y = (m02 - m20) * s
    z = (m10 - m01) * s
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }
  out[o + 3] = x
  out[o + 4] = y
  out[o + 5] = z
  out[o + 6] = w
}

/** Quaternion turning local -Y onto the unit vector d, into out[o+3..o+6]. */
function quatDownTo(out, o, dx, dy, dz) {
  // from = (0,-1,0): cross(from, d) = (-dz, 0, dx), w = 1 + dot = 1 - dy
  let x = -dz
  let y = 0
  let z = dx
  let w = 1 - dy
  if (w < 1e-6) {
    x = 0
    y = 0
    z = 1
    w = 0
  }
  const l = Math.sqrt(x * x + y * y + z * z + w * w)
  out[o + 3] = x / l
  out[o + 4] = y / l
  out[o + 5] = z / l
  out[o + 6] = w / l
}

function placeAt(out, part, arr, j, scale) {
  const o = part * TRS
  out[o] = arr[j * 3]
  out[o + 1] = arr[j * 3 + 1]
  out[o + 2] = arr[j * 3 + 2]
  out[o + 7] = scale
  return o
}

function limb(out, part, arr, a, b, scale) {
  const o = placeAt(out, part, arr, a, scale)
  let dx = arr[b * 3] - arr[a * 3]
  let dy = arr[b * 3 + 1] - arr[a * 3 + 1]
  let dz = arr[b * 3 + 2] - arr[a * 3 + 2]
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
  quatDownTo(out, o, dx / l, dy / l, dz / l)
}

/**
 * Part transforms from joints. `out` holds PART_COUNT * TRS floats. `scale` shrinks the
 * whole soldier (spawn pop). Returns nothing; the renderer copies them into instances.
 */
export function buildParts(arr, out, scale = 1) {
  // Torso basis: Y up the spine, X towards the left shoulder, Z = X x Y (chest normal).
  sub(BY, arr, J_NECK, J_PELVIS)
  norm(BY)
  sub(BX, arr, J_SH_L, J_SH_R)
  orthoNorm(BX, BY)
  cross(BZ, BX, BY)
  TY[0] = BY[0]
  TY[1] = BY[1]
  TY[2] = BY[2]
  TZ[0] = BZ[0]
  TZ[1] = BZ[1]
  TZ[2] = BZ[2]
  const pX = arr[J_PELVIS * 3]
  const pY = arr[J_PELVIS * 3 + 1]
  const pZ = arr[J_PELVIS * 3 + 2]
  let o = P_TORSO * TRS
  out[o] = pX + BY[0] * 0.35 * scale
  out[o + 1] = pY + BY[1] * 0.35 * scale
  out[o + 2] = pZ + BY[2] * 0.35 * scale
  out[o + 7] = scale
  quatFromBasis(out, o, BX, BY, BZ)
  o = P_VEST * TRS
  out[o] = pX + BY[0] * 0.37 * scale
  out[o + 1] = pY + BY[1] * 0.37 * scale
  out[o + 2] = pZ + BY[2] * 0.37 * scale
  out[o + 7] = scale
  quatFromBasis(out, o, BX, BY, BZ)

  // Pelvis: across the hips, up along the spine.
  sub(BX, arr, J_HIP_L, J_HIP_R)
  norm(BX)
  BY[0] = TY[0]
  BY[1] = TY[1]
  BY[2] = TY[2]
  orthoNorm(BY, BX)
  cross(BZ, BX, BY)
  o = P_PELVIS * TRS
  out[o] = (arr[J_HIP_L * 3] + arr[J_HIP_R * 3]) / 2 + BY[0] * 0.05 * scale
  out[o + 1] = (arr[J_HIP_L * 3 + 1] + arr[J_HIP_R * 3 + 1]) / 2 + BY[1] * 0.05 * scale
  out[o + 2] = (arr[J_HIP_L * 3 + 2] + arr[J_HIP_R * 3 + 2]) / 2 + BY[2] * 0.05 * scale
  out[o + 7] = scale
  quatFromBasis(out, o, BX, BY, BZ)

  // Head and helmet: Y from the neck, Z towards the nose.
  sub(BY, arr, J_HEAD, J_NECK)
  norm(BY)
  sub(BZ, arr, J_NOSE, J_HEAD)
  orthoNorm(BZ, BY)
  cross(BX, BY, BZ)
  o = placeAt(out, P_HEAD, arr, J_HEAD, scale)
  quatFromBasis(out, o, BX, BY, BZ)
  o = P_HELMET * TRS
  out[o] = arr[J_HEAD * 3] + BY[0] * 0.035 * scale - BZ[0] * 0.01
  out[o + 1] = arr[J_HEAD * 3 + 1] + BY[1] * 0.035 * scale - BZ[1] * 0.01
  out[o + 2] = arr[J_HEAD * 3 + 2] + BY[2] * 0.035 * scale - BZ[2] * 0.01
  out[o + 7] = scale
  quatFromBasis(out, o, BX, BY, BZ)

  // Limbs: capsules hanging from their top joint.
  limb(out, P_UARM_L, arr, J_SH_L, J_EL_L, scale)
  limb(out, P_UARM_R, arr, J_SH_R, J_EL_R, scale)
  limb(out, P_FARM_L, arr, J_EL_L, J_HA_L, scale)
  limb(out, P_FARM_R, arr, J_EL_R, J_HA_R, scale)
  limb(out, P_THIGH_L, arr, J_HIP_L, J_KN_L, scale)
  limb(out, P_THIGH_R, arr, J_HIP_R, J_KN_R, scale)
  limb(out, P_SHIN_L, arr, J_KN_L, J_FT_L, scale)
  limb(out, P_SHIN_R, arr, J_KN_R, J_FT_R, scale)

  // Boots: up the shin, toes the way the chest faces.
  for (let k = 0; k < 2; k += 1) {
    const foot = k === 0 ? J_FT_L : J_FT_R
    sub(BY, arr, k === 0 ? J_KN_L : J_KN_R, foot)
    norm(BY)
    BZ[0] = TZ[0]
    BZ[1] = TZ[1]
    BZ[2] = TZ[2]
    // A chest facing straight down the shin gives no toe direction: use the spine.
    if (Math.abs(BZ[0] * BY[0] + BZ[1] * BY[1] + BZ[2] * BY[2]) > 0.95) {
      BZ[0] = TY[0]
      BZ[1] = TY[1]
      BZ[2] = TY[2]
    }
    orthoNorm(BZ, BY)
    cross(BX, BY, BZ)
    o = placeAt(out, k === 0 ? P_BOOT_L : P_BOOT_R, arr, foot, scale)
    quatFromBasis(out, o, BX, BY, BZ)
  }

  // Hands: spheres.
  for (let k = 0; k < 2; k += 1) {
    o = placeAt(out, k === 0 ? P_HAND_L : P_HAND_R, arr, k === 0 ? J_HA_L : J_HA_R, scale)
    out[o + 3] = 0
    out[o + 4] = 0
    out[o + 5] = 0
    out[o + 6] = 1
  }

  // Weapon: along grip -> muzzle, kept upright.
  sub(BZ, arr, J_MUZZLE, J_GRIP)
  norm(BZ)
  BY[0] = 0
  BY[1] = 1
  BY[2] = 0
  if (Math.abs(BZ[1]) > 0.97) {
    BY[0] = TY[0]
    BY[1] = 0
    BY[2] = TY[2]
  }
  orthoNorm(BY, BZ)
  cross(BX, BY, BZ)
  o = placeAt(out, P_WEAPON, arr, J_GRIP, scale)
  quatFromBasis(out, o, BX, BY, BZ)
}
