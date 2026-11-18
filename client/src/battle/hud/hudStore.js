import { create } from 'zustand'

/**
 * The battle HUD's state: what the player has picked (team, order, squad size, the unit
 * being placed, speed) and slow-moving summaries of the battle copied in by the 10 Hz
 * ticker (hudTicker.js). Never written from a frame loop.
 */
export const useHud = create((set, get) => ({
  team: 0,
  order: 'attack',
  count: 1,
  /** Unit type key being placed, or null. */
  placing: null,
  speed: 1,
  paused: false,
  /** Touch: one-finger drag draws a selection box instead of panning. */
  selectMode: false,
  /** Whether the dock is collapsed. */
  dockHidden: false,

  stats: { alive: [0, 0], lost: [0, 0], downed: [0, 0] },
  /** Selection summary: null, or { count, team, types: {key: n}, unit: {...} | null } */
  selection: null,
  /** { text, kind, id } */
  toast: null,
  /** 'settings' | 'help' | 'clear' | null */
  panel: null,

  setTeam: (team) => set({ team }),
  setOrder: (order) => set({ order }),
  setCount: (count) => set({ count }),
  setPlacing: (placing) => set({ placing: get().placing === placing ? null : placing, selectMode: false }),
  cancelPlacing: () => set({ placing: null }),
  setSpeed: (speed) => set({ speed, paused: false }),
  togglePause: () => set({ paused: !get().paused }),
  toggleSelectMode: () => set({ selectMode: !get().selectMode, placing: null }),
  toggleDock: () => set({ dockHidden: !get().dockHidden }),
  setPanel: (panel) => set({ panel }),
  showToast: (text, kind = 'warn') => set({ toast: { text, kind, id: (get().toast?.id || 0) + 1 } }),
  clearToast: (id) => {
    if (get().toast?.id === id) set({ toast: null })
  },
}))

export const getHud = () => useHud.getState()
