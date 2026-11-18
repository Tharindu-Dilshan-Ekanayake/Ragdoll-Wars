/**
 * Tiny Chrome DevTools Protocol driver for the test scripts: starts headless Chrome
 * (GPU on), opens a page and gives back evaluate / screenshot / waitFor helpers.
 * Uses only Node's built-in fetch and WebSocket - no npm packages.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export async function openChrome({ url, outDir, chrome = DEFAULT_CHROME, port = 9333, width = 1600, height = 900, mobile = false }) {
  mkdirSync(outDir, { recursive: true })
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`,
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${join(outDir, '.chrome')}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let page = null
  for (let i = 0; i < 60 && !page; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      page = list.find((t) => t.type === 'page')
    } catch {
      // still starting
    }
    if (!page) await sleep(200)
  }
  if (!page) throw new Error('Chrome did not start')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const pending = new Map()
  const logs = []
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed')
    return r.result?.result?.value
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  }
  const waitFor = async (expr, ms = 20000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await evaluate(expr).catch(() => false)) return true
      await sleep(200)
    }
    throw new Error(`timeout waiting for ${expr}`)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const t0 = Date.now()
  await send('Page.navigate', { url })
  return {
    send,
    evaluate,
    shot,
    waitFor,
    logs,
    navigatedAt: t0,
    close() {
      ws.close()
      proc.kill()
    },
  }
}

/** From the Sea Fort into a battle on the first map (opens the Sandbox station, Deploy). */
export async function enterBattle(page) {
  await page.waitFor(`!!window.__ff && window.__ff.lobbyStore.getState().ready`, 60000)
  await skipArrival(page)
  await page.evaluate(`window.__ff.lobbyStore.getState().setPanel('sandbox')`)
  await page.waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Deploy')`)
  await clickButton(page, 'Deploy')
  await page.waitFor(`!!document.querySelector('.ff-hud') && !document.querySelector('.ff-lobbyhud')`, 40000)
}

/** Skips the helicopter arrival (if it's still playing) and waits for the lobby HUD. */
export async function skipArrival(page) {
  await page.evaluate(`window.__ff.lobby.intro.skip = true`)
  await page.waitFor(`!window.__ff.lobbyStore.getState().arriving`, 5000)
}

/**
 * Replays the arrival flight from the start (the lobby's own beginArrival, minus the
 * "quicker second time" shortcut), for measuring it on each quality preset.
 */
export const replayArrival = (page) =>
  page.evaluate(`(() => {
    Object.assign(window.__ff.lobby.intro, { running: true, waiting: false, t: 0, skip: false, playerScripted: true, showPlayer: false, saluted: false, vy: 0, camera: 'fixed' })
    window.__ff.lobby.camera.snap = true
  })()`)

/** Clicks the first button whose text is `label`. */
export const clickButton = (page, label) => page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`)

export { sleep }
