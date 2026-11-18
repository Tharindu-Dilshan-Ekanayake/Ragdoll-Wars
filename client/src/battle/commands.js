import { sfx } from '../audio/sfx'
import { clearAll, clearSelection, deleteSelected, moveSelected, orderSelected, selectTeam, setSelection, spawnUnits } from './sim/world'
import { getHud } from './hud/hudStore'
import { battle } from './state'

/**
 * Everything the player can do to the battle, in one place, shared by the HUD buttons,
 * the keyboard and pointer input: each call updates the simulation, plays its UI sound
 * and reports problems as a toast.
 */

export function placeUnits(x, z) {
  const w = battle.world
  const hud = getHud()
  if (!w || !hud.placing) return
  const { spawned, limited, info } = spawnUnits(w, hud.placing, hud.team, x, z, hud.count, hud.order)
  if (spawned) sfx.place()
  if (info) hud.showToast(info, 'info')
  if (limited) {
    hud.showToast(limited)
    if (!spawned) sfx.error()
  }
}

export function moveTo(x, z) {
  const w = battle.world
  if (!w) return
  if (moveSelected(w, x, z)) {
    battle.moveMarker = { x, z, t: performance.now() }
    sfx.order()
  }
}

export function giveOrder(order) {
  const hud = getHud()
  hud.setOrder(order)
  if (battle.world) orderSelected(battle.world, order)
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
  const n = deleteSelected(battle.world)
  if (n) sfx.remove()
  else getHud().showToast('Select soldiers first, then delete them', 'info')
}

export function clearBattlefield() {
  if (!battle.world) return
  clearAll(battle.world)
  sfx.remove()
}

const QUICK_SQUADS = [
  ['rifle', 5, -6],
  ['smg', 3, 6],
  ['mg', 1, -14],
  ['sniper', 1, 14],
  ['shotgun', 2, 0],
  ['flame', 1, 2],
  ['rocket', 1, -10],
  ['medic', 2, 10],
  ['mortar', 1, 24],
  ['rifle', 4, -22],
]

/** Drops a ready-made skirmish: the same mixed army on both sides, facing off. */
export function quickBattle() {
  const w = battle.world
  if (!w) return
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
