/**
 * Your avatar's body language in the lobby, shared by the Bloxity avatar and the blocky
 * stand-in so both move the same way.
 *
 * `computePose` turns the motion state into joint angles; each avatar applies them to its
 * own limbs. Angles are radians in character space (the character faces +Z, its left side
 * is +X), about each joint's pivot:
 *   swing - about X: negative swings a hanging limb forward (arm up in front, knee up);
 *           on the spine and neck, which point up, negative bends them back
 *   sway  - about Z: positive moves a limb towards +X
 *   twist - about Y: positive turns the right shoulder forward
 * `lift` raises (or lowers) the body, in metres. `stretchL` / `stretchR` stay 1.
 */

export const POSED_BONES = ['Spine1', 'Neck1', 'ArmL1', 'ArmL2', 'ArmR1', 'ArmR2', 'LegL1', 'LegL2', 'LegR1', 'LegR2']

/** Written by `computePose` every frame; one shared result, never reallocated. */
export const pose = {
  lift: 0,
  stretchL: 1,
  stretchR: 1,
  bones: Object.fromEntries(POSED_BONES.map((name) => [name, { swing: 0, sway: 0, twist: 0 }])),
}

/** The 1.8 m character's measurements (shoulder height/offset, arm length, middle). */
export const BODY = { shoulderY: 1.35, shoulderX: 0.56, arm: 0.63, pivot: 0.9 }

const OUT_L = 1
const OUT_R = -1

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function add(name, swing, sway, twist, w) {
  const b = pose.bones[name]
  b.swing += swing * w
  b.sway += sway * w
  b.twist += twist * w
}

/** Standing at ease: knees soft, breathing, arms loose at the sides. */
function stance(w, time) {
  const breath = Math.sin(time * 1.8)
  add('LegL1', -0.04, 0.06 * OUT_L, 0, w)
  add('LegL2', 0.08, 0, 0, w)
  add('LegR1', 0.04, 0.06 * OUT_R, 0, w)
  add('LegR2', 0.08, 0, 0, w)
  add('Spine1', 0.03 + breath * 0.015, 0, 0, w)
  add('Neck1', 0.04, 0, 0, w)
  add('ArmL1', 0.04 + breath * 0.02, 0.1 * OUT_L, 0, w)
  add('ArmL2', -0.18, 0, 0, w)
  add('ArmR1', 0.04 + breath * 0.02, 0.1 * OUT_R, 0, w)
  add('ArmR2', -0.18, 0, 0, w)
  pose.lift += (-0.01 + breath * 0.006) * w
}

/** Walk to run: legs swing, the body bobs once per step, arms swing against the legs. */
function stride(phase, ratio) {
  const cycle = Math.sin(phase)
  const leg = 0.85 * ratio
  add('LegL1', cycle * leg, 0, 0, 1)
  add('LegR1', -cycle * leg, 0, 0, 1)
  // Knees fold on the back swing only.
  add('LegL2', Math.max(0, -cycle) * 1.1 * ratio, 0, 0, 1)
  add('LegR2', Math.max(0, cycle) * 1.1 * ratio, 0, 0, 1)
  add('Spine1', (0.06 + 0.1 * ratio) * ratio, 0, cycle * 0.12 * ratio, 1)
  add('ArmL1', -cycle * 0.75 * ratio, 0.06 * OUT_L, 0, 1)
  add('ArmL2', -0.35 * ratio, 0, 0, 1)
  add('ArmR1', cycle * 0.75 * ratio, 0.06 * OUT_R, 0, 1)
  add('ArmR2', -0.35 * ratio, 0, 0, 1)
  pose.lift += (Math.abs(Math.cos(phase)) * 0.05 - 0.015) * ratio
}

/** In the air: a knee up on the way up; falling, the legs reach down. */
function airborne(vy) {
  const f = smooth(0, 1, clamp01((2 - vy) / 9))
  add('LegL1', lerp(-1.3, -0.35, f), 0.08 * OUT_L, 0, 1)
  add('LegL2', lerp(1.6, 0.25, f), 0, 0, 1)
  add('LegR1', lerp(0.25, -0.1, f), 0.08 * OUT_R, 0, 1)
  add('LegR2', lerp(0.5, 0.2, f), 0, 0, 1)
  add('Spine1', lerp(0.15, -0.06, f), 0, 0, 1)
  add('ArmL1', -2.4, 0.35 * OUT_L, 0, 1)
  add('ArmR1', -2.2, 0.35 * OUT_R, 0, 1)
  add('ArmR2', -0.4, 0, 0, 1)
}

/** A salute (when you step onto a station's pad). */
function saluting(time, w) {
  add('ArmR1', -2.5, 0.55 * OUT_R, 0.3, w)
  add('ArmR2', -1.9, 0, 0, w)
  add('ArmL1', 0.02, 0.06 * OUT_L, 0, w)
  add('ArmL2', -0.05, 0, 0, w)
  add('Spine1', -0.04, 0, 0, w)
  add('Neck1', -0.05 + Math.sin(time * 2) * 0.01, 0, 0, w)
  add('LegL1', 0, 0.02 * OUT_L, 0, w)
  add('LegR1', 0, 0.02 * OUT_R, 0, w)
}

/**
 * @param {{ time?: number, speed?: number, maxSpeed?: number, grounded?: boolean,
 *   vy?: number, stride?: number, salute?: number, emote?: string|null }} motion
 *   `salute` (0-1) blends in a salute. `emote` (a Boxity emote id or null) isn't posed
 *   here: the Bloxity avatar blends the emote clip on top (avatarRig.updateEmote).
 */
export function computePose(motion) {
  const { time = 0, speed = 0, maxSpeed = 6, grounded = true, vy = 0, stride: phase = time * 5, salute = 0 } = motion
  for (const name of POSED_BONES) {
    const b = pose.bones[name]
    b.swing = 0
    b.sway = 0
    b.twist = 0
  }
  pose.lift = 0
  pose.stretchL = 1
  pose.stretchR = 1

  const ratio = grounded ? clamp01(speed / Math.max(maxSpeed, 0.001)) : 0
  if (!grounded) {
    airborne(vy)
    return pose
  }
  const still = 1 - smooth(0.05, 0.4, ratio)
  const sal = salute * still
  stance(still * (1 - sal), time)
  if (sal > 0) saluting(time, sal)
  if (ratio > 0.02) stride(phase, ratio)
  return pose
}
