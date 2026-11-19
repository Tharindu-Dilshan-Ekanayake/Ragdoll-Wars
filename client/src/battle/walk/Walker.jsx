import { Suspense, useEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, PlaneGeometry, RingGeometry, Vector3 } from 'three'

import FallbackAvatar from '../../lobby/avatar/FallbackAvatar'
import PlayerAvatar from '../../lobby/avatar/PlayerAvatar'
import { net } from '../../net/battleNet'
import ErrorBoundary from '../../ui/ErrorBoundary'
import { getTextures } from '../render/textures'
import { drain } from '../sim/fx'
import { segmentHit3D } from '../sim/obstacles'
import { addFrameHook, battle, PHASE } from '../state'
import { arrivalCamera, stepArrival } from './arrivalFlight'
import { blastWalker, stepWalker, WALK } from './walkMode'

/**
 * You on foot (walk mode): your Bloxity avatar driven by walkMode.js, and the
 * third-person camera behind you. WASD / arrows or the touch stick walk (relative to the
 * camera), Shift sprints, Space or the jump button jumps; dragging looks around and the
 * wheel or a pinch zooms (input.js).
 *
 * Your avatar is on the map the whole battle: in the top view it stands where you left
 * it, with a gold ring (grown with the camera's distance) so you can find yourself.
 * Online, your position goes to the server ten times a second while you walk, for the
 * other players to see.
 */

const SEND_EVERY = 0.1
/** In the top view, your avatar is drawn only with the camera closer than this. */
const FAR_VIEW = 40
const _target = new Vector3()
const _desired = new Vector3()
const _look = new Vector3()
const _camPos = new Vector3()
const _camLook = new Vector3()
/** The camera's place round you when the flight-in shot ends (the sweep starts there). */
const sweepFrom = { yaw: 0, pitch: 0, dist: 7, set: false }
/** The message sent to the server, reused: [x, y, z] cm, yaw mrad, speed cm/s, grounded. */
const walkMsg = [0, 0, 0, 0, 0, 1]
const onBlast = (e) => blastWalker(battle.walk, e)

