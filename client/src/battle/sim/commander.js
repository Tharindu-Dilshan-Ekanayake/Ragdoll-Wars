import { SQUAD_SIZE } from './squads.js'

/**
 * The commander: one per team, giving its squads (squads.js) a job every couple of
 * seconds, for the squads on an attack order (the player's Hold and Flank orders stand).
 *
 * - assault    the default: push on at the nearest enemy, bounding in contact.
 * - flank      when the front stalls (in contact and not gaining ground), the squad out
 *              furthest to one side swings round that side of the enemy, then turns in.
 *              One at a time per team.
 * - fallback   a squad cut down to 40% of its strength in a fight pulls back behind the
 *              line, then joins up with another squad (or catches its breath) and goes in
 *              again.
 * - reinforce  a squad out of the fight goes to one that's pinned or losing.
 * - ambush     outnumbered, squads out of contact hide in cover and hold their fire till
 *              the enemy is close, then let them have it (world.js holdFire). For a
 *              minute at most.
 *
 * The thinking per soldier is in world.js (squadThink); this only sets each squad's
 * `role` and its goal (`gx`, `gz`).
 */

const UPDATE = 2
/** Front stalled this long (s) with a squad in contact: send a flank. */
const STALL = 20
/** Between flanks (s). */
const FLANK_EVERY = 45
/** A squad down to this share of its peak, in a fight, falls back. */
const BROKEN = 0.4
/** Outnumbered (own / enemy strength) below this: ambush; above the second: back on. */
const OUTNUMBERED = 0.65
const RECOVERED = 0.85
const AMBUSH_FOR = 60

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function createCommand() {
  return { t: 0, teams: [0, 1].map(() => ({ stallT: 0, mark: null, flankT: -99 })) }
}

/** A squad's members move over to squad `to` (whose ranks they continue). */
function merge(w, from, to) {
  for (let i = 0; i < w.living.length; i += 1) {
    const s = w.living[i]
    if (s.squad !== from.i || s.squadId !== from.id) continue
    s.squad = to.i
    s.squadId = to.id
    s.rank = to.next++
    s.fireTeam = s.rank % 2
    s.legDone = 0
    s.legOf = 0
    to.n += 1
  }
  to.peak = Math.max(to.peak, to.n)
  from.used = false
  from.n = 0
}

function setRole(q, role, t, gx = 0, gz = 0) {
  q.role = role
  q.roleT = t
  q.gx = gx
  q.gz = gz
}

/** Per tick: every UPDATE s, each team's commander looks over its squads. */
export function updateCommand(w, h) {
  const C = w.command
  // (Zombie Horde: the player runs the defence.)
  if (w.zmode) return
  C.t -= h
  if (C.t > 0) return
  C.t = UPDATE
  for (let team = 0; team < 2; team += 1) commandTeam(w, team, C.teams[team])
}

