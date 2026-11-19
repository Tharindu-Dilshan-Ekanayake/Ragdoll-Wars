/**
 * Phone check: portrait 390x844, Android user agent (so the game auto-picks LOW),
 * touch on, and a 4G network profile to time how long until the menu is playable.
 * `node scripts/mobile-check.mjs [outDir]` with the preview server on :4173.
 */
import { clickButton, enterBattle, openChrome, sleep } from './cdp.mjs'

const outDir = process.argv[2] || 'mobile-out'
// Start on a blank page so throttling and the user agent apply to the real load.
const page = await openChrome({ url: 'about:blank', outDir, width: 390, height: 844, mobile: true, port: 9334 })
const { send, evaluate, shot, waitFor } = page
await send('Network.enable')
await send('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
})
// "4G": ~9 Mbps down, 1.5 up, 70 ms latency. Cache off: a first visit.
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
const t0 = Date.now()
await send('Page.navigate', { url: process.env.FF_URL || 'http://localhost:4173/?debug' })
await waitFor(`!!window.__ff && window.__ff.lobbyStore.getState().ready`, 60000)
const playableMs = Date.now() - t0
// Watch the helicopter come in, then tap Skip like a player would.
await waitFor(`window.__ff.lobby.intro.t >= 2.4`, 15000)
await shot('m0-arrival')
const arrivalPerf = await evaluate(`window.__ffPerf`)
await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1, y: 1 }] })
await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await clickButton(page, 'Skip')
await waitFor(`!window.__ff.lobbyStore.getState().arriving`, 3000)
const skippedAt = await evaluate(`({ t: window.__ff.lobby.intro.t, x: window.__ff.lobby.player.x, z: window.__ff.lobby.player.z })`)
await sleep(2500)
await shot('m1-lobby')
const lobbyPerf = await evaluate(`window.__ffPerf`)
const level = await evaluate(`window.__ff.quality.getState().level`)
await evaluate(`window.__ff.lobbyStore.getState().setPanel('sandbox')`)
await sleep(600)
await shot('m1b-lobby-panel')

const t1 = Date.now()
await enterBattle(page)
const battleMs = Date.now() - t1
await sleep(1200)
await shot('m2-battle')
await clickButton(page, 'Quick battle')
await sleep(6000)
await shot('m3-fight')
// Inspect a soldier: select the first living one.
await evaluate(`(async () => { const b = await window.__ff.battle(); const c = await window.__ff.commands(); const s = b.world.slots.find(s => s.used && s.alive); if (s) c.select([s.slot]) })()`)
await sleep(600)
await shot('m4-inspect')
const perf = await evaluate(`window.__ffPerf`)
console.log(JSON.stringify({ level, playableMs, skippedAt, arrivalPerf, battleMs, lobbyPerf, perf }, null, 2))
const errs = page.logs.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'))
if (errs.length) console.log(errs.join('\n'))
page.close()
process.exit(0)
