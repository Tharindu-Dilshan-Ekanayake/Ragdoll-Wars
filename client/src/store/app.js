import { create } from 'zustand'

/**
 * App-level state: which screen is up and whether a modal panel is open (Boxity's
 * screen ads and gameplay lifecycle follow these; see bloxity/integration.js).
 */
export const useApp = create((set) => ({
  /** 'lobby' (the Sea Fort) | 'battle' */
  screen: 'lobby',
  mapId: 'training',
  /** True once the lobby has drawn its first frame: the game is playable. */
  playable: false,
  /** True while a modal panel covers the game. */
  panel: false,
  setPlayable: () => set({ playable: true }),
  setPanel: (panel) => set({ panel: Boolean(panel) }),
  startBattle: (mapId) => set({ screen: 'battle', mapId, panel: false }),
  toLobby: () => set({ screen: 'lobby', panel: false }),
}))

export const getApp = () => useApp.getState()
