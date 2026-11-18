import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { attachInput } from '../input'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * The RTS camera: orbits a focus point on the ground. Input (input.js) and the HUD move
 * the goal; this eases the real view towards it every frame and adds keyboard panning
 * (WASD / arrows, Shift = faster) and turning (Q / E).
 */
export default function CameraRig({ map, selectBoxId }) {
  const get = useThree((s) => s.get)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  // Wider lens on a phone held upright, so the battlefield still fits across.
  useEffect(() => {
    const { camera } = get()
    const aspect = width / Math.max(1, height)
    camera.fov = aspect >= 1 ? 55 : Math.min(80, 55 / Math.sqrt(Math.max(0.3, aspect)))
    camera.updateProjectionMatrix()
  }, [get, width, height])

  useEffect(() => {
    const { camera, gl } = get()
    battle.camera = camera
    battle.canvas = gl.domElement
    gl.domElement.style.touchAction = 'none'
    const detach = attachInput(gl.domElement, document.getElementById(selectBoxId))
    return () => {
      detach()
      if (battle.camera === camera) battle.camera = null
      if (battle.canvas === gl.domElement) battle.canvas = null
    }
  }, [get, selectBoxId])

  useEffect(
    () =>
      addFrameHook(PHASE.CAMERA, (state, delta) => {
        // Walk mode has its own camera behind your avatar (walk/Walker.jsx).
        if (battle.walk.on) return
        const camera = state.camera
        const dt = Math.min(0.05, delta)
        const v = battle.view
        const g = v.goal
        const keys = v.keys
        if (keys.size) {
          const fast = keys.has('shift') ? 2.2 : 1
          const sp = (12 + v.dist * 0.9) * fast * dt
          const s = Math.sin(v.yaw)
          const c = Math.cos(v.yaw)
          let f = 0
          let r = 0
          if (keys.has('w') || keys.has('arrowup')) f += 1
          if (keys.has('s') || keys.has('arrowdown')) f -= 1
          if (keys.has('d') || keys.has('arrowright')) r += 1
          if (keys.has('a') || keys.has('arrowleft')) r -= 1
          if (f || r) {
            g.tx += (-s * f + c * r) * sp
            g.tz += (-c * f - s * r) * sp
          }
          if (keys.has('q')) g.yaw += 1.7 * dt
          if (keys.has('e')) g.yaw -= 1.7 * dt
        }
        const lx = map.width / 2 + 12
        const lz = map.depth / 2 + 12
        g.tx = Math.max(-lx, Math.min(lx, g.tx))
        g.tz = Math.max(-lz, Math.min(lz, g.tz))
        const k = 1 - Math.exp(-11 * dt)
        v.tx += (g.tx - v.tx) * k
        v.tz += (g.tz - v.tz) * k
        v.yaw += (g.yaw - v.yaw) * k
        v.pitch += (g.pitch - v.pitch) * k
        v.dist += (g.dist - v.dist) * k
        const cp = Math.cos(v.pitch)
        camera.position.set(v.tx + Math.sin(v.yaw) * cp * v.dist, Math.sin(v.pitch) * v.dist + 0.6, v.tz + Math.cos(v.yaw) * cp * v.dist)
        camera.lookAt(v.tx, 0.6, v.tz)
        camera.updateMatrixWorld()
      }),
    [map],
  )

  return null
}
