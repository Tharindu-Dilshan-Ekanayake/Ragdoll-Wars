import { create } from 'zustand'

/**
 * Player settings kept on this device: blood on/off and the in-game volume. (Graphics
 * level lives in quality.js; Boxity's portal settings arrive via bloxity/integration.js.)
 */
const KEY = 'ff.settings'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ blood: state.blood, volume: state.volume }))
  } catch {
    // Private mode: settings just won't persist.
  }
}

const initial = load()

export const useSettings = create((set, get) => ({
  blood: initial.blood !== false,
  /** 0..1, multiplied with Boxity's master volume. */
  volume: typeof initial.volume === 'number' ? Math.min(1, Math.max(0, initial.volume)) : 0.8,
  setBlood: (blood) => {
    set({ blood })
    save(get())
  },
  setVolume: (volume) => {
    set({ volume })
    save(get())
  },
}))
