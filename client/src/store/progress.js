import { create } from 'zustand'

import { mergeProfiles, normalizeProfile } from '../shared/profile'

/**
 * The player's progress: Zombie Horde's best wave and star badges, and running totals
 * for the leaderboards (zombies dropped, battles fought, seconds played). Kept in
 * localStorage for everyone; a signed-in player's copy is also kept in the cloud and
 * merged both ways by net/cloud.js (shared/profile.js: nothing is ever lost).
 */

const KEY = 'ff.progress'
/** A battle counts towards "Battles Fought" once it has lasted this long. */
export const BATTLE_MIN_SECONDS = 30

/** Badges for how far you get in Zombie Horde. */
export const ZOMBIE_BADGES = [
  { id: 'bronze', name: 'Bronze Star', wave: 5, text: 'Reach wave 5' },
  { id: 'silver', name: 'Silver Star', wave: 10, text: 'Reach wave 10' },
  { id: 'gold', name: 'Gold Star', wave: 15, text: 'Survive all 15 waves' },
]

const pick = (p) => ({ zombieBest: p.zombieBest, badges: p.badges, stats: p.stats })

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return pick(normalizeProfile(raw ? JSON.parse(raw) : null))
  } catch {
    // Storage unavailable: start fresh.
    return pick(normalizeProfile(null))
  }
}

function persist(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pick(state)))
  } catch {
    // Not saved; it still counts for this session.
  }
}

/** The progress part of a profile, as shared/profile.js wants it. */
export const progressProfile = (s = useProgress.getState()) => normalizeProfile(pick(s))

export const useProgress = create((set, get) => {
  const update = (next) => {
    set(next)
    persist(get())
  }
  return {
    ...load(),
    /**
     * Records a finished Zombie Horde run: `wave` reached (a won run counts all 15) and
     * zombies dropped. Returns the badges earned for the first time.
     */
    recordZombieRun: (wave, won, kills = 0) => {
      const { zombieBest, badges, stats } = get()
      const reached = won ? 15 : wave
      const fresh = ZOMBIE_BADGES.filter((b) => !badges[b.id] && (b.id === 'gold' ? won : reached >= b.wave))
      const next = { zombieBest: Math.max(zombieBest, reached), badges: { ...badges }, stats: { ...stats, zombieKills: stats.zombieKills + Math.max(0, Math.floor(kills) || 0) } }
      for (const b of fresh) next.badges[b.id] = true
      update(next)
      return fresh
    },
    recordBattle: () => update({ stats: { ...get().stats, battles: get().stats.battles + 1 } }),
    addPlaytime: (seconds) => update({ stats: { ...get().stats, playtime: get().stats.playtime + Math.max(0, Math.round(seconds)) } }),
    /** Merges the cloud's copy in (bests and totals take the larger). */
    applyCloud: (profile) => update(pick(mergeProfiles(progressProfile(get()), normalizeProfile(profile)))),
  }
})
