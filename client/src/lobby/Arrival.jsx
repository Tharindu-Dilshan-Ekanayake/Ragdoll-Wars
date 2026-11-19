import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from 'three'

import { audioReady, startRotorSound } from '../audio/sfx'
import { buildHelicopterGeometry, MAIN_ROTOR_PIVOT, TAIL_ROTOR_PIVOT } from '../battle/render/helicopterModel'
import { getTextures } from '../battle/render/textures'
import { addFrameHook, PHASE } from '../battle/state'
import { useQuality } from '../store/quality'
import { ARRIVAL, cinematicCamera, DROP, heliPose, ROTOR_SPEED, scriptPlayer, smooth } from './flightPath'
import { canvas, paintDust, paintHelipad, texture } from './helipadTexture'
import { HELIPAD, WINDSOCK } from './seaFort'
import { CAMERA_HOME, lobby, LOOK_HEIGHT } from './lobbyState'

/**
 * The helipad in the middle of the Sea Fort's hub and the helicopter that flies you in.
 *
 * One frame hook (CAMERA phase: before your controller and the follow camera) plays the
 * flight from flightPath.js: poses the helicopter and spins its rotors, moves you while
 * you're a passenger, aims the cinematic camera and then swings it round behind you,
 * and pans the rotor sound. Once the helicopter is over the hills it's hidden and the
 * hook only waves the windsock.
 *
 * Draw calls: pad 1 + windsock 1 always; while flying, helicopter 3 + shadow 1
 * (+ rotor-wash dust 1 on presets with particles).
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const heli = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, visible: false }

/** Orange and white bands for the windsock. */
function paintSock() {
  const [c, g] = canvas(8, 64)
  for (let i = 0; i < 5; i += 1) {
    g.fillStyle = i % 2 ? '#f4f1ea' : '#ff7a12'
    g.fillRect(0, (i * 64) / 5, 8, 64 / 5 + 1)
  }
  return texture(c)
}

/** Stops the flight's scripting and gives you the controls. */
function release(skipped) {
  const intro = lobby.intro
  if (!intro.playerScripted) return
  const p = lobby.player
  if (skipped) {
    Object.assign(p, { x: DROP.x, y: 0, z: DROP.z, yaw: Math.PI, speed: 0, grounded: true, salute: 0 })
    lobby.camera.snap = true
  }
  intro.playerScripted = false
  intro.showPlayer = true
  intro.camera = 'follow'
  Object.assign(lobby.camera, { yaw: 0, pitch: CAMERA_HOME.pitch, distance: CAMERA_HOME.distance })
}

