import { create } from 'zustand'

/**
 * App-level state: which screen is up and whether a modal panel is open (Boxity's
 * screen ads and gameplay lifecycle follow these; see bloxity/integration.js).
 */
export const useApp = create((set) => ({
  /** 'lobby' (the Sea Fort) | 'battle' */
  screen: 'lobby',
  mapId: 'training',
  /** 'sandbox' or 'zombies' (Zombie Horde). */
  mode: 'sandbox',
  /** A saved battlefield (store/saves.js id) to load once the battle is up. */
  pendingSave: null,
  /** True once the lobby has drawn its first frame: the game is playable. */
  playable: false,
  /** True while a modal panel covers the game. */
  panel: false,
  setPlayable: () => set({ playable: true }),
  setPanel: (panel) => set({ panel: Boolean(panel) }),
  startBattle: (mapId, mode = 'sandbox', saveId = null) => set({ screen: 'battle', mapId, mode, pendingSave: saveId, panel: false }),
  takePendingSave: () => {
    const id = getApp().pendingSave
    if (id) useApp.setState({ pendingSave: null })
    return id
  },
  toLobby: () => set({ screen: 'lobby', panel: false }),
}))

export const getApp = () => useApp.getState()
