import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'

import { getBloxityState } from '../bloxity/store'
import { addFrameHook, PHASE } from '../battle/state'
import { lobby, LOOK_HEIGHT } from './lobbyState'

/**
 * Third-person orbit camera behind your avatar.
 *
 * Mouse: drag (either button) orbits, wheel zooms. Touch: one-finger drag on the view
 * orbits (the joystick is its own element over the bottom-left), pinch zooms. Drag speed
 * follows the Boxity camera_sensitivity setting.
 */

const MIN_DISTANCE = 3.5
const MAX_DISTANCE = 20
const MIN_PITCH = -0.05
const MAX_PITCH = 1.25

const _desired = new Vector3()
const _target = new Vector3()
const _look = new Vector3()

export default function FollowCamera() {
  const get = useThree((s) => s.get)

  useEffect(() => {
    const el = get().gl.domElement
    el.style.touchAction = 'none'
    const pointers = new Map()
    let pinch = 0
    const orbit = lobby.camera

    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture?.(e.pointerId)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e) => {
      const last = pointers.get(e.pointerId)
      if (!last) return
      if (pointers.size >= 2) {
        last.x = e.clientX
        last.y = e.clientY
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance - (d - pinch) * 0.04))
        pinch = d
        return
      }
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last.x = e.clientX
      last.y = e.clientY
      const k = (e.pointerType === 'touch' ? 0.007 : 0.005) * (getBloxityState().cameraSensitivity || 1)
      orbit.yaw -= dx * k
      orbit.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, orbit.pitch + dy * k))
    }
    const onUp = (e) => {
      pointers.delete(e.pointerId)
      el.releasePointerCapture?.(e.pointerId)
    }
    const onWheel = (e) => {
      e.preventDefault()
      orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance + e.deltaY * 0.01))
    }
    const onContext = (e) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContext)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContext)
    }
  }, [get])

  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state, rawDelta) => {
        const camera = state.camera
        const delta = Math.min(rawDelta, 0.05)
        const p = lobby.player
        const o = lobby.camera
        const intro = lobby.intro
        if (intro.running && intro.camera === 'fixed') {
          // The arrival's cinematic shot (Arrival.jsx works it out each frame).
          _desired.set(intro.camPos.x, intro.camPos.y, intro.camPos.z)
          _target.set(intro.camLook.x, intro.camLook.y, intro.camLook.z)
        } else {
          _target.set(p.x, p.y + LOOK_HEIGHT, p.z)
          const horizontal = Math.cos(o.pitch) * o.distance
          _desired.set(_target.x + Math.sin(o.yaw) * horizontal, Math.max(_target.y + Math.sin(o.pitch) * o.distance, 0.5), _target.z + Math.cos(o.yaw) * horizontal)
        }
        if (o.snap) {
          o.snap = false
          camera.position.copy(_desired)
          _look.copy(_target)
        }
        camera.position.lerp(_desired, 1 - Math.exp(-10 * delta))
        _look.lerp(_target, 1 - Math.exp(-14 * delta))
        camera.lookAt(_look)
        camera.updateMatrixWorld()
      }),
    [],
  )

  return null
}
