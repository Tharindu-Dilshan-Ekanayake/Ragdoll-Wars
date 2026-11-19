/**
 * A player's profile - what cloud saves keep - and the rules both ends follow for it.
 * Plain data, no browser or server APIs: the game and the server (Dockerfile copies
 * this folder) run the very same code, so they can never disagree about a merge.
 *
 *   {
 *     v: 1,
 *     name,
 *     zombieBest,                    best Zombie Horde wave, 0..15
 *     badges: { bronze, silver, gold, platinum },
 *     stats: { zombieKills, battles, playtime },   running totals (playtime in seconds)
 *     saves: [{ id, name, mapId, savedAt, counts, data }],   sandbox saves, newest first
 *     removed: { [saveId]: time },   deleted saves, so a merge doesn't bring them back
 *     updatedAt,
 *   }
 *
 * Merging never loses progress: bests and totals take the larger, badges add up, saves
 * are the union (newest copy of each, minus deleted ones, newest MAX_SAVES). So a stale
 * device or a second tab can't wipe anything, and the order merges happen in doesn't
 * matter.
 */

export const PROFILE_VERSION = 1
export const MAX_SAVES = 8
export const MAX_WAVE = 15
export const BADGE_IDS = ['bronze', 'silver', 'gold', 'platinum']
const MAX_REMOVED = 30
/** A save's battlefield, as JSON, may be at most this big (one per network message). */
export const MAX_SAVE_BYTES = 48 * 1024
const LIMITS = { soldiers: 240, vehicles: 24, pieces: 420, mines: 120 }

/**
 * The boards, declared to Boxity (client SDK `leaderboard.define`, server reports) and
 * shown in the lobby. `field` is the profile number each ranks.
 */
export const LEADERBOARDS = [
  { id: 'zombie_wave', label: 'Best Zombie Wave', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'zombie_kills', label: 'Zombies Dropped', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'battles', label: 'Battles Fought', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'playtime', label: 'Minutes Played', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]

const whole = (n, max = 1e9) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0)
const text = (s, max) =>
  typeof s === 'string'
    ? s
        .replace(/[^\p{L}\p{N} _.,:'()#&!?+·-]/gu, '')
        .trim()
        .slice(0, max)
    : ''

export const cleanName = (name) => text(name, 20) || 'Commander'

export function emptyProfile(name = 'Commander') {
  return { v: PROFILE_VERSION, name: cleanName(name), zombieBest: 0, badges: {}, stats: { zombieKills: 0, battles: 0, playtime: 0 }, saves: [], removed: {}, updatedAt: 0 }
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const rowsOk = (rows, len, max) => Array.isArray(rows) && rows.length <= max && rows.every((r) => Array.isArray(r) && r.length === len && r.every((c) => isNum(c) || (typeof c === 'string' && c.length <= 24)))

/** A save slot if `s` is a sound one, else null. */
export function cleanSave(s) {
  if (!s || typeof s !== 'object') return null
  if (typeof s.id !== 'string' || !/^s[0-9a-z]{1,16}$/.test(s.id)) return null
  if (typeof s.mapId !== 'string' || !/^[a-z]{2,20}$/.test(s.mapId)) return null
  const d = s.data
  if (!d || d.v !== 1 || d.mapId !== s.mapId) return null
  if (!rowsOk(d.soldiers, 6, LIMITS.soldiers) || !rowsOk(d.vehicles, 6, LIMITS.vehicles) || !rowsOk(d.pieces, 4, LIMITS.pieces) || !rowsOk(d.mines, 3, LIMITS.mines)) return null
  const data = { v: 1, mapId: d.mapId, soldiers: d.soldiers, vehicles: d.vehicles, pieces: d.pieces, mines: d.mines }
  if (JSON.stringify(data).length > MAX_SAVE_BYTES) return null
  const counts = { soldiers: d.soldiers.length, vehicles: d.vehicles.length, pieces: d.pieces.length, mines: d.mines.length }
  return { id: s.id, name: text(s.name, 40) || 'Battlefield', mapId: s.mapId, savedAt: whole(s.savedAt, 1e14), counts, data }
}

function cleanRemoved(r) {
  const out = {}
  if (!r || typeof r !== 'object') return out
  const entries = Object.entries(r)
    .filter(([id, t]) => /^s[0-9a-z]{1,16}$/.test(id) && isNum(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_REMOVED)
  for (const [id, t] of entries) out[id] = whole(t, 1e14)
  return out
}

/** `raw` (anything) as a well-formed profile. */
export function normalizeProfile(raw, name) {
  const p = emptyProfile(name || raw?.name)
  if (!raw || typeof raw !== 'object') return p
  p.zombieBest = whole(raw.zombieBest, MAX_WAVE)
  for (const id of BADGE_IDS) if (raw.badges?.[id] === true) p.badges[id] = true
  const st = raw.stats || {}
  p.stats = { zombieKills: whole(st.zombieKills), battles: whole(st.battles), playtime: whole(st.playtime) }
  p.removed = cleanRemoved(raw.removed)
  p.saves = finishSaves((Array.isArray(raw.saves) ? raw.saves : []).map(cleanSave).filter(Boolean), p.removed)
  p.updatedAt = whole(raw.updatedAt, 1e14)
  return p
}

/** Newest copy of each save id, minus deleted ones (unless saved again since), newest first. */
function finishSaves(list, removed) {
  const byId = new Map()
  for (const s of list) {
    const had = byId.get(s.id)
    if (!had || s.savedAt > had.savedAt) byId.set(s.id, s)
  }
  return [...byId.values()]
    .filter((s) => !(removed[s.id] >= s.savedAt))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SAVES)
}

/** Two profiles as one, losing nothing (see the top of the file). Both must be normalized. */
export function mergeProfiles(a, b) {
  const removed = { ...a.removed }
  for (const [id, t] of Object.entries(b.removed)) removed[id] = Math.max(removed[id] || 0, t)
  const out = {
    v: PROFILE_VERSION,
    name: b.name || a.name,
    zombieBest: Math.max(a.zombieBest, b.zombieBest),
    badges: { ...a.badges, ...b.badges },
    stats: {
      zombieKills: Math.max(a.stats.zombieKills, b.stats.zombieKills),
      battles: Math.max(a.stats.battles, b.stats.battles),
      playtime: Math.max(a.stats.playtime, b.stats.playtime),
    },
    removed: cleanRemoved(removed),
    saves: [],
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  }
  out.saves = finishSaves([...a.saves, ...b.saves], out.removed)
  return out
}

/** Each board's score for a profile, as whole numbers. */
export function leaderboardScores(p) {
  return {
    zombie_wave: whole(p.zombieBest, MAX_WAVE),
    zombie_kills: whole(p.stats.zombieKills),
    battles: whole(p.stats.battles),
    playtime: Math.floor(whole(p.stats.playtime) / 60),
  }
}

/** Whether `a` holds anything `b` doesn't (so `b`'s keeper needs telling). */
export function aheadOf(a, b) {
  if (a.zombieBest > b.zombieBest) return true
  if (BADGE_IDS.some((id) => a.badges[id] && !b.badges[id])) return true
  if (a.stats.zombieKills > b.stats.zombieKills || a.stats.battles > b.stats.battles || a.stats.playtime > b.stats.playtime) return true
  return false
}
