import { useEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from 'three'

import { audioReady, startRotorSound } from '../../audio/sfx'
import { paintDust, paintHelipad } from '../../lobby/helipadTexture'
import { useQuality } from '../../store/quality'
import { buildHelicopterGeometry, MAIN_ROTOR_PIVOT, TAIL_ROTOR_PIVOT } from '../render/helicopterModel'
import { getTextures } from '../render/textures'
import { addFrameHook, battle, PHASE } from '../state'
import { helipadsOf, PAD_SIZE } from '../sim/helipads'

/**
 * Both sides' helipads, and the helicopter that flies you in to yours at the start of a
 * battle (posed by arrivalFlight.js), with its shadow, rotor wash and sound.
 *
 * Draw calls: pads 2 always; while flying, helicopter 3 + shadow 1 (+ dust 1 on presets
 * with particles). All of it is gone once the helicopter is over the horizon.
 */

const ROTOR_SPEED = 28
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export default function HeliArrival({ map }) {
  const particles = useQuality((s) => s.settings.particles)
  const heliRef = useRef(null)
  const mainRef = useRef(null)
  const tailRef = useRef(null)
  const shadowRef = useRef(null)
  const dustRef = useRef(null)

  const parts = useMemo(() => {
    const geo = buildHelicopterGeometry()
    const heliMat = new MeshLambertMaterial({ vertexColors: true })
    const padTex = paintHelipad()
    const padGeo = new PlaneGeometry(PAD_SIZE, PAD_SIZE).rotateX(-Math.PI / 2)
    const padMat = new MeshLambertMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -2 })
    const flatGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const shadowMat = new MeshBasicMaterial({ map: getTextures().blob, transparent: true, depthWrite: false })
    const dustTex = paintDust()
    const dustMat = new MeshBasicMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })
    return { geo, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat }
  }, [])
  // Each battle's pads (switching maps keeps this component).
  const pads = useMemo(() => helipadsOf(map), [map])
  useEffect(
    () => () => {
      const { geo, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat } = parts
      for (const x of [geo.body, geo.mainRotor, geo.tailRotor, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat]) x.dispose()
    },
    [parts],
  )

  useEffect(() => {
    let rotor = null
    let soundTick = 0
    let mainAngle = 0
    let tailAngle = 0
    // DRAW phase: after the walker's SIM hook has stepped the flight this frame.
    const remove = addFrameHook(PHASE.DRAW, (state, rawDelta) => {
      const d = Math.min(rawDelta, 0.05)
      const a = battle.arrival
      const h = a.heli
      const group = heliRef.current
      const shadow = shadowRef.current
      const dust = dustRef.current
      const flying = a.running && h.visible && !a.waiting
      if (group) group.visible = flying
      if (shadow) shadow.visible = false
      if (dust) dust.visible = false
      if (!flying) {
        if (rotor) {
          rotor.stop()
          rotor = null
        }
        return
      }
      group.position.set(h.x, h.y, h.z)
      group.rotation.set(h.pitch, h.yaw, h.roll)
      mainAngle = (mainAngle + ROTOR_SPEED * d) % (Math.PI * 2)
      tailAngle = (tailAngle + ROTOR_SPEED * 2.2 * d) % (Math.PI * 2)
      mainRef.current.rotation.y = mainAngle
      tailRef.current.rotation.x = tailAngle
      if (shadow) {
        const lift = clamp01(h.y / 30)
        shadow.visible = lift < 1
        shadow.position.set(h.x, 0.04, h.z)
        shadow.rotation.y = h.yaw
        shadow.scale.set(3.6 + lift * 3, 1, 10 + lift * 4)
        shadow.material.opacity = 0.95 * (1 - lift)
      }
      if (dust && a.frame) {
        const k = clamp01(1 - h.y / 7) * clamp01(1 - (Math.abs(h.x - a.frame.px) + Math.abs(h.z - a.frame.pz)) / 14)
        dust.visible = k > 0.01
        dust.position.set(h.x, 0.045, h.z)
        dust.rotation.y += d * 0.8
        const size = 8 + (1 - k) * 5 + Math.sin(a.t * 9) * 0.25
        dust.scale.set(size, 1, size)
        dust.material.opacity = 0.6 * k
      }
      // Rotor sound, panned round the camera (once audio is unlocked).
      if (!rotor && audioReady()) rotor = startRotorSound()
      soundTick += 1
      if (rotor && (soundTick & 3) === 0) {
        const cam = state.camera
        const e = cam.matrixWorld.elements
        const dx = h.x - cam.position.x
        const dy = h.y + 2 - cam.position.y
        const dz = h.z - cam.position.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        rotor.update(dist, ((dx * e[0] + dz * e[2]) / (dist + 6)) * 1.4)
      }
    })
    return () => {
      remove()
      if (rotor) rotor.stop()
    }
  }, [])

  const { geo, heliMat, padGeo, padMat, flatGeo, shadowMat, dustMat } = parts
  return (
    <>
      {pads.map((p, i) => (
        <mesh key={i} geometry={padGeo} material={padMat} position={[p.x, 0.02, p.z]} rotation-y={p.ahead > 0 ? -Math.PI / 2 : Math.PI / 2} receiveShadow />
      ))}
      <group ref={heliRef} rotation-order="YXZ" visible={false}>
        <mesh geometry={geo.body} material={heliMat} />
        <mesh ref={mainRef} geometry={geo.mainRotor} material={heliMat} position={MAIN_ROTOR_PIVOT} />
        <mesh ref={tailRef} geometry={geo.tailRotor} material={heliMat} position={TAIL_ROTOR_PIVOT} />
      </group>
      <mesh ref={shadowRef} geometry={flatGeo} material={shadowMat} renderOrder={1} visible={false} />
      {particles && <mesh ref={dustRef} geometry={flatGeo} material={dustMat} renderOrder={2} visible={false} />}
    </>
  )
}
