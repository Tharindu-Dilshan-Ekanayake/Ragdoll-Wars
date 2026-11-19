import { ARRIVAL, heliPose, scriptPlayer, smooth } from '../../lobby/flightPath'
import { HELIPAD } from '../../lobby/seaFort'
import { helipadsOf } from '../sim/helipads'
import { battle } from '../state'
import { enterWalk, placeWalker } from './walkMode'

/**
 * Arriving on the battlefield: a helicopter flies you in to your side's helipad, sets
 * down, you hop out and jog a few steps towards the front, and it lifts off over the
 * field. Any key or tap skips to standing on the ground.
 *
 * It's the lobby's flight (lobby/flightPath.js) moved to the pad: that flight is written
 * round the Sea Fort's helipad, so each pose is taken relative to that pad and turned
 * so the open door faces the enemy. Plain functions over `battle.arrival`; HeliArrival.jsx
 * draws the helicopter and pads, Walker.jsx moves you and the camera.
 */

/** The flight's own pad, which every pose is measured from. */
const HX = HELIPAD.x
const HZ = HELIPAD.z

/** Team `team`'s helipad (sim/helipads.js). */
export const helipadFor = (w, team) => helipadsOf(w.map)[team]

/**
 * The flight's frame at a pad: world = pad + S * lx - F * lz for a point (lx, lz) relative
 * to the flight's pad, where F is towards the front and S = F turned left; headings turn
 * by `yaw`.
 */
function frameFor(pad, slot) {
  const fx = pad.ahead
  const fz = 0
  const sx = -fz
  const sz = fx
  // Teammates (online) step off a little apart.
  const off = (slot % 2 ? -1 : 1) * Math.ceil(slot / 2) * 1.6
  return { px: pad.x + sx * off, pz: pad.z + sz * off, fx, fz, sx, sz, yaw: Math.atan2(-fx, -fz) }
}

const toWorld = (f, o) => {
  const lx = o.x - HX
  const lz = o.z - HZ
  o.x = f.px + f.sx * lx - f.fx * lz
  o.z = f.pz + f.sz * lx - f.fz * lz
}

/** Starts the flight in for `team` (the clock waits until the scene is ready). */
export function startArrival(w, team, slot = 0) {
  const pad = helipadFor(w, team)
  const a = battle.arrival
  Object.assign(a, { running: true, scripted: true, waiting: true, skip: false, t: 0, shown: false, saluted: false, salute: 0, vy: 0, camMode: 'fixed', frame: frameFor(pad, slot), team })
  a.heli.visible = false
  const wk = battle.walk
  // Your avatar rides along: placed (so the walk camera runs) but scripted.
  placeWalker(w, pad.x, pad.z, -pad.ahead * (Math.PI / 2))
  wk.on = false
  enterWalk()
}

/** Ends the scripting and hands you the controls (on the ground at the drop point if skipped). */
export function releaseArrival(skipped) {
  const a = battle.arrival
  if (!a.scripted) return
  a.scripted = false
  const w = battle.world
  const wk = battle.walk
  if (skipped && w) {
    const p = PLAYER
    scriptPlayer(ARRIVAL.control, p, a)
    toWorld(a.frame, p)
    placeWalker(w, p.x, p.z, a.frame.yaw)
  } else {
    wk.vx = 0
    wk.vz = 0
    wk.vy = 0
    wk.speed = 0
    wk.grounded = true
  }
  // The camera behind you, looking to the front.
  Object.assign(wk.cam, { yaw: a.frame.yaw, pitch: 0.32, dist: 7 })
  wk.yaw = a.frame.yaw + Math.PI
  a.camMode = 'follow'
}

const PLAYER = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true, salute: 0 }

/**
 * Advances the flight by dt. Poses the helicopter (battle.arrival.heli) and, while you're
 * aboard or hopping off, your avatar (battle.walk) and the camera target.
 */
export function stepArrival(dt) {
  const a = battle.arrival
  if (!a.running) return
  if (a.skip) {
    a.skip = false
    if (a.scripted) {
      if (a.t < ARRIVAL.out) a.t = Math.max(a.t, ARRIVAL.skipTo)
      releaseArrival(true)
    }
  }
  if (!a.waiting) a.t += dt
  const t = a.t
  const h = a.heli
  heliPose(t, h)
  toWorld(a.frame, h)
  h.yaw += a.frame.yaw
  if (a.scripted) {
    if (t >= ARRIVAL.control) releaseArrival(false)
    else {
      const p = PLAYER
      p.salute = 0
      a.shown = scriptPlayer(t, p, a)
      toWorld(a.frame, p)
      const wk = battle.walk
      wk.x = p.x
      wk.z = p.z
      wk.y = p.y
      wk.floor = 0
      wk.yaw = p.yaw + a.frame.yaw
      wk.speed = p.speed
      wk.grounded = p.grounded
      wk.vy = a.vy || 0
      if (p.salute) a.salute = p.salute
    }
  }
  if (t >= ARRIVAL.end) a.running = false
}

/**
 * The camera while scripted: before you're out, a fixed shot from the front of the pad
 * watching the helicopter come in; then it swings round to behind you (`k` 0..1 into
 * the walk camera's usual place). Writes pos / look; returns the sweep k (or -1 fixed).
 */
export function arrivalCamera(pos, look) {
  const a = battle.arrival
  const t = a.t
  const f = a.frame
  if (t < ARRIVAL.out) {
    const k = smooth(0, ARRIVAL.out, t)
    // The lobby's shot, (-10, 1.9, -10.5) from the pad, drifting a little.
    const lx = -10 + 2.5 * k
    const lz = -10.5 + 1.5 * k
    pos.x = f.px + f.sx * lx - f.fx * lz
    pos.y = 1.9 + 0.4 * k
    pos.z = f.pz + f.sz * lx - f.fz * lz
    look.x = a.heli.x
    look.y = a.heli.y + 1.6
    look.z = a.heli.z
    return -1
  }
  return smooth(ARRIVAL.out, ARRIVAL.out + ARRIVAL.sweep, t)
}
