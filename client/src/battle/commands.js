import { sfx } from '../audio/sfx'
import { clearAll, clearSelection, deleteSelected, moveSelected, orderSelected, selectTeam, setSelection, spawnUnits } from './sim/world'
import { getHud } from './hud/hudStore'
import { QUICK_SQUADS } from './sim/units'
import { PRICES, restartZombies, startWave } from './sim/zombies'
import { net } from '../net/battleNet'
import { getNet, me } from '../store/net'
import { battle } from './state'

/**
 * Everything the player can do to the battle, in one place, shared by the HUD buttons,
 * the keyboard and pointer input: each call updates the simulation, plays its UI sound
 * and reports problems as a toast. In a multiplayer battle the same calls go to the
 * server instead (which checks them and answers with snapshots and toasts).
 */

/** Ids of this player's selected soldiers and vehicles (for multiplayer commands). */
function selectedIds(w) {
  const s = []
  const v = []
  for (const x of w.slots) if (x.used && x.alive && x.selected) s.push(x.id)
  for (const x of w.veh.list) if (x.used && x.alive && x.selected) v.push(x.id)
  return { s, v }
}

const isHost = () => Boolean(me()?.host)

export function placeUnits(x, z) {
  const w = battle.world
  const hud = getHud()
  if (!w || !hud.placing) return
  if (net.online()) {
    net.send('place', { key: hud.placing, x, z, count: hud.count, order: hud.order, rot: hud.buildRot })
    sfx.place()
    return
  }
  // Zombie Horde: everything costs cash, and you're always the defenders (blue).
  let count = hud.count
  const price = w.zmode ? PRICES[hud.placing] || 0 : 0
  if (w.zmode) {
    if (w.zmode.result) return
    const afford = price > 0 ? Math.floor(w.zmode.cash / price) : count
    if (afford <= 0) {
      hud.showToast(`Not enough cash - that costs $${price}`)
      sfx.error()
      return
    }
    count = Math.min(count, afford)
  }
  const team = w.zmode ? 0 : hud.team
  const { spawned, limited, info } = spawnUnits(w, hud.placing, team, x, z, count, hud.order, hud.buildRot)
  if (w.zmode && spawned) w.zmode.cash -= spawned * price
  if (spawned) sfx.place()
  if (info) hud.showToast(info, 'info')
  if (limited) {
    hud.showToast(limited)
    if (!spawned) sfx.error()
  }
}

/** Zombie Horde: start the next wave now. */
export function startWaveNow() {
  if (net.online()) {
    net.send('wave')
    sfx.order()
    return
  }
  const w = battle.world
  if (w && startWave(w)) sfx.order()
}

/** Zombie Horde: clear everything and start the run again. */
export function restartRun() {
  if (net.online()) {
    if (!isHost()) return getHud().showToast('The host restarts the run', 'info')
    net.send('restart')
    return
  }
  const w = battle.world
  if (!w || !w.zmode) return
  clearAll(w)
  restartZombies(w)
  sfx.place()
}

export function moveTo(x, z) {
  const w = battle.world
  if (!w) return
  if (net.online()) {
    const ids = selectedIds(w)
    if (!ids.s.length && !ids.v.length) return
    net.send('move', { x, z, ...ids })
    battle.moveMarker = { x, z, t: performance.now() }
    sfx.order()
    return
  }
  if (moveSelected(w, x, z)) {
    battle.moveMarker = { x, z, t: performance.now() }
    sfx.order()
  }
}

export function giveOrder(order) {
  const hud = getHud()
  hud.setOrder(order)
  if (battle.world && net.online()) net.send('order', { order, ...selectedIds(battle.world) })
  else if (battle.world) orderSelected(battle.world, order)
  sfx.toggle()
}

export function select(slots, additive, vehicles = []) {
  if (!battle.world) return
  setSelection(battle.world, slots, additive, vehicles)
  if (slots.length || vehicles.length) sfx.select()
}

export function selectAll() {
  if (!battle.world) return
  selectTeam(battle.world, getHud().team)
  sfx.select()
}

export function deselect() {
  if (battle.world) clearSelection(battle.world)
}

export function deleteSelection() {
  if (!battle.world) return
  if (net.online()) {
    const ids = selectedIds(battle.world)
    if (!ids.s.length && !ids.v.length) return getHud().showToast('Select soldiers first, then delete them', 'info')
    net.send('delete', ids)
    sfx.remove()
    return
  }
  const n = deleteSelected(battle.world)
  if (n) sfx.remove()
  else getHud().showToast('Select soldiers first, then delete them', 'info')
}

export function clearBattlefield() {
  if (!battle.world) return
  if (net.online()) {
    if (!isHost()) return getHud().showToast('Only the host can clear the battlefield')
    net.send('clear')
    sfx.remove()
    return
  }
  clearAll(battle.world)
  sfx.remove()
}


/** Drops a ready-made skirmish: the same mixed army on both sides, facing off. */
export function quickBattle() {
  const w = battle.world
  if (!w) return
  if (net.online()) {
    net.send('quick')
    sfx.place()
    return
  }
  const hud = getHud()
  let limited = null
  for (let team = 0; team < 2; team += 1) {
    const base = w.map.bases[team]
    const ahead = team === 0 ? 14 : -14
    for (const [type, n, dz] of QUICK_SQUADS) {
      const r = spawnUnits(w, type, team, base.x + ahead, base.z + dz, n, hud.order)
      if (r.limited) limited = r.limited
    }
  }
  sfx.place()
  if (limited) hud.showToast(limited, 'info')
}

/** Speed / pause: local offline; the host's call in multiplayer (everyone shares a clock). */
export function setSpeedCmd(speed) {
  const hud = getHud()
  if (net.online()) {
    if (!isHost()) return hud.showToast('Only the host can change the speed', 'info')
    net.send('speed', { speed, paused: false })
    return
  }
  hud.setSpeed(speed)
}

export function togglePauseCmd() {
  const hud = getHud()
  if (net.online()) {
    if (!isHost()) return hud.showToast('Only the host can pause', 'info')
    net.send('speed', { speed: hud.speed, paused: !hud.paused })
    return
  }
  hud.togglePause()
}

/** Which team you command: yours to pick offline; asked of the server in multiplayer. */
export function setTeamCmd(team) {
  if (net.online()) {
    if (getNet().mode !== 'sandbox') return
    net.send('team', team)
    return
  }
  getHud().setTeam(team)
}

/** Points the camera at the selection (or the middle of the map). */
export function focusSelection() {
  const w = battle.world
  if (!w) return
  let x = 0
  let z = 0
  let n = 0
  for (const s of w.slots) {
    if (!s.used || !s.alive || !s.selected) continue
    x += s.x
    z += s.z
    n += 1
  }
  const g = battle.view.goal
  if (n) {
    g.tx = x / n
    g.tz = z / n
    g.dist = Math.min(g.dist, 30)
  } else {
    g.tx = 0
    g.tz = 8
  }
}
