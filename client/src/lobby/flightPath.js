import { HELIPAD } from './baseCamp.js'

/**
 * The arrival flight into Base Camp (drawn and played by Arrival.jsx), as plain functions of time (seconds since the flight
 * started), so every frame is a lookup with no state to drift and Skip is just "jump to
 * time X".
 *
 *   0.0  the helicopter comes in out of the haze from the east, nose down
 *   3.6  flares over the helipad and hovers
 *   4.6  touches down
 *   4.75 you appear in the door, hop down and jog towards the camp
 *   5.0  it lifts straight off behind you, turns north and flies away over the camp
 *   6.1  you turn round and salute it
 *   7.0  you're in control (the camera has swung round behind you)
 *  14.1  it's gone over the hills
 *
 * All poses are written into objects the caller owns - nothing here allocates.
 */

export const ARRIVAL = {
  approach: 3.6,
  land: 4.6,
  out: 4.75,
  hopEnd: 5.2,
  walkEnd: 6.0,
  lift: 5.0,
  climb: 1.6,
  /** Lift-off: y = climbAccel * t^2 for `climb` seconds (fast enough to clear the camera). */
  climbAccel: 3,
  turn: 6.1,
  control: 7.0,
  /** How long the camera takes to swing from the cinematic shot to behind you. */
  sweep: 2.25,
  end: 14.1,
  /** Skip lands here: you on the ground, the helicopter already climbing away. */
  skipTo: 7.6,
  /** Coming back from a battle starts the flight late, already over the camp. */
  shortStart: 2.2,
}

/** The helicopter sits nose-west on the pad, its left door facing the camp. */
export const LANDED_YAW = -Math.PI / 2
const DEPART_YAW = -Math.PI
const HOVER_Y = 4
const WALK = 4.5
const HOP = 1.3

const hx = HELIPAD.x
const hz = HELIPAD.z
// Approach curve (cubic Bezier) ending in the hover over the pad.
const BX = [hx + 62, hx + 38, hx + 14, hx]
const BY = [24, 16, 6.5, HOVER_Y]
const BZ = [hz + 19, hz + 13, hz + 3, hz]
/** The left door, in world space once landed (local (-1.25, 0.4) turned by LANDED_YAW). */
export const DOOR = { x: hx - 0.4, z: hz - 1.25, y: 0.7 }
/** Where you end up: a few steps towards the camp from the door. */
export const DROP = { x: DOOR.x, z: DOOR.z - HOP - WALK }

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const bez = (p, u) => {
  const v = 1 - u
  return v * v * v * p[0] + 3 * v * v * u * p[1] + 3 * v * u * u * p[2] + u * u * u * p[3]
}
const bezD = (p, u) => {
  const v = 1 - u
  return 3 * v * v * (p[1] - p[0]) + 6 * v * u * (p[2] - p[1]) + 3 * u * u * (p[3] - p[2])
}

/**
 * The helicopter at time t: o.{x, y, z} (skids on y = 0 when landed), o.yaw / o.pitch /
 * o.roll (Euler 'YXZ'; positive pitch = nose down) and o.visible.
 */