export default function Arrival() {
  const particles = useQuality((s) => s.settings.particles)
  const heliRef = useRef(null)
  const mainRef = useRef(null)
  const tailRef = useRef(null)
  const shadowRef = useRef(null)
  const dustRef = useRef(null)
  const sockRef = useRef(null)
  const sockClothRef = useRef(null)

  const parts = useMemo(() => {
    const geo = buildHelicopterGeometry()
    const heliMat = new MeshLambertMaterial({ vertexColors: true })
    const padTex = paintHelipad()
    const padGeo = new PlaneGeometry(HELIPAD.size, HELIPAD.size).rotateX(-Math.PI / 2)
    const padMat = new MeshLambertMaterial({ map: padTex })
    const flatGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const shadowMat = new MeshBasicMaterial({ map: getTextures().blob, transparent: true, depthWrite: false })
    const dustTex = paintDust()
    const dustMat = new MeshBasicMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })
    const sockTex = paintSock()
    // Wide mouth at the pole, narrow tail along +X.
    const sockGeo = new CylinderGeometry(0.11, 0.26, 1.5, 10, 1, true).rotateZ(-Math.PI / 2).translate(0.75, 0, 0)
    const sockMat = new MeshLambertMaterial({ map: sockTex, side: DoubleSide })
    return { geo, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat, sockTex, sockGeo, sockMat }
  }, [])
  useEffect(
    () => () => {
      const { geo, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat, sockTex, sockGeo, sockMat } = parts
      for (const x of [geo.body, geo.mainRotor, geo.tailRotor, heliMat, padTex, padGeo, padMat, flatGeo, shadowMat, dustTex, dustMat, sockTex, sockGeo, sockMat]) x.dispose()
    },
    [parts],
  )

  useEffect(() => {
    let rotor = null
    let soundTick = 0
    let mainAngle = 0
    let tailAngle = 0
    const remove = addFrameHook(PHASE.CAMERA, (state, rawDelta) => {
      const d = Math.min(rawDelta, 0.05)
      const intro = lobby.intro
      const group = heliRef.current

      if (intro.running) {
        if (intro.skip) {
          intro.skip = false
          if (intro.t < ARRIVAL.out) {
            // Still aboard: cut straight to standing on the ground, the helicopter leaving.
            intro.t = Math.max(intro.t, ARRIVAL.skipTo)
            release(true)
          } else release(false)
        }
        if (!intro.waiting) intro.t += d
        const t = intro.t
        heliPose(t, heli)

        // The helicopter, its rotors, shadow and dust.
        if (group) {
          group.visible = heli.visible
          group.position.set(heli.x, heli.y, heli.z)
          group.rotation.set(heli.pitch, heli.yaw, heli.roll)
          mainAngle = (mainAngle + ROTOR_SPEED * d) % (Math.PI * 2)
          tailAngle = (tailAngle + ROTOR_SPEED * 2.2 * d) % (Math.PI * 2)
          if (mainRef.current) mainRef.current.rotation.y = mainAngle
          if (tailRef.current) tailRef.current.rotation.x = tailAngle
        }
        const shadow = shadowRef.current
        if (shadow) {
          const lift = clamp01(heli.y / 30)
          shadow.visible = heli.visible && lift < 1
          shadow.position.set(heli.x, 0.03, heli.z)
          shadow.rotation.y = heli.yaw
          shadow.scale.set(3.6 + lift * 3, 1, 10 + lift * 4)
          shadow.material.opacity = 0.95 * (1 - lift)
        }
        const dust = dustRef.current
        if (dust) {
          const k = heli.visible ? clamp01(1 - heli.y / 7) * clamp01(1 - (Math.abs(heli.x - HELIPAD.x) + Math.abs(heli.z - HELIPAD.z)) / 14) : 0
          dust.visible = k > 0.01
          dust.position.set(heli.x, 0.035, heli.z)
          dust.rotation.y += d * 0.8
          const size = 8 + (1 - k) * 5 + Math.sin(t * 9) * 0.25
          dust.scale.set(size, 1, size)
          dust.material.opacity = 0.6 * k
        }

        // You, while you're a passenger.
        if (intro.playerScripted) {
          if (t >= ARRIVAL.control) release(false)
          else intro.showPlayer = scriptPlayer(t, lobby.player, intro)
        }

        // The camera: a fixed cinematic shot until you're out, then an orbit that swings
        // round from wherever that shot was to behind you.
        if (intro.playerScripted) {
          if (t < ARRIVAL.out) {
            intro.camera = 'fixed'
            cinematicCamera(t, heli, intro.camPos, intro.camLook)
          } else {
            const p = lobby.player
            if (intro.camera === 'fixed') {
              const c = state.camera.position
              const dx = c.x - p.x
              const dy = c.y - (p.y + LOOK_HEIGHT)
              const dz = c.z - p.z
              const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz))
              intro.from.yaw = Math.atan2(dx, dz)
              intro.from.pitch = Math.asin(dy / dist)
              intro.from.distance = dist
              intro.camera = 'orbit'
            }
            const k = smooth(ARRIVAL.out, ARRIVAL.out + ARRIVAL.sweep, t)
            const o = lobby.camera
            o.yaw = intro.from.yaw * (1 - k)
            o.pitch = intro.from.pitch + (CAMERA_HOME.pitch - intro.from.pitch) * k
            o.distance = intro.from.distance + (CAMERA_HOME.distance - intro.from.distance) * k
          }
        }

        // Rotor sound, panned around the camera (only once audio is unlocked).
        if (heli.visible) {
          if (!rotor && audioReady()) rotor = startRotorSound()
          soundTick += 1
          if (rotor && (soundTick & 3) === 0) {
            const cam = state.camera
            const e = cam.matrixWorld.elements
            const dx = heli.x - cam.position.x
            const dy = heli.y + 2 - cam.position.y
            const dz = heli.z - cam.position.z
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            rotor.update(dist, ((dx * e[0] + dz * e[2]) / (dist + 6)) * 1.4)
          }
        } else if (rotor) {
          rotor.stop()
          rotor = null
        }
        if (t >= ARRIVAL.end) intro.running = false
      } else if (group && group.visible) {
        group.visible = false
        if (shadowRef.current) shadowRef.current.visible = false
        if (dustRef.current) dustRef.current.visible = false
      }

      // The windsock: lazy in the breeze, standing out stiff in the rotor wash.
      const sock = sockRef.current
      const cloth = sockClothRef.current
      if (sock && cloth) {
        const time = state.clock.elapsedTime
        let wash = 0
        if (intro.running && heli.visible) {
          const dist = Math.hypot(heli.x - WINDSOCK.x, heli.z - WINDSOCK.z)
          wash = clamp01(1 - (dist - 6) / 16) * clamp01(1 - heli.y / 14)
        }
        const wind = 0.45 + 0.55 * wash
        sock.rotation.y = 0.35 + Math.sin(time * 0.7) * 0.18 * (1 - wash) + Math.sin(time * 11) * 0.05 * wash
        cloth.rotation.z = -(1 - wind) * 0.95 + Math.sin(time * 2.3) * 0.05
      }
    })
    return () => {
      remove()
      if (rotor) rotor.stop()
    }
  }, [])

  const { geo, heliMat, padGeo, padMat, flatGeo, shadowMat, dustMat, sockGeo, sockMat } = parts
  return (
    <>
      <mesh geometry={padGeo} material={padMat} position={[HELIPAD.x, 0.012, HELIPAD.z]} receiveShadow />
      <group ref={sockRef} position={[WINDSOCK.x, WINDSOCK.height - 0.12, WINDSOCK.z]}>
        <mesh ref={sockClothRef} geometry={sockGeo} material={sockMat} />
      </group>
      <group ref={heliRef} rotation-order="YXZ">
        <mesh geometry={geo.body} material={heliMat} />
        <mesh ref={mainRef} geometry={geo.mainRotor} material={heliMat} position={MAIN_ROTOR_PIVOT} />
        <mesh ref={tailRef} geometry={geo.tailRotor} material={heliMat} position={TAIL_ROTOR_PIVOT} />
      </group>
      <mesh ref={shadowRef} geometry={flatGeo} material={shadowMat} renderOrder={1} />
      {particles && <mesh ref={dustRef} geometry={flatGeo} material={dustMat} renderOrder={2} />}
    </>
  )
}
