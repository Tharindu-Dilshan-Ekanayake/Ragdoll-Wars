import { Vector3 } from 'three'

import { sfx } from '../audio/sfx'
import { getBloxityState } from '../bloxity/store'
import { UNIT_ORDER } from './sim/units'
import { anySelected } from './sim/world'
import {
  deleteSelection,
  deselect,
  focusSelection,
  giveOrder,
  moveTo,
  placeUnits,
  select,
  selectAll,
} from './commands'
import { getHud } from './hud/hudStore'
import { battle } from './state'

/**
 * Mouse, touch and keyboard on the battle canvas.
 *
 * Mouse: left click places units (when a unit card is active), selects a soldier, or
 * sends the selection there; left drag draws a selection box; right drag orbits;
 * middle drag pans; the wheel zooms towards the cursor.
 * Touch: tap = left click; one-finger drag pans (or draws a box in select mode);
 * pinch zooms, twist orbits, two-finger drag pans.
 *
 * Nothing here re-renders React per pointer move: the selection box is a DOM element
 * styled directly, and the hover point is written into `battle`.
 */

const CLICK_MOVE = 8
const v1 = new Vector3()
const v2 = new Vector3()
const proj = new Vector3()

/** Ground point (y = 0) under client pixel (cx, cy), written to out; false if none. */
export function groundAt(cx, cy, out) {
  const cam = battle.camera
  const canvas = battle.canvas
  if (!cam || !canvas) return false
  const r = canvas.getBoundingClientRect()
  const nx = ((cx - r.left) / r.width) * 2 - 1
  const ny = -((cy - r.top) / r.height) * 2 + 1
  v1.set(nx, ny, -1).unproject(cam)
  v2.set(nx, ny, 1).unproject(cam)
  const dy = v2.y - v1.y
  if (Math.abs(dy) < 1e-6) return false
  const t = -v1.y / dy
  if (t < 0) return false
  out.x = v1.x + (v2.x - v1.x) * t
  out.z = v1.z + (v2.z - v1.z) * t
  return true
}

/** Screen position (client px) of world point, or null if behind the camera. */
function toScreen(x, y, z, rect) {
  proj.set(x, y, z).project(battle.camera)
  if (proj.z > 1) return null
  return { x: rect.left + ((proj.x + 1) / 2) * rect.width, y: rect.top + ((1 - proj.y) / 2) * rect.height }
}

