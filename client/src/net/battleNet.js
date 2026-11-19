import { environment } from '../bloxity/env'
import { GAME_SLUG } from '../bloxity/identity'
import { getBloxityState } from '../bloxity/store'
import { getSDK, safeCall, waitForSDK } from '../bloxity/sdk'
import { useApp } from '../store/app'
import { getNet, useNet } from '../store/net'

/**
 * Multiplayer connection: finds the game server, joins a battle room, and passes its
 * messages on. Snapshots go to whichever battle is listening (`net.onSnapshot`, set by
 * the battle chunk), so this file stays tiny and the start-up bundle never carries the
 * simulation or the Colyseus SDK (loaded on demand when you press a multiplayer button).
 *
 * Where the server is: `?offline` never connects; in development `?server=<url>` points
 * at one; a build with VITE_LEGION_GAME_ID (hosted on Bloxity Legion) asks Legion's
 * matchmaker; VITE_SERVER_URL connects straight to one; in development the game's own
 * server on this host (port 2567) is found by its /api/health.
 */

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
const MATCHMAKER_GIVE_UP_MS = 45_000
const DEV_PORTS = [2567]

/**
 * The battle code in whatever a friend pasted: the bare code ("8PP2A") or an invite link
 * (".../?join=8PP2A"). Upper-case, letters and digits only; '' if there's none.
 */
