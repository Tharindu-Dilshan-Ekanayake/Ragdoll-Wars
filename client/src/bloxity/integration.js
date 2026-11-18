import { setAdBreakMuted, setMasterVolume, setMusicVolume } from '../audio/sfx'
import { getApp, useApp } from '../store/app'
import { QUALITY_LEVELS, useQuality } from '../store/quality'
import { respawnLobby } from '../lobby/lobbyState'
import { loadEmotes, playLocalEmote, stopLocalEmote } from './emotes'
import { safeCall, toUnsubscribe } from './sdk'
import { hideScreen, setScreen } from './services'
import { getBloxityState, useBloxityStore } from './store'

/**
 * What Floppy Front wires into the Boxity SDK besides auth (that stays in
 * BloxityProvider): ad breaks, the portal's settings menu, the gameplay lifecycle and
 * screen ads, and the portal's player events (respawn, emotes for your lobby avatar).
 * Leaderboards and chat come back with the multiplayer phase.
 *
 * `setupOnce` runs once per page right after `init()`; `installIntegration` runs per
 * provider mount and returns its teardown (StrictMode mounts twice in dev).
 */

/** Screen types for Boxity's screen ads. Gameplay banners stay OFF (no `show: true`). */
export const AD_SCREENS = { panel: {}, gameplay: {} }

/** Once per page, right after `Legion.SDK.init()`. */
export function setupOnce(sdk) {
  // Boxity draws its emote picker once a game says it can play emotes (the Sea Fort can).
  safeCall(sdk.game?.registerFeature?.bind(sdk.game), 'emotes')
  safeCall(sdk.ads?.declareScreens?.bind(sdk.ads), AD_SCREENS)
}

function subscribe(target, method, fn) {
  return toUnsubscribe(safeCall(target?.[method]?.bind(target), fn))
}

// --- Ad breaks: the canvas stops drawing (frameloop 'never') and audio is muted. --------

function setAdBreak(on) {
  if (getBloxityState().adBreak === on) return
  useBloxityStore.getState().setAdBreak(on)
  setAdBreakMuted(on)
}

// --- Settings (the Boxity portal menu) --------------------------------------------------

const QUALITY_FROM_SETTING = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', ultra: 'HIGH' }

function parseNumber(value, min, max, fallback) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const SETTINGS = {
  master_volume(value) {
    setMasterVolume(parseNumber(value, 0, 100, 100) / 100)
  },
  music_volume(value) {
    // The wind bed under the battle.
    setMusicVolume(parseNumber(value, 0, 100, 100) / 100)
  },
  graphics_quality(value, { initial, changed }) {
    const level = QUALITY_FROM_SETTING[String(value).trim().toLowerCase()]
    if (!level) return
    const quality = useQuality.getState()
    if (initial) {
      // The portal's default never raises an auto-detected weak device.
      if (QUALITY_LEVELS.indexOf(level) < QUALITY_LEVELS.indexOf(quality.level)) quality.setLevel(level, false)
      return
    }
    if (changed) quality.setLevel(level, true)
  },
  show_fps(value) {
    useBloxityStore.getState().setSetting({ showFps: value === 'true' })
  },
  camera_sensitivity(value) {
    useBloxityStore.getState().setSetting({ cameraSensitivity: parseNumber(value, 0.1, 5, 1) })
  },
  background_transparency(value) {
    document.documentElement.style.setProperty('--panel-alpha', String(parseNumber(value, 0.2, 1, 0.88)))
  },
  fullscreen(value, { initial, changed }, sdk) {
    if (initial || !changed) return
    const portal = sdk.portal
    if (value === 'true') safeCall(portal?.requestFullscreen?.bind(portal))
    else if (value === 'false') safeCall(portal?.exitFullscreen?.bind(portal))
  },
}

function installSettings(sdk) {
  const settings = sdk.settings
  if (typeof settings?.listen !== 'function') return () => {}
  const unsubscribers = []
  const lastSeen = new Map()
  let starting = true
  for (const [key, apply] of Object.entries(SETTINGS)) {
    const listener = (raw) => {
      const value = raw === undefined || raw === null ? '' : String(raw)
      const first = !lastSeen.has(key)
      const changed = !first && lastSeen.get(key) !== value
      lastSeen.set(key, value)
      try {
        apply(value, { initial: starting || first, changed }, sdk)
      } catch (err) {
        console.warn(`[bloxity] setting ${key} failed`, err)
      }
    }
    unsubscribers.push(toUnsubscribe(safeCall(settings.listen.bind(settings), key, listener)))
  }
  safeCall(settings.triggerAll?.bind(settings))
  starting = false
  return () => unsubscribers.forEach((fn) => safeCall(fn))
}

// --- Player events from the portal ---------------------------------------------------

function onPlayerEvent(event, data) {
  const screen = getApp().screen
  if (event === 'respawn_request') {
    if (screen !== 'lobby') return
    stopLocalEmote()
    respawnLobby()
  } else if (event === 'play_emote') {
    if (screen === 'lobby') playLocalEmote(typeof data === 'string' ? data : (data?.id ?? data?.emoteId))
  }
}

function installPlayerEvents(sdk) {
  const player = sdk.player
  const handler = (event, data) => {
    try {
      onPlayerEvent(event, data)
    } catch (err) {
      console.warn('[bloxity] player event failed', event, err)
    }
  }
  if (typeof player?.onEvent === 'function') return subscribe(player, 'onEvent', handler)
  return subscribe(player, 'onRespawnRequest', () => handler('respawn_request'))
}

// --- Gameplay lifecycle + screen ads ------------------------------------------------------

let gameplayStarted = false

function installLifecycle(sdk) {
  const game = sdk.game
  const start = () => {
    if (gameplayStarted) return
    gameplayStarted = true
    safeCall(game?.gameplayStart?.bind(game))
  }
  const sync = (state) => {
    if (!state.playable) return
    start()
    setScreen(state.panel ? 'panel' : 'gameplay')
  }
  sync(getApp())
  const unsubscribe = useApp.subscribe((state, prev) => {
    if (state.playable !== prev.playable || state.panel !== prev.panel) sync(state)
  })
  const onPageHide = () => {
    if (!gameplayStarted) return
    gameplayStarted = false
    safeCall(game?.gameplayEnd?.bind(game))
  }
  const onPageShow = (e) => {
    if (e.persisted) sync(getApp())
  }
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    hideScreen()
  }
}

/** Wires the SDK into the game; returns the teardown. Never throws. */
export function installIntegration(sdk) {
  const teardown = []
  const guard = (label, install) => {
    try {
      teardown.push(install())
    } catch (err) {
      console.warn(`[bloxity] ${label} setup failed`, err)
    }
  }
  guard('ads', () => {
    const offStart = subscribe(sdk.ads, 'onBreakStart', () => setAdBreak(true))
    const offEnd = subscribe(sdk.ads, 'onBreakEnd', () => setAdBreak(false))
    return () => {
      offStart()
      offEnd()
      setAdBreak(false)
    }
  })
  guard('settings', () => installSettings(sdk))
  guard('player events', () => installPlayerEvents(sdk))
  guard('lifecycle', () => installLifecycle(sdk))
  loadEmotes()
  return () => teardown.forEach((fn) => safeCall(fn))
}