export default function Walker() {
  const groupRef = useRef(null)
  const yawRef = useRef(null)
  const pivotRef = useRef(null)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: WALK.run, vy: 0, stride: 0, salute: 0 })

  const markerRef = useRef(null)
  const shadow = useMemo(() => {
    const geo = new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2)
    const mat = new MeshBasicMaterial({ map: getTextures().blob, transparent: true, depthWrite: false })
    const ring = new RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2)
    const ringMat = new MeshBasicMaterial({ color: '#ffb52e', transparent: true, opacity: 0.9, depthWrite: false })
    return { geo, mat, ring, ringMat }
  }, [])
  useEffect(
    () => () => {
      for (const v of Object.values(shadow)) v.dispose()
    },
    [shadow],
  )

  useEffect(() => {
    let wasOn = false
    let blasts = 0
    let sendT = 0

    // SIM phase, after the battle steps: blasts this frame reach you the same frame.
    const offMove = addFrameHook(PHASE.SIM, (_s, rawDelta) => {
      const wk = battle.walk
      const w = battle.world
      const group = groupRef.current
      // Flying in: the flight's clock (it runs on in the top view too).
      if (battle.arrival.running) stepArrival(Math.min(rawDelta, 0.05))
      if (group) group.visible = wk.placed
      if (!wk.placed || !w || !group) {
        wasOn = false
        return
      }
      const dt = Math.min(rawDelta, 0.05)
      const marker = markerRef.current
      marker.visible = !wk.on
      if (!wk.on) {
        // Top view: you stand and wait; the ring grows so you stay findable from up high.
        wasOn = false
        group.position.set(wk.x, wk.floor, wk.z)
        yawRef.current.position.y = wk.y - wk.floor
        // Far up, a figure a few pixels tall isn't worth drawing: just the ring then.
        const near = battle.view.dist < FAR_VIEW
        yawRef.current.visible = near
        const s = Math.max(1, battle.view.dist / 16)
        marker.scale.set(s, 1, s)
        const motion = motionRef.current
        motion.paused = !near
        motion.time += dt
        motion.speed = 0
        motion.grounded = true
        motion.vy = 0
        return
      }
      if (!wasOn) {
        // Only blasts from now on.
        blasts = w.fx.explosions.head
        _look.set(battle.view.tx, 0.6, battle.view.tz)
        yawRef.current.rotation.y = wk.yaw
        yawRef.current.visible = true
        motionRef.current.paused = false
        wasOn = true
      }
      blasts = drain(w.fx.explosions, blasts, onBlast)

      // Aboard or hopping off: the flight moves you (stepArrival), out of sight until the door.
      if (battle.arrival.scripted) {
        group.position.set(wk.x, 0, wk.z)
        const yawG = yawRef.current
        yawG.visible = battle.arrival.shown
        yawG.position.y = wk.y
        yawG.rotation.y = wk.yaw
        pivotRef.current.rotation.x = 0
        const motion = motionRef.current
        motion.time += dt
        motion.speed = wk.speed
        motion.grounded = wk.grounded
        motion.vy = wk.vy
        motion.stride += dt * (5 + 6 * Math.min(1, wk.speed / WALK.run))
        battle.view.tx = wk.x
        battle.view.tz = wk.z
        return
      }
      if (!yawRef.current.visible) yawRef.current.visible = true

      const keys = battle.view.keys
      const joy = wk.input
      const ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.joyX
      const iz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + joy.joyY
      stepWalker(wk, w.obs, ix, iz, keys.has(' ') || joy.jump, keys.has('shift'), dt)

      // The shadow stays on the floor; you rise above it.
      group.position.set(wk.x, wk.floor, wk.z)
      const yawG = yawRef.current
      yawG.position.y = wk.y - wk.floor
      // Turn smoothly towards where you're heading (the shortest way round).
      let dy = wk.yaw - yawG.rotation.y
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      yawG.rotation.y += dy * (1 - Math.pow(0.0005, dt))
      pivotRef.current.rotation.x = wk.spin

      const motion = motionRef.current
      motion.time += dt
      motion.speed = wk.speed
      motion.grounded = wk.grounded
      motion.vy = wk.vy
      motion.maxSpeed = WALK.run
      motion.stride += dt * (5 + 6 * Math.min(1, wk.speed / WALK.run))

      // The shadow box and the commander's focus follow you.
      battle.view.tx = wk.x
      battle.view.tz = wk.z

      if (net.online()) {
        sendT -= dt
        if (sendT <= 0) {
          sendT = SEND_EVERY
          walkMsg[0] = Math.round(wk.x * 100)
          walkMsg[1] = Math.round(wk.y * 100)
          walkMsg[2] = Math.round(wk.z * 100)
          walkMsg[3] = Math.round(Math.atan2(Math.sin(wk.yaw), Math.cos(wk.yaw)) * 1000)
          walkMsg[4] = Math.round(wk.speed * 100)
          walkMsg[5] = wk.grounded ? 1 : 0
          net.send('walk', walkMsg)
        }
      }
    })

    // DRAW phase: the follow camera, after you've moved this frame.
    const offCamera = addFrameHook(PHASE.DRAW, (state, rawDelta) => {
      const wk = battle.walk
      const w = battle.world
      if (!wk.on || !w) return
      const dt = Math.min(rawDelta, 0.05)
      const c = wk.cam
      const arr = battle.arrival
      if (arr.running && arr.scripted) {
        const k = arrivalCamera(_camPos, _camLook)
        if (k < 0) {
          // The fixed shot of the helicopter coming in (pulled in front of any wall).
          const hit = segmentHit3D(w.obs, arr.frame.px, 2, arr.frame.pz, _camPos.x, _camPos.y, _camPos.z)
          if (hit < 1) _camPos.lerp(_target.set(arr.frame.px, 2, arr.frame.pz), 1 - Math.max(0.15, hit - 0.05))
          const camera = state.camera
          camera.position.copy(_camPos)
          camera.lookAt(_camLook)
          camera.updateMatrixWorld()
          _look.copy(_camLook)
          sweepFrom.set = false
          return
        }
        // You're out: swing from that shot round to behind you.
        const camera = state.camera
        if (!sweepFrom.set) {
          const dx = camera.position.x - wk.x
          const dy = camera.position.y - (wk.y + WALK.eye)
          const dz = camera.position.z - wk.z
          const dist = Math.max(0.5, Math.hypot(dx, dy, dz))
          Object.assign(sweepFrom, { yaw: Math.atan2(dx, dz), pitch: Math.asin(dy / dist), dist, set: true })
        }
        let dyaw = arr.frame.yaw - sweepFrom.yaw
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
        c.yaw = sweepFrom.yaw + dyaw * k
        c.pitch = sweepFrom.pitch + (0.32 - sweepFrom.pitch) * k
        c.dist = sweepFrom.dist + (7 - sweepFrom.dist) * k
      } else sweepFrom.set = false
      _target.set(wk.x, wk.y + WALK.eye, wk.z)
      const h = Math.cos(c.pitch) * c.dist
      _desired.set(_target.x + Math.sin(c.yaw) * h, Math.max(_target.y + Math.sin(c.pitch) * c.dist, 0.4), _target.z + Math.cos(c.yaw) * h)
      // Don't let a wall come between you and the camera: pull in in front of it.
      const hit = segmentHit3D(w.obs, _target.x, _target.y, _target.z, _desired.x, _desired.y, _desired.z)
      if (hit < 1) _desired.lerp(_target, 1 - Math.max(0.12, hit - 0.08))
      const camera = state.camera
      camera.position.lerp(_desired, 1 - Math.exp(-10 * dt))
      _look.lerp(_target, 1 - Math.exp(-14 * dt))
      camera.lookAt(_look)
      camera.updateMatrixWorld()
    })
    return () => {
      offMove()
      offCamera()
    }
  }, [])

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={shadow.geo} material={shadow.mat} position={[0, 0.03, 0]} renderOrder={1} />
      <mesh ref={markerRef} geometry={shadow.ring} material={shadow.ringMat} position={[0, 0.05, 0]} renderOrder={2} visible={false} />
      <group ref={yawRef}>
        {/* Somersaults turn about your middle, not your feet. */}
        <group ref={pivotRef} position={[0, 0.9, 0]}>
          <group position={[0, -0.9, 0]}>
            <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} />}>
              <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
                <PlayerAvatar targetHeight={1.8} motionRef={motionRef} />
              </Suspense>
            </ErrorBoundary>
          </group>
        </group>
      </group>
    </group>
  )
}
