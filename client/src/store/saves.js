import { create } from 'zustand'

import { MAX_SAVES, cleanSave, mergeProfiles, normalizeProfile } from '../shared/profile'

export { MAX_SAVES }

/**
 * Saved sandbox battlefields: up to MAX_SAVES slots, newest first, each
 * { id, name, mapId, savedAt, counts, data } with `data` from sim/saveGame.js. Kept in
 * localStorage, and for a signed-in player in the cloud too (net/cloud.js), so a save
 * made on the laptop is there on the phone. Deleting a save leaves a note (`removed`)
 * so merging with an older copy doesn't bring it back.
 */

const KEY = 'ff.saves'
const KEY_REMOVED = 'ff.saves.removed'

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return v ?? fallback
  } catch {
    return fallback
  }
}

/** Saves the cloud can't take (none should exist) stay on this device rather than vanish. */
const localOnly = (list) => (Array.isArray(list) ? list.filter((s) => s && s.data && s.mapId && typeof s.id === 'string' && !cleanSave(s)) : [])
const withLocal = (saves, extra) => [...saves, ...extra].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, MAX_SAVES)

function load() {
  const raw = read(KEY, [])
  const p = normalizeProfile({ saves: raw, removed: read(KEY_REMOVED, {}) })
  return { saves: withLocal(p.saves, localOnly(raw)), removed: p.removed }
}

function persist({ saves, removed }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saves))
    localStorage.setItem(KEY_REMOVED, JSON.stringify(removed))
    return true
  } catch {
    return false
  }
}

export const useSaves = create((set, get) => {
  const update = (next) => {
    set(next)
    persist(get())
  }
  return {
    ...load(),
    /** Adds a save (or overwrites `replaceId`); returns false if the list is full. */
    add: (entry, replaceId = null) => {
      let saves = get().saves.filter((s) => s.id !== replaceId)
      if (saves.length >= MAX_SAVES) return false
      saves = [{ ...entry, savedAt: entry.savedAt || Date.now(), id: replaceId || `s${Date.now().toString(36)}` }, ...saves]
      update({ saves })
      return true
    },
    remove: (id) => update({ saves: get().saves.filter((s) => s.id !== id), removed: { ...get().removed, [id]: Date.now() } }),
    /** Merges the cloud's saves in (newest copy of each, deleted ones stay deleted). */
    applyCloud: (profile) => {
      const mine = normalizeProfile({ saves: get().saves, removed: get().removed })
      const m = mergeProfiles(mine, normalizeProfile(profile))
      update({ saves: withLocal(m.saves, localOnly(get().saves)), removed: m.removed })
    },
  }
})

export const getSave = (id) => useSaves.getState().saves.find((s) => s.id === id) || null
