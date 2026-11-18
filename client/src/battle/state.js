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
