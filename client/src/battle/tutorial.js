import { create } from 'zustand'

import { battle } from './state'

/**
 * Zombie Horde's first-time guide, for a player's very first game (single player; the
 * browser remembers it's been done). The wave timer is held while it runs:
 *   1. climb  - after the fly-in the camera pulls back to show the wall and the stair up
 *               it; a beacon and a trail lead there. Done once you're up on the wall.
 *   2. place  - drop your first soldier on the wall beside you (the Units button pulses).
 *   3. start  - press Start wave (it pulses); the wave begins only then.
 * TutorialGuide.jsx draws the beacon and trail, Hud.jsx the banner and the highlights.
 */

const KEY = 'ff.tutorial.zombie'

function isDone() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function markDone() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Private mode: it'll show again next time.
  }
}

/** step: null (no guide), 'climb', 'place' or 'start'. */
export const useTutorial = create(() => ({ step: null }))

/**
 * The stair up the back of the rampart nearest `z`: where it starts on the ground
 * (`base`) and where it comes out on the walkway (`top`, with the walkway's height).
 */
export function stairNear(w, z) {
  const steps = w.map.obstacles.filter((o) => o.rampart === 'step')
  if (!steps.length || !w.rampart) return null
  const byZ = new Map()
  for (const o of steps) {
    const k = Math.round(o.z * 10)
    const s = byZ.get(k) || { z: o.z, x0: Infinity, x1: -Infinity }
    s.x0 = Math.min(s.x0, o.x - o.w / 2)
    s.x1 = Math.max(s.x1, o.x + o.w / 2)
    byZ.set(k, s)
  }
  let best = null
  for (const s of byZ.values()) if (!best || Math.abs(s.z - z) < Math.abs(best.z - z)) best = s
  const h = w.rampart.segs[0]?.h || 4.5
  return { base: { x: best.x0 - 1, y: 0, z: best.z }, top: { x: best.x1 + 1.2, y: h, z: best.z } }
}

/** Skip the rest of the guide (and don't show it again). */
export function skipTutorial() {
  const w = battle.world
  if (w?.zmode) w.zmode.hold = false
  markDone()
  useTutorial.setState({ step: null })
}

/**
 * Starts the guide for `world` if it's a first Zombie Horde game; returns the stop
 * function (a no-op when there's no guide).
 */
export function startZombieTutorial(world) {
  if (world.mode !== 'zombies' || !world.zmode || !world.rampart || isDone()) return () => {}
  world.zmode.hold = true
  useTutorial.setState({ step: 'climb' })
  let shown = false
  let camBack = 0
  const set = (step) => useTutorial.setState({ step })
  const id = setInterval(() => {
    if (battle.world !== world) return
    const step = useTutorial.getState().step
    if (!step) {
      clearInterval(id)
      return
    }
    // A new run (Try again) starts the timer again: keep it held while guiding.
    if (world.zmode && world.zmode.state === 'build') world.zmode.hold = true
    if (step === 'climb') {
      if (battle.arrival.scripted) return
      const wk = battle.walk
      // Out of the helicopter: pull the camera back and turn it to show the stair.
      if (!shown && wk.on) {
        shown = true
        const st = stairNear(world, wk.z)
        if (st) {
          const c = wk.cam
          const keep = { yaw: c.yaw, pitch: c.pitch, dist: c.dist }
          c.yaw = Math.atan2(wk.x - st.top.x, wk.z - st.top.z)
          c.pitch = 0.5
          c.dist = 16
          camBack = window.setTimeout(() => {
            if (Math.abs(c.dist - 16) < 0.01) Object.assign(c, { pitch: keep.pitch, dist: keep.dist })
          }, 3800)
        }
      }
      const deck = world.rampart.segs[0]?.h || 4.5
      if (wk.on && wk.y > deck - 0.8) set('place')
    } else if (step === 'place') {
      if (world.teamLiving[0].length > 0) set('start')
    } else if (step === 'start') {
      // Still held: the wave begins when you press the button, not on a timer.
      if (world.zmode.state === 'wave') {
        world.zmode.hold = false
        markDone()
        set(null)
      }
    }
  }, 200)
  return () => {
    clearInterval(id)
    window.clearTimeout(camBack)
    if (world.zmode) world.zmode.hold = false
    useTutorial.setState({ step: null })
  }
}