/** Nearest living soldier to the pointer within `radius` px, or null. */
function pickSoldier(cx, cy, radius) {
  const w = battle.world
  if (!w || !battle.camera) return null
  const rect = battle.canvas.getBoundingClientRect()
  let best = null
  let bestD = radius * radius
  for (const s of w.slots) {
    if (!s.used || !s.alive) continue
    const p = toScreen(s.x, (s.wProne > 0.5 || s.downed ? 0.3 : 1.0) + s.dropY, s.z, rect)
    if (!p) continue
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

/** Nearest living vehicle under the pointer (its size on screen counts), or null. */
function pickVehicle(cx, cy, radius) {
  const w = battle.world
  if (!w || !battle.camera) return null
  const rect = battle.canvas.getBoundingClientRect()
  let best = null
  let bestD = Infinity
  for (const v of w.veh.list) {
    if (!v.used || !v.alive) continue
    const c = toScreen(v.x, v.y + v.aimH, v.z, rect)
    const edge = toScreen(v.x + v.spec.radius, v.y + v.aimH, v.z, rect)
    if (!c || !edge) continue
    const r = Math.max(radius, Math.hypot(edge.x - c.x, edge.y - c.y))
    const d = Math.hypot(c.x - cx, c.y - cy)
    if (d < r && d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}

function boxSelect(x0, y0, x1, y1, additive) {
  const w = battle.world
  if (!w) return
  const rect = battle.canvas.getBoundingClientRect()
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const team = getHud().team
  const picked = []
  for (const s of w.slots) {
    if (!s.used || !s.alive || s.team !== team || s.downed) continue
    const p = toScreen(s.x, 0.9, s.z, rect)
    if (p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) picked.push(s.slot)
  }
  const vehicles = []
  for (const v of w.veh.list) {
    if (!v.used || !v.alive || v.team !== team) continue
    const p = toScreen(v.x, v.y + v.aimH, v.z, rect)
    if (p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) vehicles.push(v.slot)
  }
  select(picked, additive, vehicles)
}

function click(cx, cy, additive, touch) {
  const hud = getHud()
  const ground = { x: 0, z: 0 }
  const hasGround = groundAt(cx, cy, ground)
  if (hud.placing) {
    if (hasGround) placeUnits(ground.x, ground.z)
    return
  }
  const hit = pickSoldier(cx, cy, touch ? 38 : 24)
  if (hit) {
    select([hit.slot], additive)
    return
  }
  const vhit = pickVehicle(cx, cy, touch ? 30 : 18)
  if (vhit) {
    select([], additive, [vhit.slot])
    return
  }
  const w = battle.world
  if (w && anySelected(w) && hasGround) moveTo(ground.x, ground.z)
  else deselect()
}

/** World units per screen pixel at the camera's focus (for drag panning). */
function worldPerPixel() {
  const cam = battle.camera
  const h = battle.canvas?.clientHeight || 800
  return (2 * battle.view.dist * Math.tan((cam.fov * Math.PI) / 360)) / h
}

function pan(dxPx, dyPx) {
  const v = battle.view
  const k = worldPerPixel()
  const s = Math.sin(v.yaw)
  const c = Math.cos(v.yaw)
  // Grab the ground: it follows the pointer. Screen right on the ground is (cos, -sin),
  // screen up (away from the camera) is (-sin, -cos).
  v.goal.tx -= (dxPx * c + dyPx * s) * k
  v.goal.tz -= (-dxPx * s + dyPx * c) * k
  v.tx = v.goal.tx
  v.tz = v.goal.tz
}

export function zoomBy(factor, cx, cy) {
  const v = battle.view
  const before = v.goal.dist
  v.goal.dist = Math.min(140, Math.max(6, v.goal.dist * factor))
  // Towards the cursor: move the focus along with the zoom.
  if (cx !== undefined) {
    const g = { x: 0, z: 0 }
    if (groundAt(cx, cy, g)) {
      const t = 1 - v.goal.dist / before
      v.goal.tx += (g.x - v.goal.tx) * t
      v.goal.tz += (g.z - v.goal.tz) * t
    }
  }
}

export function attachInput(canvas, boxEl) {
  const pointers = new Map()
  let gesture = null
  let drag = null

  const showBox = (x0, y0, x1, y1) => {
    if (!boxEl) return
    const r = canvas.getBoundingClientRect()
    boxEl.style.display = 'block'
    boxEl.style.left = `${Math.min(x0, x1) - r.left}px`
    boxEl.style.top = `${Math.min(y0, y1) - r.top}px`
    boxEl.style.width = `${Math.abs(x1 - x0)}px`
    boxEl.style.height = `${Math.abs(y1 - y0)}px`
  }
  const hideBox = () => {
    if (boxEl) boxEl.style.display = 'none'
  }

  const startGesture = () => {
    const [a, b] = [...pointers.values()]
    gesture = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      startDist: battle.view.goal.dist,
      startYaw: battle.view.goal.yaw,
    }
    drag = null
    hideBox()
  }

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const touch = e.pointerType === 'touch'
    if (touch && pointers.size === 2) {
      startGesture()
      return
    }
    if (pointers.size > 1) return
    let mode = 'click'
    if (!touch && e.button === 2) mode = 'orbit'
    else if (!touch && e.button === 1) mode = 'pan'
    drag = { id: e.pointerId, mode, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, touch, shift: e.shiftKey }
    if (mode === 'pan' || mode === 'orbit') e.preventDefault()
  }

  const onMove = (e) => {
    const p = pointers.get(e.pointerId)
    if (p) {
      p.x = e.clientX
      p.y = e.clientY
    }
    // Hover point for the placement ghost.
    if (e.pointerType !== 'touch' || p) {
      const g = battle.hover || { x: 0, z: 0 }
      battle.hover = groundAt(e.clientX, e.clientY, g) ? g : null
    }
    if (gesture && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const v = battle.view
      v.goal.dist = Math.min(140, Math.max(6, (gesture.startDist * gesture.dist) / dist))
      v.goal.yaw = gesture.startYaw - (angle - gesture.angle)
      pan(mx - gesture.mx, my - gesture.my)
      gesture.mx = mx
      gesture.my = my
      return
    }
    if (!drag || drag.id !== e.pointerId) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > CLICK_MOVE) {
      drag.moved = true
      if (drag.mode === 'click') {
        const hud = getHud()
        if (drag.touch && !hud.selectMode) drag.mode = 'pan'
        else if (hud.placing) drag.mode = drag.touch ? 'pan' : 'none'
        else drag.mode = 'box'
      }
    }
    if (!drag.moved) return
    const sens = getBloxityState().cameraSensitivity || 1
    if (drag.mode === 'orbit') {
      const g = battle.view.goal
      g.yaw -= dx * 0.006 * sens
      g.pitch = Math.min(1.42, Math.max(0.3, g.pitch + dy * 0.005 * sens))
    } else if (drag.mode === 'pan') {
      pan(dx, dy)
    } else if (drag.mode === 'box') {
      showBox(drag.x0, drag.y0, e.clientX, e.clientY)
    }
  }

  const onUp = (e) => {
    pointers.delete(e.pointerId)
    if (gesture) {
      if (pointers.size < 2) gesture = null
      return
    }
    if (!drag || drag.id !== e.pointerId) return
    const d = drag
    drag = null
    if (!d.moved) {
      if (d.mode === 'click') click(e.clientX, e.clientY, d.shift || e.shiftKey, d.touch)
      else if (d.mode === 'orbit') {
        // Right click: cancel placement, else clear the selection.
        const hud = getHud()
        if (hud.placing) hud.cancelPlacing()
        else deselect()
      }
      return
    }
    if (d.mode === 'box') {
      hideBox()
      boxSelect(d.x0, d.y0, e.clientX, e.clientY, d.shift || e.shiftKey)
    }
  }

  const onCancel = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) gesture = null
    if (drag && drag.id === e.pointerId) {
      drag = null
      hideBox()
    }
  }

  const onLeave = () => {
    battle.hover = null
  }

  const onWheel = (e) => {
    e.preventDefault()
    const k = Math.exp(e.deltaY * 0.0012)
    zoomBy(k, e.clientX, e.clientY)
  }

  const onContext = (e) => e.preventDefault()

  const typing = (e) => e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')

  const onKeyDown = (e) => {
    if (typing(e)) return
    const hud = getHud()
    const k = e.key.toLowerCase()
    battle.view.keys.add(k)
    if (hud.panel) {
      if (k === 'escape') hud.setPanel(null)
      return
    }
    if (k >= '0' && k <= '9') {
      const type = UNIT_ORDER[(Number(k) + 9) % 10]
      if (type) {
        if (hud.dockTab !== 'units') hud.setDockTab('units')
        hud.setPlacing(type)
        sfx.toggle()
      }
      return
    }
    if (k === 'escape') {
      if (hud.placing) hud.cancelPlacing()
      else deselect()
    } else if (k === ' ') {
      e.preventDefault()
      hud.togglePause()
      sfx.toggle()
    } else if (k === 'r' && hud.dockTab === 'build') {
      hud.rotateBuild()
      sfx.toggle()
    } else if (k === 'tab') {
      e.preventDefault()
      hud.setTeam(1 - hud.team)
      sfx.toggle()
    } else if (k === 'delete' || k === 'backspace') {
      deleteSelection()
    } else if (k === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      selectAll()
    } else if (k === 'z') giveOrder('attack')
    else if (k === 'x') giveOrder('hold')
    else if (k === 'c') giveOrder('flank')
    else if (k === 'f') focusSelection()
    else if (k === 'h' || k === '?') hud.setPanel('help')
    else if (k === '=' || k === '+') zoomBy(0.8)
    else if (k === '-') zoomBy(1.25)
  }
  const onKeyUp = (e) => battle.view.keys.delete(e.key.toLowerCase())
  const onBlur = () => battle.view.keys.clear()

  canvas.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContext)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  return () => {
    canvas.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContext)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  }
}
