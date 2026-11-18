import { create } from 'zustand'

import { GAME_SLUG } from '../bloxity/identity'
import { getSDK, safeCall } from '../bloxity/sdk'
import { getBloxityState, useBloxityStore } from '../bloxity/store'
import { aheadOf, cleanSave, leaderboardScores, normalizeProfile } from '../shared/profile'
import { useApp } from '../store/app'
import { BATTLE_MIN_SECONDS, progressProfile, useProgress } from '../store/progress'
import { useSaves } from '../store/saves'
import { serverEndpoint } from './battleNet'

/**
 * Cloud saves and leaderboards, through the game server's 'profile' room
 * (server/src/rooms/ProfileRoom.js).
 *
 * A signed-in player's progress and sandbox saves are loaded from the cloud when they
 * sign in and merged into this device's (store/progress.js, store/saves.js - merging
 * never loses anything), then anything new here is sent up: a finished Zombie Horde run
 * or a new save within seconds, playtime every couple of minutes. The room is opened
 * only when there's something to do and left after a quiet spell, so an idle player
 * keeps no server busy. Guests keep everything on this device, as before, and can still
 * look at the leaderboards.
 *
 * Also counts the totals the boards rank: seconds played (while the page is visible)
 * and battles fought (ones that lasted BATTLE_MIN_SECONDS).
 *
 * `?cloudDev=dev-name` stands in for an account against a server off Boxity hosting
 * (the server ignores it anywhere else), for testing.
 */

/** 'off' (no server in this build) | 'guest' | 'connecting' | 'synced' | 'saving' | 'error' */
export const useCloud = create(() => ({ status: 'guest', message: '', boards: null, boardsLoading: false, boardsError: '' }))

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
const DEV_ID = /^dev-[\w-]{1,40}$/.test(params.get('cloudDev') || '') ? params.get('cloudDev') : null
const IDLE_MS = 45_000
const PUSH_MS = 2500
const PLAYTIME_PUSH_MS = 120_000
const PLAYTIME_TICK_S = 15

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let room = null
let connecting = null
/** The cloud's copy of the profile, as last heard. */
let cloud = null
let idleTimer = null
let pushTimer = null
let pushAt = 0
/** What's been sent and not yet confirmed: 'progress' JSON, save 'id:savedAt', 'del:id'. */
const inflight = new Set()
/** Board -> score last submitted through the SDK this session. */
const submitted = {}

/** Who we save for: a signed-in player's token, a dev id, or null (guest). */
function account() {
  const user = getBloxityState().user
  if (user) {
    const auth = getSDK()?.auth
    const token = safeCall(auth?.getToken?.bind(auth))
    if (token) return { token, name: user.displayName || user.username || 'Commander', real: true }
  }
  if (DEV_ID) return { devId: DEV_ID, name: 'Dev Commander', real: false }
  return null
}

async function openRoom(options) {
  const endpoint = await serverEndpoint()
  if (!endpoint) {
    useCloud.setState({ status: 'off' })
    return null
  }
  const { Client } = await import('@colyseus/sdk')
  return new Client(endpoint).create('profile', { gameSlug: GAME_SLUG, ...options })
}

function touch() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const r = room
    room = null
    inflight.clear()
    r?.leave(true)
  }, IDLE_MS)
}

/** The open profile room (opening it, and loading the profile, if needed), or null. */
function ensureRoom() {
  if (room) {
    touch()
    return Promise.resolve(room)
  }
  if (connecting) return connecting
  const acc = account()
  if (!acc) {
    useCloud.setState({ status: 'guest' })
    return Promise.resolve(null)
  }
  useCloud.setState({ status: 'connecting', message: '' })
  connecting = (async () => {
    const r = await openRoom({ token: acc.token, devId: acc.devId, name: acc.name })
    if (!r) return null
    const loaded = new Promise((resolve) => {
      r.onMessage('profile', (p) => {
        onProfile(p)
        resolve()
      })
    })
    r.onMessage('saved', (m) => onSaved(m?.profile))
    r.onMessage('boards', (b) => useCloud.setState({ boards: b, boardsError: '' }))
    r.onMessage('error', (e) => useCloud.setState({ message: e?.message || '' }))
    r.onLeave(() => {
      if (room !== r) return
      room = null
      inflight.clear()
    })
    room = r
    await Promise.race([loaded, wait(10_000)])
    touch()
    return r
  })()
    .catch((err) => {
      console.warn('[cloud] could not reach cloud saves', err?.message || err)
      useCloud.setState({ status: 'error', message: 'Cloud saves are unavailable right now' })
      return null
    })
    .finally(() => {
      connecting = null
    })
  return connecting
}

function onProfile(p) {
  cloud = normalizeProfile(p)
  useProgress.getState().applyCloud(cloud)
  useSaves.getState().applyCloud(cloud)
  useCloud.setState({ status: 'synced', message: '' })
  submitBoards(cloud)
  // Anything this device had that the cloud didn't goes up now.
  schedulePush(300)
}

function onSaved(p) {
  if (!p) return
  cloud = normalizeProfile(p)
  inflight.clear()
  // The cloud may know more than we do (another device): take it.
  useProgress.getState().applyCloud(cloud)
  useSaves.getState().applyCloud(cloud)
  useCloud.setState({ status: 'synced', message: '' })
  submitBoards(cloud)
}

