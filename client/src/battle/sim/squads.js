import { bark } from './barks.js'
import { UNIT_TYPES } from './units.js'

/**
 * Squads: soldiers fight in groups of up to eight under a leader, instead of each one
 * running at the nearest enemy.
 *
 * - Out of contact the squad moves in a wedge behind its leader, a few metres apart,
 *   and the leader waits for stragglers.
 * - In contact (someone in the squad can see the enemy) it bounds: one fire team dashes
 *   to the next cover while the other stays put and shoots (overwatch), then they swap.
 * - Pinned (most of the squad under heavy fire), nobody moves up: they get down and
 *   shoot back until the fire slackens.
 *
 * Who joins: riflemen, SMGs, shotguns, rockets, flamers, pistols. Snipers and machine
 * gunners set up on posts of their own (world.js postThink), mortar crews and medics work
 * on their own, and so does anyone up on a rampart.
 * Soldiers join on landing (the nearest squad of their team within 14 m with room, or a
 * new one), and again after a revive or a loaded save. The thinking per soldier is in
 * world.js (squadThink); this keeps the squads' shared state, twice a second.
 */

export const MAX_SQUADS = 40
export const SQUAD_SIZE = 8
const JOIN_RADIUS = 14
/** A squad stays in contact this long after the last sighting. */
const CONTACT_HOLD = 6
/** Mean suppression above which the squad is pinned. */
const PINNED = 0.5
/** Seconds a squad stays pinned before it pushes a leg on under fire. */
const PINNED_FOR = 6
const UPDATE = 0.5

const rand = Math.random

export function createSquads() {
  return {
    list: Array.from({ length: MAX_SQUADS }, (_, i) => ({
      i,
      used: false,
      id: 0,
      team: 0,
      n: 0,
      sx: 0,
      sz: 0,
      seen: false,
      leaderOk: false,
      bestRank: 0,
      bestSlot: -1,
      nearD: 0,
      next: 0,
      leader: -1,
      leaderRank: 0,
      cx: 0,
      cz: 0,
      /** Heading of the advance (unit): towards the enemy. */
      hx: 1,
      hz: 0,
      contactT: -99,
      contact: false,
      pinned: false,
      pinnedT: 0,
      supp: 0,
      /** Which fire team is moving (0/1), the leg number, and time left on this leg. */
      mover: 0,
      legId: 1,
      legT: 0,
      movers: 0,
      moversDone: 0,
      riflemen: 0,
      wedgeBack: 0,
      /** Where the enemy is, as the squad last saw it. */
      ex: 0,
      ez: 0,
      /** The commander's job for it (commander.js), since when, and where to. */
      role: 'assault',
      roleT: 0,
      gx: 0,
      gz: 0,
      /** Most members it's had (to tell when it's been cut up), and its leader's order. */
      peak: 0,
      order: 'attack',
      /** An ambush (or a held line) that's opened fire. */
      sprung: false,
      /** No new ambush before this (commander.js). */
      ambushNext: 0,
      /** No new "contact" call before this. */
      callT: 0,
    })),
    nextId: 1,
    t: 0,
  }
}

/** Whether soldier `s` of `type` fights in a squad (not support, not on a wall). */
export function squadable(s, type) {
  return !(type.indirect || type.crew || type.medic || type.unarmed || type.zombieAI || type.key === 'sniper' || type.key === 'mg' || s.loaderOf >= 0 || s.deck >= 0)
}

/** Takes `s` out of its squad (a slot reused, a soldier removed). */
export function leaveSquad(s) {
  s.squad = -1
  s.squadId = 0
}

/** Puts `s` in the nearest squad of its team with room, or a new one. */
function joinSquad(w, s) {
  const S = w.squads.list
  let best = null
  let bestD = JOIN_RADIUS * JOIN_RADIUS
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used || q.team !== s.team || q.n >= SQUAD_SIZE) continue
    const d2 = (q.cx - s.x) ** 2 + (q.cz - s.z) ** 2
    if (d2 < bestD) {
      bestD = d2
      best = q
    }
  }
  if (!best) {
    best = S.find((q) => !q.used)
    if (!best) return
    best.used = true
    best.id = w.squads.nextId++
    best.team = s.team
    best.n = 0
    best.next = 0
    best.leader = s.slot
    best.leaderRank = 0
    best.cx = s.x
    best.cz = s.z
    best.contactT = -99
    best.contact = false
    best.pinned = false
    best.pinnedT = 0
    best.role = 'assault'
    best.roleT = w.time
    best.peak = 0
    best.order = s.order
    best.sprung = false
    best.ambushNext = 0
    best.callT = 0
    best.mover = 0
    best.legId = 1
    best.legT = 0
    // (Mid-update: the tallies this pass adds to.)
    best.sx = 0
    best.sz = 0
    best.supp = 0
    best.movers = 0
    best.moversDone = 0
    best.riflemen = 0
    best.seen = false
    best.leaderOk = false
    best.bestRank = Infinity
    best.bestSlot = -1
    best.nearD = Infinity
  }
  s.squad = best.i
  s.squadId = best.id
  s.rank = best.next++
  // Alternate fire teams; the machine gunner holds the base of fire.
  s.fireTeam = UNIT_TYPES[s.type].key === 'mg' ? 1 - best.mover : s.rank % 2
  s.legDone = 0
  s.legOf = 0
  // (Counted in by the update that called this.)
}

