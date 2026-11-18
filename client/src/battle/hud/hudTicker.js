import { UNIT_TYPES } from '../sim/units'
import { battle } from '../state'
import { useHud } from './hudStore'

/**
 * The 10 Hz bridge from the simulation to the HUD: copies counts and a summary of the
 * selection into the store, and only when something actually changed. This - never a
 * frame loop - is what makes the HUD re-render.
 */

function statusOf(s) {
  if (s.downed) return 'Downed'
  if (s.reloadT > 0) return 'Reloading'
  if (s.target) return 'Engaging'
  if (s.goalMode === 1 && s.animMove > 0.1) return s.order === 'flank' && !s.flankDone ? 'Flanking' : 'Moving'
  if (s.cover >= 0) return 'In cover'
  if (s.wProne > 0.5) return 'Prone'
  return 'Ready'
}

function summarise(w) {
  let count = 0
  let one = null
  const types = {}
  let team = -1
  for (const s of w.slots) {
    if (!s.used || !s.alive || !s.selected) continue
    count += 1
    one = s
    types[s.type] = (types[s.type] || 0) + 1
    team = team === -1 || team === s.team ? s.team : 2
  }
  let vehicles = 0
  for (const v of w.veh.list) {
    if (!v.used || !v.alive || !v.selected) continue
    vehicles += 1
    types[v.type] = (types[v.type] || 0) + 1
    team = team === -1 || team === v.team ? v.team : 2
  }
  if (!count && !vehicles) return null
  const soldiers = count
  count += vehicles
  const unit =
    count === 1 && soldiers === 1
      ? {
          id: one.id,
          team: one.team,
          type: one.type,
          name: UNIT_TYPES[one.type].name,
          role: UNIT_TYPES[one.type].role,
          hp: Math.max(0, Math.round(one.hp)),
          maxHp: one.maxHp,
          status: statusOf(one),
          order: one.order,
          kills: one.kills,
          range: UNIT_TYPES[one.type].range,
          damage: UNIT_TYPES[one.type].damage * UNIT_TYPES[one.type].pellets,
          wounds: { head: one.headW, torso: one.torsoW, armL: one.armL, armR: one.armR, legL: one.legL, legR: one.legR },
          bleeding: one.bleed > 0.05,
          mag: one.mag,
          magSize: UNIT_TYPES[one.type].mag,
        }
      : null
  return { count, team, types, unit }
}

export function startHudTicker() {
  let lastStats = ''
  let lastSel = ''
  const id = setInterval(() => {
    const w = battle.world
    if (!w) return
    const st = w.stats
    const statsKey = `${st.alive[0]},${st.alive[1]},${st.lost[0]},${st.lost[1]},${st.downed[0]},${st.downed[1]}`
    if (statsKey !== lastStats) {
      lastStats = statsKey
      useHud.setState({ stats: { alive: [...st.alive], lost: [...st.lost], downed: [...st.downed] } })
    }
    const sel = summarise(w)
    const selKey = JSON.stringify(sel)
    if (selKey !== lastSel) {
      lastSel = selKey
      useHud.setState({ selection: sel })
    }
  }, 100)
  return () => clearInterval(id)
}
