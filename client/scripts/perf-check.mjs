/**
 * Automated perf check + screenshots, driving a real Chrome (scripts/cdp.mjs).
 *
 *   npx vite build && npx vite preview --port 4173 &
 *   node scripts/perf-check.mjs [outDir]
 *
 * 1. Sea Fort: time to playable, the helicopter arrival played through (screenshots of
 *    each beat), then walks your avatar around and onto a station pad. Draw calls /
 *    triangles / FPS on every quality preset, both during a replayed arrival (worst case:
 *    helicopter, dust and the whole camp) and standing in the camp.
 * 2. Battle: deploys onto Training Grounds, fills both armies to the preset's cap and
 *    records the same, plus textures and simulated ragdoll bodies.
 * Numbers come from the renderer's own counters (the same ones r3f-perf shows).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { enterBattle, openChrome, replayArrival, sleep } from './cdp.mjs'

const outDir = process.argv[2] || 'perf-out'
const page = await openChrome({ url: process.env.FF_URL || 'http://localhost:4173/?debug', outDir })
const { evaluate, shot, waitFor } = page
const report = { lobby: {}, presets: {} }

const perf = () => evaluate(`window.__ffPerf`)
const setLevel = (level) => evaluate(`window.__ff.quality.getState().setLevel('${level}', true)`)
const key = (k, type) => page.send('Input.dispatchKeyEvent', { type, key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) })

async function walk(k, ms) {
  await key(k, 'keyDown')
  await sleep(ms)
  await key(k, 'keyUp')
}

// --- Sea Fort ------------------------------------------------------------------------
await waitFor(`!!window.__ff && window.__ff.lobbyStore.getState().ready`, 60000)
report.lobby.playableMs = Date.now() - page.navigatedAt
// The arrival flight, beat by beat (times are flight seconds).
const flightT = () => evaluate(`window.__ff.lobby.intro.t`)
async function shotAt(t, name) {
  await waitFor(`window.__ff.lobby.intro.t >= ${t}`, 15000)
  await shot(name)
}
await shotAt(1.6, '00a-arrival-approach')
await shotAt(3.9, '00b-arrival-flare')
await shotAt(5.15, '00c-arrival-hop-out')
await shotAt(6.4, '00d-arrival-salute')
await waitFor(`!window.__ff.lobbyStore.getState().arriving`, 15000)
report.lobby.controlAtFlightT = +(await flightT()).toFixed(2)
await sleep(400)
await shot('01-lobby-control')
await sleep(1600)
await shot('01b-lobby-heli-leaving')
await walk('w', 1400)
await sleep(300)
await shot('02-lobby-walk')
for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
  await setLevel(level)
  await sleep(3000)
  // Worst case: the arrival replayed (helicopter, shadow, dust over the camp).
  await replayArrival(page)
  let aCalls = 0
  let aTris = 0
  let aFps = 99
  for (let i = 0; i < 8; i += 1) {
    await sleep(1000)
    const p = await perf()
    aCalls = Math.max(aCalls, p.maxCalls)
    aTris = Math.max(aTris, p.maxTriangles)
    if (i > 0) aFps = Math.min(aFps, p.fps)
  }
  await waitFor(`!window.__ff.lobbyStore.getState().arriving`, 15000)
  let calls = 0
  let tris = 0
  let fps = 0
  for (let i = 0; i < 3; i += 1) {
    await sleep(1000)
    const p = await perf()
    calls = Math.max(calls, p.maxCalls)
    tris = Math.max(tris, p.maxTriangles)
    fps = p.fps
  }
  report.lobby[level] = { arrival: { maxDrawCalls: aCalls, maxTriangles: aTris, minFps: aFps }, camp: { maxDrawCalls: calls, maxTriangles: tris, fps } }
  console.log('lobby', level, JSON.stringify(report.lobby[level]))
}
// Let the replayed helicopter finish its flight before moving on.
await waitFor(`!window.__ff.lobby.intro.running`, 15000)
// Over to the armory, then onto the Sandbox pad.
await evaluate(`(() => { const p = window.__ff.lobby.player; p.x = 5; p.z = 21; window.__ff.lobby.camera.yaw = Math.PI; window.__ff.lobby.camera.snap = true })()`)
await sleep(1500)
await shot('03-lobby-armory')
await evaluate(`(() => { const p = window.__ff.lobby.player; p.x = -22.5; p.z = 0; window.__ff.lobby.camera.yaw = Math.PI / 2; window.__ff.lobby.camera.snap = true })()`)
await sleep(800)
await walk('w', 900)
await sleep(800)
await shot('04-lobby-pad-panel')
report.lobby.panelOpened = await evaluate(`window.__ff.lobbyStore.getState().panel`)
await evaluate(`window.__ff.lobbyStore.getState().setPanel(null)`)

// --- Battle ---------------------------------------------------------------------------
const t1 = Date.now()
await enterBattle(page)
report.battleMs = Date.now() - t1
await sleep(1500)

async function fill() {
  return evaluate(`(async () => {
    const b = await window.__ff.battle()
    const W = await window.__ff.world()
    const w = b.world
    W.clearAll(w)
    const types = ['rifle','rifle','smg','pistol','shotgun','rifle','mg','sniper','rocket','flame','medic','mortar']
    for (let team = 0; team < 2; team++) {
      const x = team === 0 ? -62 : 62
      for (let i = 0; i < 200; i++) {
        const r = W.spawnUnits(w, types[i % types.length], team, x + (team ? -1 : 1) * Math.floor(i / 10) * 2.6, -40 + (i % 10) * 9, 1, 'attack')
        if (!r.spawned && r.limited && r.limited.startsWith('Team')) break
      }
    }
    W.spawnUnits(w, 'mine', 0, -25, 0, 15, 'attack')
    W.spawnUnits(w, 'mine', 1, 25, 0, 15, 'attack')
    const count = (t) => w.slots.filter((s) => s.used && s.alive && s.team === t).length
    return { blue: count(0), red: count(1) }
  })()`)
}

async function measure(level, seconds) {
  await setLevel(level)
  await sleep(2500)
  const placed = await fill()
  await evaluate(`(async () => { const b = await window.__ff.battle(); Object.assign(b.view.goal, { tx: 0, tz: 4, dist: 105, pitch: 0.95, yaw: 0 }) })()`)
  let maxCalls = 0
  let maxTri = 0
  let fpsSum = 0
  let fpsN = 0
  let maxBodies = 0
  for (let s = 0; s < seconds; s += 1) {
    await sleep(1000)
    const p = await evaluate(`(async () => { const b = await window.__ff.battle(); return { perf: window.__ffPerf, bodies: b.world.ragdolls.length * 10 } })()`)
    if (!p?.perf) continue
    maxCalls = Math.max(maxCalls, p.perf.maxCalls)
    maxTri = Math.max(maxTri, p.perf.maxTriangles)
    maxBodies = Math.max(maxBodies, p.bodies)
    if (s > 0) {
      fpsSum += p.perf.fps
      fpsN += 1
    }
    if (s === 4) await shot(`05-battle-${level.toLowerCase()}-wide`)
  }
  const mem = await evaluate(`(() => {
    const gl = window.__ffGl, scene = window.__ffScene
    const seen = new Set(); let bytes = 0
    scene.traverse(o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of ms) for (const k of ['map','alphaMap']) { const t = m[k]; if (t && !seen.has(t)) { seen.add(t); const img = t.image; if (img) bytes += img.width * img.height * 4 * 1.33 } } })
    return { textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, programs: gl.info.programs.length, textureBytes: Math.round(bytes), maxTexture: Math.max(0, ...[...seen].map(t => Math.max(t.image?.width||0, t.image?.height||0))) }
  })()`)
  report.presets[level] = { placed, maxDrawCalls: maxCalls, maxTriangles: maxTri, avgFps: fpsN ? Math.round(fpsSum / fpsN) : null, maxActiveRagdollBodies: maxBodies, ...mem }
  console.log('battle', level, JSON.stringify(report.presets[level]))
}

// Close-up of the support weapons: rockets, mortars, fire, medics and a minefield.
async function showcase() {
  await setLevel('HIGH')
  await sleep(2500)
  await evaluate(`(async () => {
    const b = await window.__ff.battle()
    const W = await window.__ff.world()
    const w = b.world
    W.clearAll(w)
    const plan = [['rifle', 6], ['rocket', 3], ['flame', 3], ['medic', 3], ['mortar', 2], ['mg', 2]]
    for (let team = 0; team < 2; team++) {
      let z = -14
      for (const [type, n] of plan) { W.spawnUnits(w, type, team, team ? 20 : -20, z, n, 'attack'); z += 6 }
    }
    W.spawnUnits(w, 'mine', 1, 8, 0, 12, 'attack')
    Object.assign(b.view.goal, { tx: 0, tz: 0, dist: 46, pitch: 0.8, yaw: 0.35 })
  })()`)
  for (const t of [4, 7, 10, 14]) {
    await sleep(t === 4 ? 4000 : 3000)
    await shot(`06-support-${t}s`)
  }
  const s = await evaluate(`(async () => { const b = await window.__ff.battle(); const w = b.world; return { explosions: w.fx.explosions.head, flames: w.fx.flames.head, mines: w.ord.mines.filter((m) => m.active).length, perf: window.__ffPerf } })()`)
  report.showcase = s
  console.log('showcase', JSON.stringify(s))
}

try {
  for (const level of ['LOW', 'MEDIUM', 'HIGH']) await measure(level, 10)
  await showcase()
} catch (err) {
  console.error('perf check failed:', err.message)
  await shot('99-failure').catch(() => {})
}
report.gpu = await evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown' })()`).catch(() => 'unknown')
report.errors = page.logs.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'))
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ lobbyPlayableMs: report.lobby.playableMs, controlAtFlightT: report.lobby.controlAtFlightT, panelOpened: report.lobby.panelOpened, battleMs: report.battleMs, gpu: report.gpu }, null, 2))
if (report.errors.length) console.log('console errors:\n' + report.errors.join('\n'))
page.close()
process.exit(0)
