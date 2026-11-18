import { useQuality } from '../store/quality'
import { useSettings } from '../store/settings'

/**
 * Floppy Front's sound: everything synthesised with Web Audio at runtime, no sound
 * files to download.
 *
 * - Gunshots per weapon: a filtered noise crack, a low thump for punch, and for the
 *   sniper a long echo. Distance muffles (low-pass) and quietens them, and they pan
 *   left/right around the camera.
 * - Bullet impacts, body hits, ragdoll thuds, reload clicks, the drop-in whoosh.
 * - UI clicks and blips; a soft wind bed during battles.
 *
 * The audio context is created on the first tap/click/key (browsers block it before),
 * and voices are capped so a 200-soldier firefight can't flood the mixer.
 */

let ctx = null
let master = null
let sfxBus = null
let ambBus = null
let noiseBuf = null
let windNode = null
let masterVolume = 1
let musicVolume = 1
let adMuted = false
let activeShots = 0
let shotsThisFrame = 0
let lastFrame = 0
const MAX_SHOT_VOICES = 14
const MAX_SHOTS_PER_FRAME = 5

/**
 * Sounds per second of audio time, as token buckets: shots, and the small stuff
 * (impacts, hits, thuds, clicks, flames, heals...). A firefight heard from inside it -
 * walk mode, or a close camera - otherwise asks for hundreds of voices a second, and
 * building Web Audio nodes that fast is what costs (far more than the battle). Booms,
 * groans, horns and jets always play. Very close sounds skip the queue.
 */
const shotBudget = { rate: 22, tokens: 22, at: 0 }
const minorBudget = { rate: 18, tokens: 18, at: 0 }
const CLOSE = 5
function spend(b, dist) {
  const t = ctx.currentTime
  // The LOW preset (phones, small laptops) gets fewer voices.
  const rate = useQuality.getState().level === 'LOW' ? b.rate * 0.6 : b.rate
  b.tokens = Math.min(rate, b.tokens + (t - b.at) * rate)
  b.at = t
  if (b.tokens >= 1) {
    b.tokens -= 1
    return true
  }
  // Right beside you it still plays, borrowing a little against the next second.
  if (dist < CLOSE && b.tokens > -6) {
    b.tokens -= 1
    return true
  }
  return false
}
const MINOR = new Set(['impact', 'hit', 'thud', 'reload', 'build', 'launch', 'mortar', 'flame', 'heal', 'spawn'])

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 12
  comp.ratio.value = 5
  comp.attack.value = 0.003
  comp.release.value = 0.2
  master = ctx.createGain()
  master.connect(comp)
  comp.connect(ctx.destination)
  sfxBus = ctx.createGain()
  sfxBus.connect(master)
  ambBus = ctx.createGain()
  ambBus.connect(master)
  // Two seconds of white noise, shared by every voice.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1
  applyVolume()
  return ctx
}

function applyVolume() {
  if (!master) return
  const v = adMuted ? 0 : masterVolume * useSettings.getState().volume
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
  ambBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.05)
}

useSettings.subscribe((s, prev) => {
  if (s.volume !== prev.volume) applyVolume()
})

/** Unlocks audio on the first interaction (browsers require a user gesture). */
export function installAudioUnlock() {
  const unlock = () => {
    const c = ensure()
    if (c && c.state === 'suspended') c.resume()
    if (c && c.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export function setMasterVolume(v) {
  masterVolume = v
  applyVolume()
}
export function setMusicVolume(v) {
  musicVolume = v
  applyVolume()
}
export function setAdBreakMuted(on) {
  adMuted = on
  applyVolume()
}

const ready = () => ctx && ctx.state === 'running'

// --- Building blocks --------------------------------------------------------------------

/** A burst of filtered noise. */
function noise(dest, t, { type = 'bandpass', freq = 1500, q = 0.8, gain = 1, attack = 0.002, decay = 0.1, sweepTo = 0 }) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.playbackRate.value = 0.9 + Math.random() * 0.2
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay)
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  src.connect(f)
  f.connect(g)
  g.connect(dest)
  src.start(t, Math.random() * 1.5)
  src.stop(t + attack + decay + 0.05)
  return src
}

/** A falling sine: the low punch of a shot or a thud. */
function thump(dest, t, { from = 120, to = 45, gain = 0.6, decay = 0.1 }) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + decay)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  o.connect(g)
  g.connect(dest)
  o.start(t)
  o.stop(t + decay + 0.05)
  return o
}

function tone(dest, t, freq, decay, gain = 0.2, type = 'triangle', to = 0) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  o.connect(g)
  g.connect(dest)
  o.start(t)
  o.stop(t + decay + 0.05)
}