export function parseCode(text) {
  const raw = String(text || '').trim()
  const m = /[?&#]join=([^&#\s]+)/i.exec(raw)
  return (m ? m[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** A link that takes a friend straight into the battle with `code`. */
export function inviteLink(code) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('join', code)
  return url.toString()
}

/** The live connection's pieces the battle uses. */
export const net = {
  room: null,
  /** Set by the battle while it's up: (snapshot) => void. */
  onSnapshot: null,
  /** The newest snapshot that arrived before the battle was listening. */
  pending: null,
  online: () => Boolean(net.room),
  /** Sends a command to the server (ignored when offline). */
  send(type, payload) {
    if (net.room) net.room.send(type, payload)
  },
}

function serverTarget() {
  if (params.has('offline')) return null
  if (import.meta.env.DEV && params.get('server')) return { kind: 'direct', url: params.get('server') }
  if (import.meta.env.VITE_LEGION_GAME_ID) return { kind: 'matchmaker', gameId: import.meta.env.VITE_LEGION_GAME_ID }
  if (import.meta.env.VITE_SERVER_URL) return { kind: 'direct', url: import.meta.env.VITE_SERVER_URL }
  return import.meta.env.DEV ? { kind: 'dev' } : null
}

async function healthOf(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2500) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function findDevServer() {
  for (const port of DEV_PORTS) {
    const url = `${window.location.protocol}//${window.location.hostname}:${port}`
    const h = await healthOf(url)
    if (h?.ok && h.game === 'floppy-front') return url
  }
  return null
}

/** A signed-in Boxity player's token (the server checks it), else null for guests. */
function joinToken() {
  const auth = getSDK()?.auth
  if (!safeCall(auth?.getUser?.bind(auth))) return null
  return safeCall(auth?.getToken?.bind(auth)) || null
}

function sdkGame(method, ...args) {
  const game = getSDK()?.game
  return safeCall(game?.[method]?.bind(game), ...args)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** The endpoint to connect to, or throws with a message for the player. */
async function endpointFor(target, onWait = (message) => useNet.setState({ message })) {
  if (target.kind === 'direct') {
    if (!(await healthOf(target.url))) throw new Error('The battle server is not answering')
    return target.url
  }
  if (target.kind === 'dev') {
    const url = await findDevServer()
    if (!url) throw new Error('No battle server running (start it in server/: npm start)')
    return url
  }
  const sdk = await waitForSDK().catch(() => null)
  if (!sdk?.net?.resolveEndpoint) throw new Error('Multiplayer needs the Bloxity platform')
  const started = performance.now()
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { endpoint } = await sdk.net.resolveEndpoint(target.gameId)
      return endpoint
    } catch (err) {
      if (performance.now() - started > MATCHMAKER_GIVE_UP_MS) throw new Error('Could not reach a battle server', { cause: err })
      onWait(attempt === 0 ? 'Starting a battle server…' : 'Still connecting…')
      await wait(Math.min(8000, 1000 * 2 ** attempt))
    }
  }
}

/** A Legion relay endpoint rebuilt on the current playUrl (any other as it is). */
function withPlayHost(endpoint) {
  const match = /\/v1\/ws\/([^/?#]+)/.exec(endpoint || '')
  const play = environment()?.playUrl
  if (!match || !play) return endpoint
  return `${play.replace(/^http/i, 'ws')}/v1/ws/${match[1]}`
}

/**
 * The pod a listed room runs on, from Boxity's directory: a bare joinById could land on
 * another pod and not find it. { endpoint, mode } or null (not listed, or no directory).
 */
async function podOfRoom(target, roomId) {
  const play = environment()?.playUrl
  if (target.kind !== 'matchmaker' || !play) return null
  try {
    const res = await fetch(`${play}/v1/dir/${encodeURIComponent(target.gameId)}/list`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const { rooms } = await res.json()
    const found = (Array.isArray(rooms) ? rooms : []).find((r) => [r?.colyseusRoomId, r?.roomId, r?.id].includes(roomId))
    if (!found?.joinUrl) return null
    const mode = found.metadata?.modeName
    return { endpoint: withPlayHost(String(found.joinUrl).replace(/^http/i, 'ws')), mode: mode === 'zombies' ? 'zombies' : 'sandbox' }
  } catch {
    return null
  }
}

/**
 * The game server's endpoint for anything else that talks to it (cloud saves), or null
 * when this build has none. Throws if it can't be reached.
 */
export async function serverEndpoint() {
  const target = serverTarget()
  if (!target) return null
  return withPlayHost(await endpointFor(target, () => {}))
}

/**
 * Joins a battle. `how`:
 *   { kind: 'quick', mode }                      any open room of that mode, else a new one
 *   (each also takes `team`: 0 Blue, 1 Red, the side to start on)
 *   { kind: 'private', mode, mapId }             a new private room (shows a code)
 *   { kind: 'public', mode, mapId }              a new room listed on the game's Boxity page
 *   { kind: 'code', code }                       a friend's room by its code
 *   { kind: 'room', roomId }                     a listed room by its id (Boxity's Join button)
 * `name` is shown to the other players (a signed-in player's Boxity name wins).
 */
export async function joinBattle(how, name) {
  leaveBattle()
  const target = serverTarget()
  if (!target) {
    useNet.setState({ status: 'error', message: 'Multiplayer is not available in this build' })
    return false
  }
  useNet.setState({ status: 'connecting', message: 'Connecting…', players: [], code: null })
  try {
    const { Client } = await import('@colyseus/sdk')
    // A listed room: straight to the pod it runs on (else the usual way in).
    const pod = how.kind === 'room' ? await podOfRoom(target, how.roomId) : null
    const endpoint = pod?.endpoint || withPlayHost(await endpointFor(target))
    const client = new Client(endpoint)
    // What you wear, so the others can draw your avatar when you go walking.
    const { equipped, proportions } = getBloxityState()
    // `team`: the side you picked (0 Blue, 1 Red); without one the server balances.
    const options = { name, token: joinToken(), gameSlug: GAME_SLUG, avatar: { e: equipped || null, p: proportions }, team: how.team === 0 || how.team === 1 ? how.team : undefined }
    let room
    if (how.kind === 'code') room = await client.joinById(parseCode(how.code), options)
    else if (how.kind === 'private') room = await client.create('battle', { ...options, mode: how.mode, mapId: how.mapId, private: true })
    else if (how.kind === 'public') room = await client.create('battle', { ...options, mode: how.mode, mapId: how.mapId, listed: true })
    else if (how.kind === 'room') {
      try {
        room = await client.joinById(how.roomId, options)
      } catch {
        // Gone or full by now: the usual matchmaking, in the room's mode if we know it.
        const again = new Client(withPlayHost(await endpointFor(target)))
        room = await again.joinOrCreate('battle', { ...options, mode: pod?.mode || 'sandbox', mapId: 'training' })
      }
    } else room = await client.joinOrCreate('battle', { ...options, mode: how.mode, mapId: how.mapId || 'training' })
    attach(room)
    return true
  } catch (err) {
    console.warn('[net] join failed', err)
    const text = how.kind === 'code' || how.kind === 'room' ? 'No battle with that code (or it is full)' : err?.message || 'Could not join a battle'
    useNet.setState({ status: 'error', message: text })
    return false
  }
}

function attach(room) {
  net.room = room
  net.pending = null
  useNet.setState({ sessionId: room.sessionId })
  // Friends can be sent here (Boxity invites and presence).
  sdkGame('updateRoom', room.roomId)
  const onPageHide = () => room.leave(true)
  window.addEventListener('pagehide', onPageHide)

  room.onMessage('welcome', (w) => {
    // A private room waits for its host's Start (the waiting room, in the lobby's
    // Multiplayer popup); everything else, or a room already under way, goes straight in.
    const started = w.started !== false
    useNet.setState({ status: started ? 'online' : 'waiting', message: '', code: w.code, mode: w.mode, mapId: w.mapId })
    if (started) useApp.getState().startBattle(w.mapId, w.mode)
    net.onWelcome?.(w)
  })
  room.onMessage('start', (s) => {
    useNet.setState({ status: 'online', message: '' })
    useApp.getState().startBattle(s.mapId, s.mode)
  })
  room.onMessage('players', (list) => useNet.setState({ players: list }))
  room.onMessage('snap', (snap) => {
    if (net.onSnapshot) net.onSnapshot(snap)
    else net.pending = snap
  })
  room.onMessage('toast', (t) => net.onToast?.(t))
  room.onMessage('speed', (s) => net.onSpeed?.(s))
  room.onLeave(() => {
    window.removeEventListener('pagehide', onPageHide)
    if (net.room !== room) return
    net.room = null
    sdkGame('updateRoom', '')
    const status = getNet().status
    const wasOnline = status === 'online'
    const wasIn = wasOnline || status === 'waiting'
    useNet.setState({ status: wasIn ? 'error' : status, message: wasOnline ? 'Disconnected from the battle' : wasIn ? 'You left the room (or it closed)' : getNet().message, players: [] })
    if (wasOnline && useApp.getState().screen === 'battle') net.onDisconnect?.()
  })
}

/** The host's Start in the waiting room: everyone goes into the battle. */
export function startRoom() {
  net.send('start')
}

/** Changes your side (0 Blue, 1 Red), in the waiting room or in the battle. */
export function setRoomTeam(team) {
  net.send('team', team === 1 ? 1 : 0)
}

/** Leaves the current battle room, if any. */
export function leaveBattle() {
  const room = net.room
  net.room = null
  net.pending = null
  if (room) {
    room.leave(true)
    sdkGame('updateRoom', '')
  }
  useNet.setState({ status: 'idle', message: '', players: [], code: null })
}