/** Boxity's leaderboards through the SDK, for a signed-in player (the server reports too). */
function submitBoards(p) {
  const acc = account()
  const board = getSDK()?.leaderboard
  if (!acc?.real || typeof board?.submit !== 'function') return
  for (const [id, score] of Object.entries(leaderboardScores(p))) {
    if (!(score > (submitted[id] ?? 0))) continue
    submitted[id] = score
    Promise.resolve(safeCall(board.submit.bind(board), id, score)).catch(() => delete submitted[id])
  }
}

async function push() {
  pushTimer = null
  if (!account()) return
  const r = await ensureRoom()
  if (!r || !cloud) return
  let sent = false
  const local = progressProfile()
  const progress = JSON.stringify({ zombieBest: local.zombieBest, badges: local.badges, stats: local.stats })
  if (aheadOf(local, cloud) && !inflight.has(progress)) {
    inflight.add(progress)
    r.send('progress', JSON.parse(progress))
    sent = true
  }
  const inCloud = new Map(cloud.saves.map((s) => [s.id, s.savedAt]))
  const { saves, removed } = useSaves.getState()
  for (const s of saves) {
    const key = `${s.id}:${s.savedAt}`
    if (inCloud.get(s.id) >= s.savedAt || inflight.has(key) || !cleanSave(s)) continue
    inflight.add(key)
    r.send('putSave', s)
    sent = true
  }
  for (const [id, t] of Object.entries(removed)) {
    if (!inCloud.has(id) || cloud.removed[id] >= t || inflight.has(`del:${id}`)) continue
    inflight.add(`del:${id}`)
    r.send('delSave', id)
    sent = true
  }
  if (sent) useCloud.setState({ status: 'saving' })
  pushAt = performance.now()
}

function schedulePush(delay = PUSH_MS) {
  if (!account()) return
  if (pushTimer) {
    // Sooner wins: a new save shouldn't wait behind a playtime top-up.
    if (delay >= PUSH_MS) return
    clearTimeout(pushTimer)
  }
  pushTimer = setTimeout(push, delay)
}

/** Where your progress is kept, in a few words (for the leaderboards and the HUD). */
export function cloudText(status, loggedIn) {
  if (status === 'off') return 'Progress is saved on this device'
  if (!loggedIn && status === 'guest') return 'Sign in to save your progress to the cloud and get on the boards'
  if (status === 'connecting') return 'Connecting to cloud saves…'
  if (status === 'saving') return 'Saving to the cloud…'
  if (status === 'synced') return 'Progress and saves are backed up to the cloud'
  if (status === 'error') return 'Cloud saves are unavailable - progress is kept on this device'
  return 'Progress is saved on this device'
}

/** Asks for the leaderboards (into useCloud().boards). Works for guests too. */
export async function fetchBoards() {
  if (useCloud.getState().boardsLoading) return
  useCloud.setState({ boardsLoading: true, boardsError: '' })
  let temp = null
  try {
    let r = account() ? await ensureRoom() : null
    if (!r) {
      temp = await openRoom({ boardsOnly: true })
      r = temp
    }
    if (!r) throw new Error('No server')
    const got = new Promise((resolve) => {
      if (temp) temp.onMessage('boards', resolve)
      else {
        const off = r.onMessage('boards', (b) => {
          if (typeof off === 'function') off()
          resolve(b)
        })
      }
    })
    r.send('boards')
    const boards = await Promise.race([got, wait(10_000).then(() => null)])
    if (!boards) throw new Error('No answer')
    useCloud.setState({ boards })
  } catch (err) {
    console.warn('[cloud] leaderboards unavailable', err?.message || err)
    useCloud.setState({ boardsError: useCloud.getState().status === 'off' ? 'Leaderboards need the game server' : 'Leaderboards are unavailable right now' })
  } finally {
    temp?.leave(true)
    useCloud.setState({ boardsLoading: false })
  }
}

let started = false

/** Starts syncing and counting (once per page). */
export function startCloud() {
  if (started) return
  started = true
  // Sign-in, sign-out, or a different account: start over with that account's cloud copy.
  const onUser = () => {
    const r = room
    room = null
    cloud = null
    inflight.clear()
    r?.leave(true)
    if (account()) ensureRoom()
    else useCloud.setState({ status: 'guest' })
  }
  useBloxityStore.subscribe((s, prev) => {
    if ((s.user?._id ?? null) !== (prev.user?._id ?? null)) onUser()
  })
  onUser()

  // Changes worth sending: a run, a battle, a save - soon; playtime alone - now and then.
  useProgress.subscribe((s, prev) => {
    if (!cloud) return
    const onlyTime = s.zombieBest === prev.zombieBest && s.badges === prev.badges && s.stats.zombieKills === prev.stats.zombieKills && s.stats.battles === prev.stats.battles
    if (!onlyTime) schedulePush()
    else if (performance.now() - pushAt > PLAYTIME_PUSH_MS) schedulePush(PLAYTIME_PUSH_MS / 4)
  })
  useSaves.subscribe((s, prev) => {
    if (cloud && (s.saves !== prev.saves || s.removed !== prev.removed)) schedulePush()
  })

  // Seconds played, while the game is on screen and not in an ad break.
  setInterval(() => {
    if (document.visibilityState === 'visible' && !getBloxityState().adBreak) useProgress.getState().addPlaytime(PLAYTIME_TICK_S)
  }, PLAYTIME_TICK_S * 1000)

  // Battles fought: ones that lasted long enough to count.
  let battleSince = 0
  useApp.subscribe((s, prev) => {
    if (s.screen === prev.screen) return
    if (s.screen === 'battle') battleSince = performance.now()
    else if (prev.screen === 'battle' && battleSince && performance.now() - battleSince >= BATTLE_MIN_SECONDS * 1000) useProgress.getState().recordBattle()
  })
}
