import { net } from '../../net/battleNet'
import { useHud } from '../hud/hudStore'
import { collideWalker, floorUnder } from '../sim/obstacles'
import { battle } from '../state'
import { releaseArrival } from './arrivalFlight'

/**
 * Walk mode: you're on the battlefield as your own Bloxity avatar from the moment it
 * loads (landed at your side's base), and walk it anywhere; the top view (the
 * commander's camera) is a button or V away, and your avatar waits where you left it. You're a spectator - no soldier sees you and no bullet hits you - but
 * the ground is real (you bump into cover, step onto low boxes, jump onto sandbags) and
 * blasts throw you about.
 *
 * The controller here is plain functions on `battle.walk` (no React, no allocation), so
 * Walker.jsx can run it every frame.
 */

export const WALK = {
  radius: 0.4,
  run: 6,
  sprint: 9.5,
  accel: 14,
  airAccel: 2.5,
  gravity: 28,
  jump: 8.5,
  /** Boxes up to this much above your feet you just step onto. */
  step: 0.5,
  /** Where the camera looks: about head height. */
  eye: 1.5,
  minDist: 2.5,
  maxDist: 18,
  minPitch: -0.1,
  maxPitch: 1.3,
}

const TAU = Math.PI * 2
const _p = { x: 0, z: 0 }

/** Puts your avatar down at (x, z) (clear of cover), the camera behind it at `camYaw`. */
export function placeWalker(w, x, z, camYaw) {
  const wk = battle.walk
  _p.x = x
  _p.z = z
  collideWalker(w.obs, _p, WALK.radius, WALK.step)
  Object.assign(wk, {
    placed: true,
    x: _p.x,
    z: _p.z,
    y: floorUnder(w.obs, _p.x, _p.z, WALK.radius, WALK.step),
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: camYaw + Math.PI,
    speed: 0,
    grounded: true,
    tumble: 0,
    spin: 0,
  })
  wk.floor = wk.y
  Object.assign(wk.cam, { yaw: camYaw, pitch: 0.32, dist: 7 })
}

/** Out walking: back to your avatar where you left it (or, first time, where you look). */
export function enterWalk() {
  const wk = battle.walk
  const w = battle.world
  if (!w || wk.on) return
  if (!wk.placed) placeWalker(w, battle.view.tx, battle.view.tz, battle.view.yaw)
  wk.on = true
  useHud.setState({ walking: true, selectMode: false })
}

/**
 * Up to the top view, starting from where the walk camera is. Your avatar stays standing
 * there (and the other players still see it).
 */
export function exitWalk() {
  const wk = battle.walk
  if (!wk.on) return
  // Still flying in: land first (the helicopter flies on without you).
  if (battle.arrival.scripted) releaseArrival(true)
  wk.on = false
  const v = battle.view
  const pitch = Math.min(1.42, Math.max(0.3, wk.cam.pitch))
  Object.assign(v, { tx: wk.x, tz: wk.z, yaw: wk.cam.yaw, pitch, dist: Math.max(6, wk.cam.dist) })
  Object.assign(v.goal, { tx: wk.x, tz: wk.z, yaw: wk.cam.yaw, pitch: 0.9, dist: 42 })
  wk.input.joyX = 0
  wk.input.joyY = 0
  wk.input.jump = false
  wk.vx = 0
  wk.vz = 0
  wk.speed = 0
  // Tell the room you've stopped (the last position stays shown).
  net.send('walk', [Math.round(wk.x * 100), Math.round(wk.y * 100), Math.round(wk.z * 100), Math.round(Math.atan2(Math.sin(wk.yaw), Math.cos(wk.yaw)) * 1000), 0, 1])
  useHud.setState({ walking: false })
}

export const toggleWalk = () => (battle.walk.on ? exitWalk() : enterWalk())

/**
 * One step of the walker. `ix` / `iz` are the stick (right / forward, relative to the
 * camera), `jump` and `sprint` are held buttons.
 */
export function stepWalker(wk, obs, ix, iz, jump, sprint, dt) {
  let tx = 0
  let tz = 0
  const n = Math.hypot(ix, iz)
  if (n > 0.02 && wk.tumble <= 0) {
    const yaw = wk.cam.yaw
    const s = Math.sin(yaw)
    const c = Math.cos(yaw)
    const sp = ((sprint ? WALK.sprint : WALK.run) * Math.min(1, n)) / n
    // Forward is away from the camera (-sin, -cos); right is (cos, -sin).
    tx = (-s * iz + c * ix) * sp
    tz = (-c * iz - s * ix) * sp
  }
  if (wk.tumble > 0) wk.tumble = Math.max(0, wk.tumble - dt)
  const rate = wk.grounded ? (wk.tumble > 0 ? 3 : WALK.accel) : WALK.airAccel
  const k = 1 - Math.exp(-rate * dt)
  wk.vx += (tx - wk.vx) * k
  wk.vz += (tz - wk.vz) * k

  _p.x = wk.x + wk.vx * dt
  _p.z = wk.z + wk.vz * dt
  collideWalker(obs, _p, WALK.radius, wk.y + WALK.step)
  // A wall stops you (no sliding off at full speed after a blast).
  wk.vx = (_p.x - wk.x) / Math.max(dt, 1e-4)
  wk.vz = (_p.z - wk.z) / Math.max(dt, 1e-4)
  wk.x = _p.x
  wk.z = _p.z

  const floor = floorUnder(obs, wk.x, wk.z, WALK.radius, wk.y + WALK.step)
  if (jump && wk.grounded && wk.tumble <= 0) {
    wk.vy = WALK.jump
    wk.grounded = false
  }
  wk.floor = floor
  wk.vy -= WALK.gravity * dt
  wk.y += wk.vy * dt
  if (wk.y <= floor) {
    wk.y = floor
    wk.vy = 0
    wk.grounded = true
  } else if (wk.y > floor + 0.05) {
    wk.grounded = false
  }

  wk.speed = Math.hypot(wk.vx, wk.vz)
  if (wk.speed > 0.4 && wk.tumble <= 0) wk.yaw = Math.atan2(wk.vx, wk.vz)

  // Thrown by a blast you somersault; on landing you right yourself.
  if (wk.tumble > 0 && !wk.grounded) wk.spin += 11 * dt
  else if (wk.spin !== 0) {
    const upright = Math.round(wk.spin / TAU) * TAU
    wk.spin += (upright - wk.spin) * (1 - Math.exp(-12 * dt))
    if (Math.abs(upright - wk.spin) < 0.01) wk.spin = 0
  }
}

/** An explosion at `e` ({ x, z, radius }): close enough, and it throws you. */
export function blastWalker(wk, e) {
  const reach = Math.max(3, e.radius * 1.8)
  const dx = wk.x - e.x
  const dz = wk.z - e.z
  const d = Math.hypot(dx, dz)
  if (d > reach) return
  const f = 1 - d / reach
  const nx = d > 0.01 ? dx / d : 0
  const nz = d > 0.01 ? dz / d : 1
  wk.vx += nx * 16 * f
  wk.vz += nz * 16 * f
  wk.vy = Math.max(wk.vy, 3 + 10 * f)
  wk.y += 0.02
  wk.grounded = false
  if (f > 0.3) wk.tumble = Math.max(wk.tumble, 0.6 + f)
}
