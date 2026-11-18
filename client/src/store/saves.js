import { create } from 'zustand'

/**
 * Saved sandbox battlefields (in this browser): up to MAX_SAVES slots, newest first,
 * each { id, name, mapId, savedAt, counts, data } with `data` from sim/saveGame.js.
 * A private window or blocked storage just means saves last until the page closes.
 */

const KEY = 'ff.saves'
export const MAX_SAVES = 8

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((s) => s && s.data && s.mapId) : []
  } catch {
    return []
  }
}

function persist(saves) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saves))
    return true
  } catch {
    return false
  }
}

export const useSaves = create((set, get) => ({
  saves: load(),
  /** Adds a save (or overwrites `replaceId`); returns false if the list is full. */
  add: (entry, replaceId = null) => {
    let saves = get().saves.filter((s) => s.id !== replaceId)
    if (saves.length >= MAX_SAVES) return false
    saves = [{ ...entry, id: replaceId || `s${Date.now().toString(36)}` }, ...saves]
    set({ saves })
    persist(saves)
    return true
  },
  remove: (id) => {
    const saves = get().saves.filter((s) => s.id !== id)
    set({ saves })
    persist(saves)
  },
}))

export const getSave = (id) => useSaves.getState().saves.find((s) => s.id === id) || null