export function heliPose(t, o) {
  const A = ARRIVAL
  o.visible = t < A.end
  if (t < A.approach) {
    const tau = clamp01(t / A.approach)
    const u = 1 - (1 - tau) * (1 - tau) // fast in, easing off into the hover
    o.x = bez(BX, u)
    o.y = bez(BY, u)
    o.z = bez(BZ, u)
    const heading = Math.atan2(bezD(BX, u), bezD(BZ, u))
    o.yaw = heading + (LANDED_YAW - heading) * smooth(0.55, 1, tau)
    // Nose down at speed, then a flare (nose up) to stop over the pad.
    o.pitch = 0.14 * (1 - smooth(0.25, 0.65, tau)) - 0.22 * smooth(0.5, 0.8, tau) * (1 - smooth(0.85, 1, tau))
    o.roll = -0.1 * Math.sin(Math.PI * tau)
  } else if (t < A.land) {
    const s = (t - A.approach) / (A.land - A.approach)
    o.x = hx
    o.z = hz
    o.y = HOVER_Y * (1 - smooth(0, 1, s))
    o.yaw = LANDED_YAW
    o.pitch = 0.025 * Math.sin(t * 2.3) * (1 - s)
    o.roll = 0.02 * Math.sin(t * 1.7) * (1 - s)
  } else if (t < A.lift) {
    o.x = hx
    o.y = 0
    o.z = hz
    o.yaw = LANDED_YAW
    o.pitch = 0
    o.roll = 0
  } else if (t < A.lift + A.climb) {
    // Straight up, turning to face north.
    const t1 = t - A.lift
    o.x = hx
    o.z = hz
    o.y = A.climbAccel * t1 * t1
    o.yaw = LANDED_YAW + (DEPART_YAW - LANDED_YAW) * smooth(0, A.climb, t1)
    o.pitch = 0.08 * smooth(0.6, A.climb, t1)
    o.roll = 0
  } else {
    // Off north over the camp, climbing gently (low enough to stay in view a while).
    const t2 = t - A.lift - A.climb
    const run = t2 <= 5 ? 4.5 * t2 * t2 : 112.5 + 45 * (t2 - 5)
    o.x = hx
    o.z = hz - run
    // Carries on from the lift-off's height and climb rate, easing to 1.5 m/s.
    o.y = A.climbAccel * A.climb * A.climb + 1.5 * t2 + (2 * A.climbAccel * A.climb - 1.5) * 0.8 * (1 - Math.exp(-t2 / 0.8))
    o.yaw = DEPART_YAW
    o.pitch = 0.08 + 0.14 * smooth(0, 1.5, t2)
    o.roll = 0
  }
  return o
}

/** Rotor speed in rad/s (always at flight speed: it never shuts down on the pad). */
export const ROTOR_SPEED = 28

/**
 * Your avatar while the flight is scripted: writes p.{x, y, z, yaw, speed, grounded}
 * and the salute, returns whether you're visible yet (you ride inside until the door).
 */
export function scriptPlayer(t, p, intro) {
  const A = ARRIVAL
  p.x = DOOR.x
  if (t < A.out) {
    p.y = DOOR.y
    p.z = DOOR.z
    p.yaw = Math.PI
    p.speed = 0
    p.grounded = true
    intro.vy = 0
    return false
  }
  if (t < A.hopEnd) {
    const s = (t - A.out) / (A.hopEnd - A.out)
    p.z = DOOR.z - HOP * s
    p.y = DOOR.y * (1 - s) + 2 * s * (1 - s)
    p.yaw = Math.PI
    p.speed = 2.9
    p.grounded = false
    intro.vy = (2 - 4 * s - DOOR.y) / (A.hopEnd - A.out)
    return true
  }
  p.y = 0
  p.grounded = true
  intro.vy = 0
  if (t < A.walkEnd) {
    const dur = A.walkEnd - A.hopEnd
    const s = (t - A.hopEnd) / dur
    p.z = DOOR.z - HOP - WALK * s * s * (3 - 2 * s)
    p.speed = (WALK * 6 * s * (1 - s)) / dur
    p.yaw = Math.PI
    return true
  }
  p.z = DROP.z
  p.speed = 0
  if (t >= A.turn) {
    // Turn round to watch it go, and salute.
    p.yaw = 0
    if (!intro.saluted) {
      intro.saluted = true
      p.salute = 1.6
    }
  } else {
    p.yaw = Math.PI
  }
  return true
}

/**
 * The cinematic camera before you're out: low by the gate road, drifting slowly, always
 * looking at the helicopter.
 */
export function cinematicCamera(t, heli, pos, look) {
  const k = smooth(0, ARRIVAL.out, t)
  pos.x = hx - 10 + 2.5 * k
  pos.y = 1.9 + 0.4 * k
  pos.z = hz - 10.5 + 1.5 * k
  look.x = heli.x
  look.y = heli.y + 1.6
  look.z = heli.z
}