/**
 * A positioned voice chain: gain (distance) -> low-pass (muffle) -> pan -> bus.
 * Returns its input node, or null when it would be inaudible.
 */
function spatial(dist, pan, baseGain) {
  const gain = baseGain / (1 + Math.pow(dist / 20, 1.35))
  if (gain < 0.012) return null
  const g = ctx.createGain()
  g.gain.value = gain
  // Distance muffling; close by it would sit above 10 kHz and change nothing, so the
  // filter (the priciest node to make) is left out.
  let out = g
  if (dist > 12) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 16000 / (1 + dist / 22)
    g.connect(lp)
    out = lp
  }
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (p) {
    p.pan.value = Math.max(-1, Math.min(1, pan))
    out.connect(p)
    p.connect(sfxBus)
  } else out.connect(sfxBus)
  return g
}

// Gunshot recipes per weapon key.
const SHOTS = {
  // Vehicle guns.
  cannon: { vol: 1.2, crack: { type: 'lowpass', freq: 900, q: 0.5, decay: 0.35 }, punch: { from: 75, to: 26, gain: 1.1, decay: 0.3 }, echo: true },
  autocannon: { vol: 0.85, crack: { freq: 1100, q: 0.7, decay: 0.12 }, punch: { from: 100, to: 40, gain: 0.8, decay: 0.12 } },
  pistol: { vol: 0.55, crack: { freq: 2100, q: 0.9, decay: 0.08 }, punch: { from: 140, to: 55, gain: 0.45, decay: 0.07 } },
  smg: { vol: 0.5, crack: { freq: 2500, q: 1.1, decay: 0.06 }, punch: { from: 150, to: 60, gain: 0.35, decay: 0.06 } },
  rifle: { vol: 0.75, crack: { freq: 1600, q: 0.7, decay: 0.12 }, punch: { from: 110, to: 42, gain: 0.6, decay: 0.1 }, snap: true },
  shotgun: { vol: 0.95, crack: { type: 'lowpass', freq: 1100, q: 0.5, decay: 0.24 }, punch: { from: 85, to: 30, gain: 0.9, decay: 0.17 } },
  sniper: { vol: 1, crack: { freq: 1300, q: 0.6, decay: 0.22 }, punch: { from: 95, to: 34, gain: 0.8, decay: 0.16 }, snap: true, echo: true },
  mg: { vol: 0.8, crack: { freq: 1300, q: 0.8, decay: 0.11 }, punch: { from: 95, to: 38, gain: 0.7, decay: 0.11 } },
}

function playShot(key, dist, pan) {
  const r = SHOTS[key] || SHOTS.rifle
  if (activeShots >= MAX_SHOT_VOICES || shotsThisFrame >= MAX_SHOTS_PER_FRAME) {
    // Over budget: only close shots get through.
    if (dist > 12) return
  }
  if (!spend(shotBudget, dist)) return
  const dest = spatial(dist, pan, r.vol)
  if (!dest) return
  shotsThisFrame += 1
  activeShots += 1
  const t = ctx.currentTime
  const src = noise(dest, t, { ...r.crack, gain: 1 })
  thump(dest, t, r.punch)
  if (r.snap && dist < 40) noise(dest, t, { type: 'highpass', freq: 4200, q: 0.5, gain: 0.5, decay: 0.025 })
  if (r.echo) noise(dest, t + 0.16, { type: 'lowpass', freq: 700, q: 0.4, gain: 0.35, attack: 0.05, decay: 0.7 })
  src.onended = () => {
    activeShots = Math.max(0, activeShots - 1)
  }
}

// --- World sounds -----------------------------------------------------------------------

/**
 * Plays a battle sound at (x, y, z) heard from `listener` ({ x, y, z, rx, rz } where
 * rx/rz is the camera's right vector on the ground). Called by the battle's audio
 * bridge for each sound event.
 */
