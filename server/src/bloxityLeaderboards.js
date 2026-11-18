import { LEADERBOARDS, leaderboardScores } from '../../client/src/shared/profile.js'
import { postJson } from './bloxityApi.js'
import { apiUrl, bloxity } from './bloxityEnv.js'

/**
 * Boxity leaderboards, reported by the server from the cloud profiles it keeps: every
 * REPORT_MS the scores of signed-in players whose profile changed go to Boxity in one
 * batch (only boards whose number moved). Each pod reports the players it served.
 * Without BLOXITY_REPORT_TOKEN (a laptop, or before the platform issued one) nothing
 * is reported; the game's own boards in the lobby work regardless.
 */

const REPORT_MS = 20_000
export const MAX_SCORES_PER_REPORT = 200

/** Boxity knows a game's players as 'legion_' + their account id. */
export const boxityUserId = (playerId) => `legion_${playerId}`

/** 'userId|board' -> the score Boxity last accepted from this pod. */
const lastSent = new Map()
/** playerId -> latest profile, waiting for the next report. */
const pending = new Map()
let running = null

/** The scores in `players` ([{ id, profile }]) that differ from what Boxity has. */
export function changedScores(players, sent = lastSent) {
  const out = []
  for (const { id, profile } of players) {
    const userId = boxityUserId(id)
    for (const [board, score] of Object.entries(leaderboardScores(profile))) {
      if (sent.get(`${userId}|${board}`) !== score) out.push({ board, userId, score })
    }
  }
  return out
}

/** Sends `scores` in calls of at most 200; what Boxity took goes into `sent`. */
export async function sendScores(scores, sent, { token, settings = bloxity, fetchImpl = fetch } = {}) {
  const url = apiUrl(`/v1/leaderboards/hosted/${encodeURIComponent(settings.gameId)}/report`, settings)
  if (!url) return
  for (let i = 0; i < scores.length; i += MAX_SCORES_PER_REPORT) {
    const batch = scores.slice(i, i + MAX_SCORES_PER_REPORT)
    try {
      const { status, body } = await postJson(url, { boards: LEADERBOARDS, scores: batch }, { headers: { Authorization: `Bearer ${token}` }, fetchImpl })
      if (status < 200 || status >= 300) {
        console.warn(`[boxity-boards] report refused (${status})`, body?.error || '')
        continue
      }
      for (const s of batch) sent.set(`${s.userId}|${s.board}`, s.score)
    } catch (err) {
      console.warn('[boxity-boards] report failed', err?.message || err)
    }
  }
}

/** A signed-in player's profile changed: report it with the next batch. */
export function queueReport(playerId, profile) {
  if (!process.env.BLOXITY_REPORT_TOKEN) return
  pending.set(playerId, profile)
}

function flush() {
  const token = process.env.BLOXITY_REPORT_TOKEN
  if (!token || running || !pending.size) return
  const players = [...pending].map(([id, profile]) => ({ id, profile }))
  pending.clear()
  running = sendScores(changedScores(players), lastSent, { token }).finally(() => {
    running = null
    // Keep the map from growing: Boxity has these players' current scores now.
    if (lastSent.size > 20000) lastSent.clear()
  })
}

export function startBloxityLeaderboards() {
  if (!process.env.BLOXITY_REPORT_TOKEN) {
    console.log('[boxity-boards] BLOXITY_REPORT_TOKEN not set; not reporting scores')
    return () => {}
  }
  const id = setInterval(flush, REPORT_MS)
  return () => clearInterval(id)
}
