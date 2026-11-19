/**
 * Mutable per-frame battle state shared by the canvas, the input layer and the HUD.
 *
 * Deliberately outside React: it changes every frame and nothing should re-render
 * because of it. The HUD reads slow-changing summaries through its 10 Hz ticker
 * (hud/hudTicker.js); everything else reads it from frame hooks or input handlers.
 */
export const battle = {
  /** The simulation (sim/world.js), or null outside a battle. */
  world: null,
  /** The three.js camera, set by the camera rig. */
  camera: null,
  /** The canvas element pointer input is read from. */
  canvas: null,

  /** RTS camera: orbit target on the ground, yaw/pitch/distance, with goals to ease to. */
  view: {
    tx: 0,
    tz: 8,
    yaw: 0,
    pitch: 0.92,
    dist: 78,
    goal: { tx: 0, tz: 8, yaw: 0, pitch: 0.92, dist: 78 },
    /** Keys held for panning/rotating. */
    keys: new Set(),
  },

  /**
   * Walk mode (walk/Walker.jsx): you, as your Bloxity avatar, on foot among the troops.
   * A spectator - the battle can't see or hurt you, but blasts still knock you about.
   * `cam` is the third-person orbit (yaw 0: camera south of you, looking north).
   */
  /**
   * Flying in at the start of a battle (walk/arrivalFlight.js): the clock, whether your
   * avatar is still scripted, the helicopter's pose, the pad's frame.
   */
  arrival: {
    running: false,
    scripted: false,
    waiting: false,
    skip: false,
    t: 0,
    shown: false,
    camMode: 'follow',
    frame: null,
    team: 0,
    vy: 0,
    saluted: false,
    salute: 0,
    heli: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, visible: false },
  },

  walk: {
    /** Walking (camera behind you) vs the top view; `placed`: your avatar is on the map. */
    on: false,
    placed: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    speed: 0,
    grounded: true,
    /** The floor under you (0, or the top of the box you're over). */
    floor: 0,
    /** Seconds of tumble left after a blast threw you, and the somersault angle. */
    tumble: 0,
    spin: 0,
    cam: { yaw: 0, pitch: 0.32, dist: 7 },
    /** Touch joystick (-1..1, +y forward) and jump button. */
    input: { joyX: 0, joyY: 0, jump: false },
  },

  /** Ground point under the pointer (for the placement ghost), or null. */
  hover: null,
  /** Last move order, for the destination marker: { x, z, t } (t = performance time). */
  moveMarker: null,
}

/** Phases for frame hooks: input and camera, then the simulation, then drawing. */
export const PHASE = { CAMERA: 0, SIM: 1, DRAW: 2, AFTER: 3 }

const hooks = []

/** Registers fn(state, delta) to run every frame in `phase`. Returns the unregister. */
export function addFrameHook(phase, fn) {
  const hook = { phase, fn }
  hooks.push(hook)
  hooks.sort((a, b) => a.phase - b.phase)
  return () => {
    const i = hooks.indexOf(hook)
    if (i >= 0) hooks.splice(i, 1)
  }
}

/** Runs every hook in phase order (called from the one useFrame in BattleScene). */
export function runFrameHooks(state, delta) {
  for (let i = 0; i < hooks.length; i += 1) hooks[i].fn(state, delta)
}