/** The squad `s` belongs to, or null (and tidies a stale reference). */
export function squadOf(w, s) {
  if (s.squad < 0) return null
  const q = w.squads.list[s.squad]
  if (!q.used || q.id !== s.squadId) {
    leaveSquad(s)
    return null
  }
  return q
}

/**
 * Per tick: twice a second, recount the squads, pick leaders, decide contact and pinned,
 * and swap the bounding fire teams; new arrivals join a squad.
 */
export function updateSquads(w, h) {
  const SQ = w.squads
  SQ.t -= h
  if (SQ.t > 0) return
  SQ.t = UPDATE
  const S = SQ.list
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used) continue
    q.n = 0
    q.sx = 0
    q.sz = 0
    q.supp = 0
    q.movers = 0
    q.moversDone = 0
    q.riflemen = 0
    q.seen = false
    q.leaderOk = false
    q.bestRank = Infinity
    q.bestSlot = -1
    q.nearD = Infinity
  }
  const living = w.living
  for (let i = 0; i < living.length; i += 1) {
    const s = living[i]
    if (s.dropY > 0 || s.downed) continue
    const type = UNIT_TYPES[s.type]
    if (!squadable(s, type)) {
      if (s.squad >= 0) leaveSquad(s)
      continue
    }
    let q = squadOf(w, s)
    if (!q) {
      joinSquad(w, s)
      q = squadOf(w, s)
      if (!q) continue
    }
    q.n += 1
    q.sx += s.x
    q.sz += s.z
    q.supp += s.suppress
    if (s.slot === q.leader) {
      q.leaderOk = true
      q.order = s.order
    }
    if (s.rank < q.bestRank) {
      q.bestRank = s.rank
      q.bestSlot = s.slot
    }
    if (s.target && !s.target.isVehicle) {
      q.seen = true
      const d = (s.target.x - s.x) ** 2 + (s.target.z - s.z) ** 2
      if (d < q.nearD) {
        q.nearD = d
        q.ex = s.target.x
        q.ez = s.target.z
      }
    } else if (s.target) q.seen = true
    if (type.key !== 'mg') q.riflemen += 1
    if (s.fireTeam === q.mover && type.key !== 'mg') {
      q.movers += 1
      if (s.legDone === q.legId) q.moversDone += 1
    }
  }
  for (let k = 0; k < S.length; k += 1) {
    const q = S[k]
    if (!q.used) continue
    if (q.n === 0) {
      q.used = false
      continue
    }
    q.cx = q.sx / q.n
    q.cz = q.sz / q.n
    q.supp /= q.n
    if (q.n > q.peak) q.peak = q.n
    // How far the wedge's middle trails its leader (WEDGE_GAP 3.6 m per row).
    let back = 0
    for (let r = 1; r < q.n; r += 1) back += Math.ceil(r / 2) * 3.6
    q.wedgeBack = back / q.n
    if (!q.leaderOk) {
      q.leader = q.bestSlot
      q.leaderRank = q.bestRank
      const l = w.slots[q.leader]
      if (l) q.order = l.order
    }
    // Heading: at the enemy as last seen, else at their main body.
    if (q.seen) q.contactT = w.time
    const was = q.contact
    q.contact = w.time - q.contactT < CONTACT_HOLD
    // First sight of the enemy: the leader calls it (a squad at most every 10 s).
    if (q.contact && !was && w.time > q.callT) {
      q.callT = w.time + 10
      const l = w.slots[q.leader]
      if (l && l.alive) bark(w, l, 'say_contact', true)
    }
    // Nobody in sight any more: an ambush can be laid again.
    if (!q.contact) q.sprung = false
    const foe = w.centroid[1 - q.team]
    const tx = (q.contact ? q.ex : foe.x) - q.cx
    const tz = (q.contact ? q.ez : foe.z) - q.cz
    const tl = Math.hypot(tx, tz)
    if (tl > 1) {
      q.hx = tx / tl
      q.hz = tz / tl
    }
    // Pinned: heads down and shooting back, but not for ever: after a while they push
    // on a leg under fire anyway (and may be pinned again after it).
    if (q.contact && q.supp > PINNED) q.pinnedT += UPDATE
    else q.pinnedT = 0
    q.pinned = q.contact && q.supp > PINNED && q.pinnedT < PINNED_FOR
    // Bounding: the movers have all made their dash (or ran out of time): swap.
    if (q.contact && !q.pinned) {
      q.legT -= UPDATE
      if (q.legT <= 0 || q.movers === 0 || q.moversDone >= q.movers) {
        q.mover = 1 - q.mover
        q.legId += 1
        q.legT = 7 + rand() * 3
        if (q.pinnedT >= PINNED_FOR) q.pinnedT = 0
      }
    }
  }
}