export function worldSound(kind, x, y, z, meta, listener) {
  if (!ready()) return
  const now = performance.now()
  if (now !== lastFrame) {
    lastFrame = now
    shotsThisFrame = 0
  }
  const dx = x - listener.x
  const dy = y - listener.y
  const dz = z - listener.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const pan = ((dx * listener.rx + dz * listener.rz) / (dist + 6)) * 1.4
  if (MINOR.has(kind) && !spend(minorBudget, dist)) return
  const t = ctx.currentTime
  if (kind === 'shot') {
    playShot(meta, dist, pan)
  } else if (kind === 'impact') {
    if (dist > 35) return
    const dest = spatial(dist, pan, 0.25)
    if (!dest) return
    noise(dest, t, meta === 2 ? { freq: 3400, q: 1.5, decay: 0.035, gain: 1 } : { type: 'lowpass', freq: 900, q: 0.6, decay: 0.05, gain: 1 })
  } else if (kind === 'hit') {
    if (dist > 45) return
    const dest = spatial(dist, pan, 0.5)
    if (!dest) return
    noise(dest, t, { type: 'lowpass', freq: 650, q: 0.8, decay: 0.07, gain: 1 })
    thump(dest, t, { from: 90, to: 50, gain: 0.5, decay: 0.08 })
  } else if (kind === 'thud') {
    if (dist > 50) return
    const dest = spatial(dist, pan, 0.55)
    if (!dest) return
    thump(dest, t, { from: 70, to: 35, gain: 0.8, decay: 0.14 })
    noise(dest, t, { type: 'lowpass', freq: 400, q: 0.5, decay: 0.12, gain: 0.7 })
  } else if (kind === 'reload') {
    if (dist > 22) return
    const dest = spatial(dist, pan, 0.22)
    if (!dest) return
    noise(dest, t, { type: 'highpass', freq: 3000, q: 2, decay: 0.02, gain: 1 })
    noise(dest, t + 0.35, { type: 'highpass', freq: 2500, q: 2, decay: 0.025, gain: 1 })
  } else if (kind === 'boom') {
    // Explosions: a deep thump, a long rumble, and a sharp crack when close.
    const r = meta || 4
    const dest = spatial(dist, pan, 1.6 + r * 0.15)
    if (!dest) return
    thump(dest, t, { from: 110, to: 28, gain: 1.2, decay: 0.45 })
    noise(dest, t, { type: 'lowpass', freq: 1400, q: 0.5, gain: 1.1, attack: 0.004, decay: 1.1, sweepTo: 160 })
    if (dist < 45) noise(dest, t, { type: 'highpass', freq: 2200, q: 0.5, gain: 0.5, decay: 0.08 })
    noise(dest, t + 0.18, { type: 'lowpass', freq: 380, q: 0.4, gain: 0.45, attack: 0.08, decay: 1.4 })
  } else if (kind === 'groan') {
    // A zombie's moan: a low, wobbling, filtered buzz (deeper for big ones).
    const size = meta || 1
    const dest = spatial(dist, pan, 0.28 * Math.min(2, size))
    if (!dest) return
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f = (95 + Math.random() * 40) / size
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 0.7, t + 0.9)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.15)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0)
    o.connect(lp)
    lp.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + 1.05)
  } else if (kind === 'horn') {
    // The wave alarm: two long horn blasts, heard everywhere.
    for (const at of [0, 0.75]) {
      tone(sfxBus, t + at, 220, 0.6, 0.18, 'sawtooth', 200)
      tone(sfxBus, t + at, 330, 0.6, 0.1, 'square', 300)
    }
  } else if (kind === 'breach') {
    tone(sfxBus, t, 180, 0.25, 0.16, 'square', 120)
  } else if (kind === 'build') {
    const dest = spatial(dist, pan, 0.5)
    if (!dest) return
    thump(dest, t, { from: 160, to: 70, gain: 0.5, decay: 0.08 })
    noise(dest, t + 0.03, { type: 'lowpass', freq: 900, q: 0.5, decay: 0.15, gain: 0.5 })
  } else if (kind === 'jet') {
    // A jet screaming over: a rising roar that sweeps past.
    const dest = spatial(Math.max(20, dist * 0.6), pan, 1.1)
    if (!dest) return
    noise(dest, t, { type: 'bandpass', freq: 500, q: 0.6, attack: 1.2, decay: 2.2, gain: 1, sweepTo: 1800 })
    noise(dest, t + 1.0, { type: 'lowpass', freq: 600, q: 0.4, attack: 0.3, decay: 1.6, gain: 0.8 })
  } else if (kind === 'launch') {
    const dest = spatial(dist, pan, 0.8)
    if (!dest) return
    thump(dest, t, { from: 140, to: 60, gain: 0.6, decay: 0.12 })
    noise(dest, t, { freq: 1600, q: 0.7, attack: 0.01, decay: 0.55, gain: 0.9, sweepTo: 450 })
  } else if (kind === 'mortar') {
    const dest = spatial(dist, pan, 0.75)
    if (!dest) return
    thump(dest, t, { from: 95, to: 38, gain: 0.9, decay: 0.2 })
    noise(dest, t, { type: 'lowpass', freq: 800, q: 0.6, decay: 0.25, gain: 0.7 })
  } else if (kind === 'flame') {
    const dest = spatial(dist, pan, 0.4)
    if (!dest) return
    noise(dest, t, { type: 'bandpass', freq: 650, q: 0.5, attack: 0.03, decay: 0.32, gain: 1 })
  } else if (kind === 'heal') {
    const dest = spatial(dist, pan, 0.35)
    if (!dest) return
    tone(dest, t, 880, 0.18, 0.25, 'sine', 990)
    tone(dest, t + 0.1, 1320, 0.22, 0.2, 'sine')
  } else if (kind === 'spawn') {
    const dest = spatial(dist, pan, 0.45)
    if (!dest) return
    noise(dest, t, { freq: 900, q: 1.2, attack: 0.06, decay: 0.25, gain: 0.8, sweepTo: 260 })
    thump(dest, t + 0.28, { from: 80, to: 40, gain: 0.5, decay: 0.12 })
  }
}