function commandTeam(w, team, T) {
  const S = w.squads.list
  const mine = w.centroid[team]
  const foe = w.centroid[1 - team]
  const lx = w.obs.limitX - 3
  const lz = w.obs.limitZ - 3
  let ax = foe.x - mine.x
  let az = foe.z - mine.z
  const al = Math.hypot(ax, az) || 1
  ax /= al
  az /= al
  const px = -az
  const pz = ax
  const ratio = w.stats.alive[team] / Math.max(1, w.stats.alive[1 - team])
  const now = w.time

  // Is the enemy coming at us at all? (No point waiting in ambush for a held line.)
  let enemyComing = false
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (q.used && q.team !== team && q.order === 'attack' && q.role !== 'ambush' && q.role !== 'fallback') enemyComing = true
  }
  // Is the front moving? (Ground gained along the axis since the last mark.)
  let anyContact = false
  let flanking = false
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used || q.team !== team || q.order !== 'attack') continue
    if (q.contact) anyContact = true
    if (q.role === 'flank') flanking = true
  }
  const along = mine.x * ax + mine.z * az
  if (!anyContact || T.mark === null || along > T.mark + 4) {
    T.mark = along
    T.stallT = 0
  } else T.stallT += UPDATE

  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used || q.team !== team) continue
    if (q.order !== 'attack') {
      if (q.role !== 'assault') setRole(q, 'assault', now)
      continue
    }
    const age = now - q.roleT
    // Cut to pieces in a fight: pull back behind the line.
    if (q.role !== 'fallback' && q.contact && q.peak >= 3 && q.n <= Math.ceil(q.peak * BROKEN)) {
      setRole(q, 'fallback', now, clamp(mine.x - ax * 22, -lx, lx), clamp(mine.z - az * 22, -lz, lz))
      continue
    }
    if (q.role === 'fallback') {
      const there = Math.hypot(q.cx - q.gx, q.cz - q.gz) < 8
      if (there || age > 40) {
        // Join the nearest squad with room, else catch breath and go again.
        let best = null
        let bestD = 35 * 35
        for (let j = 0; j < S.length; j += 1) {
          const o = S[j]
          if (o === q || !o.used || o.team !== team || o.role === 'fallback' || o.n + q.n > SQUAD_SIZE) continue
          const d = (o.cx - q.cx) ** 2 + (o.cz - q.cz) ** 2
          if (d < bestD) {
            bestD = d
            best = o
          }
        }
        if (best) merge(w, q, best)
        else if (age > 8 || !there) {
          q.peak = q.n
          setRole(q, 'assault', now)
        }
      }
      continue
    }
    // Outnumbered: wait for them in cover (out of contact squads; for a while).
    if (ratio < OUTNUMBERED && enemyComing && q.role !== 'ambush' && !q.contact && q.role !== 'flank' && now > q.ambushNext) {
      setRole(q, 'ambush', now)
      q.sprung = false
      continue
    }
    if (q.role === 'ambush') {
      if (ratio > RECOVERED || age > AMBUSH_FOR || !enemyComing) {
        setRole(q, 'assault', now)
        q.ambushNext = now + AMBUSH_FOR
      }
      continue
    }
    if (q.role === 'flank') {
      // Round the side and in: done when there, or once it's in a fight.
      if (Math.hypot(q.cx - q.gx, q.cz - q.gz) < 10 || (q.contact && age > 6) || age > 60) setRole(q, 'assault', now)
      continue
    }
    if (q.role === 'reinforce') {
      if (q.contact || Math.hypot(q.cx - q.gx, q.cz - q.gz) < 10 || age > 45) setRole(q, 'assault', now)
      continue
    }
  }

  // Send a flank when the front's stuck: the squad out furthest to one side, not tied
  // up in the fight (or the least so), of a team with squads to spare.
  if (!flanking && T.stallT > STALL && now - T.flankT > FLANK_EVERY) {
    let best = null
    let bestScore = -Infinity
    let count = 0
    for (let k = 0; k < S.length; k += 1) {
      const q = S[k]
      if (!q.used || q.team !== team || q.order !== 'attack' || q.role !== 'assault' || q.n < 3) continue
      count += 1
      const side = (q.cx - mine.x) * px + (q.cz - mine.z) * pz
      const score = Math.abs(side) - (q.pinned ? 30 : 0) - (q.contact ? 10 : 0)
      if (score > bestScore) {
        bestScore = score
        best = q
      }
    }
    if (best && count >= 2) {
      const side = (best.cx - mine.x) * px + (best.cz - mine.z) * pz
      const sd = Math.abs(side) > 2 ? Math.sign(side) : (best.id % 2) * 2 - 1
      setRole(best, 'flank', now, clamp(foe.x - ax * 14 + px * sd * 32, -lx, lx), clamp(foe.z - az * 14 + pz * sd * 32, -lz, lz))
      T.flankT = now
      T.stallT = 0
    }
  }

  // Reinforcements: a squad well back and out of the fight goes to one pinned or losing.
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used || q.team !== team || q.order !== 'attack' || !q.contact) continue
    if (!(q.pinned || q.n < q.peak * 0.6)) continue
    let help = null
    let helpD = Infinity
    for (let j = 0; j < S.length; j += 1) {
      const o = S[j]
      if (o === q || !o.used || o.team !== team || o.order !== 'attack' || o.role !== 'assault' || o.contact) continue
      const d = Math.hypot(o.cx - q.cx, o.cz - q.cz)
      if (d > 20 && d < helpD) {
        helpD = d
        help = o
      }
    }
    if (help) setRole(help, 'reinforce', now, q.cx, q.cz)
  }
}
