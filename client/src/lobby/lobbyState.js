import { create } from 'zustand'

import { ARRIVAL } from './flightPath'
import { SPAWN } from './seaFort'

/**
 * The lobby's per-frame state (outside React: written every frame by the player
 * controller, the joystick and the camera) and its slow-moving UI state in a store
 * (which station you're standing on, which panel is open), updated by a 10 Hz ticker.
 */
/** The follow camera's resting pitch / distance, and the point on you it looks at. */
export const CAMERA_HOME = { pitch: 0.32, distance: 8.5 }
export const LOOK_HEIGHT = 1.5

export const lobby = {
  player: {
    x: SPAWN.x,
    y: 0,
    z: SPAWN.z,
    yaw: SPAWN.yaw,
    speed: 0,
    grounded: true,
    /** Ignore movement input (a panel is open). */
    frozen: false,
    /** Seconds left of the salute you give when stepping onto a pad. */
    salute: 0,
  },
  /** Touch joystick, -1..1 (+y = forward), and the jump button. */
  input: { joyX: 0, joyY: 0, jump: false },
  /** Third-person orbit. yaw 0 puts the camera south of you, looking north. */
  camera: { yaw: 0, pitch: CAMERA_HOME.pitch, distance: CAMERA_HOME.distance, snap: true },
  /**
   * The helicopter arrival (flightPath.js). `t` is flight time; it holds still while
   * `waiting` (until the first frame is up). While `playerScripted` the flight moves you
   * and the camera; `camera` is 'fixed' (the cinematic shot), 'orbit' (swinging round
   * behind you) or 'follow'.
   */
  intro: {
    running: false,
    waiting: true,
    t: 0,
    skip: false,
    playerScripted: false,
    showPlayer: true,
    saluted: false,
    vy: 0,
    camera: 'follow',
    camPos: { x: 0, y: 0, z: 0 },
    camLook: { x: 0, y: 0, z: 0 },
    from: { yaw: 0, pitch: 0, distance: 0 },
  },
}

/** Every arrival after the first in a page starts late, so coming back is quicker. */
let arrivedOnce = false

/** Starts the helicopter flight in (called as the lobby mounts). */
export function beginArrival() {
  Object.assign(lobby.intro, {
    running: true,
    waiting: true,
    t: arrivedOnce ? ARRIVAL.shortStart : 0,
    skip: false,
    playerScripted: true,
    showPlayer: false,
    saluted: false,
    vy: 0,
    camera: 'fixed',
  })
  arrivedOnce = true
  lobby.camera.snap = true
}

/** Hands you control at once (Boxity respawn); the helicopter flies on without you. */
export function endArrival() {
  const intro = lobby.intro
  if (!intro.playerScripted) return
  intro.playerScripted = false
  intro.showPlayer = true
  intro.camera = 'follow'
  if (intro.t < ARRIVAL.out) intro.t = ARRIVAL.skipTo
}

/** Back to the hub (Boxity's respawn). */
export function respawnLobby() {
  endArrival()
  Object.assign(lobby.player, { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: SPAWN.yaw, speed: 0, grounded: true })
  lobby.camera.yaw = 0
  lobby.camera.snap = true
}

export const useLobby = create((set) => ({
  /** The station whose pad you're standing on, or null. */
  zone: null,
  /** The open panel: a station id, 'settings', 'help', or null. */
  panel: null,
  /** Whether the 3D view is up (the loading cover hides until then). */
  ready: false,
  /** The arrival flight is playing (only the Skip button shows). */
  arriving: false,
  setPanel: (panel) => set({ panel }),
}))
