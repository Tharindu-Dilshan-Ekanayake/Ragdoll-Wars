import { create } from 'zustand'

/**
 * The player's saved progress (in this browser): Zombie Horde's best wave and the star
 * badges earned on the way. Saved to localStorage; a private window or blocked storage
 * just means nothing is remembered.
 */

const KEY = 'ff.progress'

/** Badges for how far you get in Zombie Horde. */
export const ZOMBIE_BADGES = [
  { id: 'bronze', name: 'Bronze Star', wave: 5, text: 'Reach wave 5' },
  { id: 'silver', name: 'Silver Star', wave: 10, text: 'Reach wave 10' },
  { id: 'gold', name: 'Gold Star', wave: 15, text: 'Survive all 15 waves' },
]

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v === 'object') return { zombieBest: Number(v.zombieBest) || 0, badges: v.badges && typeof v.badges === 'object' ? v.badges : {} }
  } catch {
    // Storage unavailable: start fresh.
  }
  return { zombieBest: 0, badges: {} }
}

export const useProgress = create((set, get) => ({
  ...load(),
  /**
   * Records a finished Zombie Horde run: `wave` reached (a won run counts all 15).
   * Returns the badges earned for the first time.
   */
  recordZombieRun: (wave, won) => {
    const { zombieBest, badges } = get()
    const reached = won ? 15 : wave
    const fresh = ZOMBIE_BADGES.filter((b) => !badges[b.id] && (b.id === 'gold' ? won : reached >= b.wave))
    const next = { zombieBest: Math.max(zombieBest, reached), badges: { ...badges } }
    for (const b of fresh) next.badges[b.id] = true
    set(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Not saved; the run still counts for this session.
    }
    return fresh
  },
}))