// --- Ambience ---------------------------------------------------------------------------

/** A soft wind bed under the battle. */
export function startAmbience() {
  if (!ensure() || windNode) return
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 380
  const g = ctx.createGain()
  g.gain.value = 0.05
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.09
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.025
  lfo.connect(lfoGain)
  lfoGain.connect(g.gain)
  src.connect(lp)
  lp.connect(g)
  g.connect(ambBus)
  src.start()
  lfo.start()
  windNode = { src, lfo }
}

export function stopAmbience() {
  if (!windNode) return
  try {
    windNode.src.stop()
    windNode.lfo.stop()
  } catch {
    // Already stopped.
  }
  windNode = null
}

// --- Helicopter -------------------------------------------------------------------------

/** Whether sound can play yet (the context only starts on the first tap or key). */
export const audioReady = () => Boolean(ready())

/**
 * A looping helicopter: low noise chopped by the blades ("whop-whop", a sawtooth on its
 * gain) plus a faint turbine whine. Returns { update(dist, pan), stop() } or null when
 * audio isn't unlocked yet.
 */
export function startRotorSound() {
  if (!ready()) return null
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const body = ctx.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = 520
  body.Q.value = 0.7
  const chop = ctx.createGain()
  chop.gain.value = 0.55
  const blades = ctx.createOscillator()
  blades.type = 'sawtooth'
  blades.frequency.value = 11
  const depth = ctx.createGain()
  depth.gain.value = 0.45
  blades.connect(depth)
  depth.connect(chop.gain)
  const whine = ctx.createOscillator()
  whine.type = 'triangle'
  whine.frequency.value = 1750
  const whineGain = ctx.createGain()
  whineGain.gain.value = 0.012
  whine.connect(whineGain)
  const out = ctx.createGain()
  out.gain.value = 0
  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = 6000
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  src.connect(body)
  body.connect(chop)
  chop.connect(out)
  whineGain.connect(out)
  out.connect(muffle)
  if (panner) {
    muffle.connect(panner)
    panner.connect(sfxBus)
  } else muffle.connect(sfxBus)
  src.start()
  blades.start()
  whine.start()
  let stopped = false
  return {
    update(dist, pan) {
      if (stopped) return
      const t = ctx.currentTime
      out.gain.setTargetAtTime(1.1 / (1 + Math.pow(dist / 22, 1.3)), t, 0.12)
      muffle.frequency.setTargetAtTime(14000 / (1 + dist / 30), t, 0.12)
      if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.12)
    },
    stop() {
      if (stopped) return
      stopped = true
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
      setTimeout(() => {
        try {
          src.stop()
          blades.stop()
          whine.stop()
        } catch {
          // Already stopped.
        }
        out.disconnect()
      }, 900)
    },
  }
}

// --- UI ---------------------------------------------------------------------------------

function ui(fn) {
  if (!ready()) return
  fn(ctx.currentTime)
}

export const sfx = {
  click: () => ui((t) => tone(sfxBus, t, 660, 0.06, 0.12, 'triangle', 520)),
  toggle: () => ui((t) => tone(sfxBus, t, 520, 0.07, 0.12, 'square', 700)),
  select: () => ui((t) => tone(sfxBus, t, 880, 0.08, 0.1, 'sine', 1180)),
  order: () =>
    ui((t) => {
      tone(sfxBus, t, 600, 0.06, 0.12, 'triangle')
      tone(sfxBus, t + 0.07, 900, 0.08, 0.12, 'triangle')
    }),
  place: () => ui((t) => tone(sfxBus, t, 300, 0.12, 0.16, 'sine', 180)),
  remove: () => ui((t) => noise(sfxBus, t, { freq: 600, q: 0.8, decay: 0.2, gain: 0.4, sweepTo: 150 })),
  error: () =>
    ui((t) => {
      tone(sfxBus, t, 220, 0.12, 0.15, 'square')
      tone(sfxBus, t + 0.12, 180, 0.16, 0.15, 'square')
    }),
}
