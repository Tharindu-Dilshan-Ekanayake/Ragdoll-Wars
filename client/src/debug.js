import { lobby, useLobby } from './lobby/lobbyState'
import { useCloud } from './net/cloud'
import { useApp } from './store/app'
import { useProgress } from './store/progress'
import { useQuality } from './store/quality'

/**
 * `?debug` in the URL: exposes the battle on `window.__ff` for the console and the
 * automated perf check (scripts/perf-check.mjs). Nothing is installed without the flag.
 * The battle modules load on demand, so this never pulls them into the start-up bundle.
 */
export function installDebugHooks() {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('debug')) return
  window.__ff = {
    app: useApp,
    quality: useQuality,
    lobby,
    lobbyStore: useLobby,
    cloud: useCloud,
    progress: useProgress,
    async battle() {
      return (await import('./battle/state.js')).battle
    },
    async commands() {
      return import('./battle/commands.js')
    },
    async world() {
      return import('./battle/sim/world.js')
    },
    async hud() {
      return (await import('./battle/hud/hudStore.js')).useHud
    },
    async walk() {
      return import('./battle/walk/walkMode.js')
    },
    async zombies() {
      return import('./battle/sim/zombies.js')
    },
    async vehicles() {
      return import('./battle/sim/vehicles.js')
    },
  }
}
