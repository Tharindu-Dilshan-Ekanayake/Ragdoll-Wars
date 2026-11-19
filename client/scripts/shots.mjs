/**
 * Visual check: close-up screenshots of soldiers standing, aiming, firing, prone,
 * wounded, downed and ragdolling. `node scripts/shots.mjs [outDir]` (preview server on
 * :4173). Battle time is slowed so mid-action poses get caught.
 */
import { enterBattle, openChrome, sleep } from './cdp.mjs'

const outDir = process.argv[2] || 'shots-out'
const page = await openChrome({ url: process.env.FF_URL || 'http://localhost:4173/?debug', outDir })
const { evaluate, shot, waitFor } = page

await enterBattle(page)
await evaluate(`window.__ff.quality.getState().setLevel('HIGH', true)`)
await sleep(2500)

const cam = (o) => evaluate(`(async () => { const b = await window.__ff.battle(); Object.assign(b.view.goal, ${JSON.stringify(o)}); Object.assign(b.view, ${JSON.stringify(o)}) })()`)
const run = (code) => evaluate(`(async () => { const b = await window.__ff.battle(); const W = await window.__ff.world(); const w = b.world; ${code} })()`)

// A parade: one of each type, standing still, out of range of anyone.
await run(`
  W.clearAll(w)
  const types = ['pistol','smg','rifle','shotgun','sniper','mg']
  types.forEach((t, i) => W.spawnUnits(w, t, 0, -70, -12 + i * 2.2, 1, 'hold'))
`)
await sleep(2500)
await cam({ tx: -70, tz: -6.5, dist: 9, pitch: 0.32, yaw: 1.35 })
await sleep(1200)
await shot('10-parade')

// Firefight close-up at half speed: two lines holding behind cover, a squad attacking.
await run(`
  W.clearAll(w)
  W.spawnUnits(w, 'rifle', 0, -24, 22, 5, 'hold')
  W.spawnUnits(w, 'smg', 0, -26, 30, 4, 'attack')
  W.spawnUnits(w, 'rifle', 1, 14, 22, 5, 'hold')
  W.spawnUnits(w, 'mg', 1, 16, 30, 1, 'hold')
  W.spawnUnits(w, 'shotgun', 1, 12, 34, 3, 'attack')
  w.timeScale = 0.5
`)
await cam({ tx: -10, tz: 27, dist: 16, pitch: 0.42, yaw: 0.25 })
for (let i = 0; i < 6; i += 1) {
  await sleep(1400)
  await shot(`11-fight-${i}`)
}
// Slow motion to catch ragdolls mid-fall.
await run(`
  for (const h of [await window.__ff.hud()]) h.setState({ speed: 0.5 })
`)
await sleep(1500)
await cam({ tx: -6, tz: 27, dist: 9, pitch: 0.3, yaw: 0.6 })
for (let i = 0; i < 4; i += 1) {
  await sleep(900)
  await shot(`12-closeup-${i}`)
}
const stats = await run(`return { alive: w.stats.alive, lost: w.stats.lost, ragdolls: w.ragdolls.length, bodies: w.bodies.length }`)
console.log(JSON.stringify(stats))
const errs = page.logs.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'))
if (errs.length) console.log(errs.join('\n'))
page.close()
process.exit(0)
