import { Suspense, useEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three'

import { buildObstacles, collideCircle } from '../battle/sim/obstacles'
import { addFrameHook, PHASE } from '../battle/state'
import { getTextures } from '../battle/render/textures'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './avatar/FallbackAvatar'
import PlayerAvatar from './avatar/PlayerAvatar'
import useKeyboard from './avatar/useKeyboard'
import { clampWalkable, SEA_FORT } from './seaFort'
import { lobby } from './lobbyState'

/**
 * You, in the lobby: a kinematic character controller (no physics engine - the fort is
 * flat decks and boxes: a circle push-out for the props, a clamp to the deck outlines) driving your Bloxity
 * avatar. WASD / arrows or the touch joystick move you relative to the camera; Space or
 * the jump button jumps.
 *
 * Reads and writes `lobby.player`; never touches React state per frame.
 */

const RADIUS = 0.42
const RUN_SPEED = 7
const ACCELERATION = 14
const GRAVITY = 30
const JUMP_SPEED = 9.5

const _move = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _pos = { x: 0, z: 0 }

export default function LobbyPlayer({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const obstacles = useMemo(() => buildObstacles(SEA_FORT), [])
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: RUN_SPEED, vy: 0, stride: 0, salute: 0 })

  // A soft round shadow under your feet on every preset (cheap, and it grounds you).
  const shadow = useMemo(() => {
    const geo = new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2)
    const mat = new MeshBasicMaterial({ map: getTextures().blob, transparent: true, depthWrite: false })
    return { geo, mat }
  }, [])
  useEffect(
    () => () => {
      shadow.geo.dispose()
      shadow.mat.dispose()
    },
    [shadow],
  )

  // Runs in the SIM phase: before the follow camera (DRAW), so it never lags a frame.
  useEffect(
    () =>
      addFrameHook(PHASE.SIM, (_state, rawDelta) => {
        const delta = Math.min(rawDelta, 0.05)
        const p = lobby.player
        const k = keys.current
        const joy = lobby.input
        const motion = motionRef.current
        const intro = lobby.intro
        const scripted = intro.playerScripted
        motion.time += delta

        // Input, relative to the camera (yaw 0: camera south of you, looking north).
        let ix = 0
        let iz = 0
        if (scripted) {
          // The arrival flight is moving you (Arrival.jsx); any move or jump skips it.
          if (k.forward || k.backward || k.left || k.right || k.jump || joy.joyX || joy.joyY || joy.jump) intro.skip = true
        } else if (!p.frozen) {
          ix = (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX
          iz = (k.forward ? 1 : 0) - (k.backward ? 1 : 0) + joy.joyY
        }
        const len = Math.min(1, Math.hypot(ix, iz))
        if (len > 0.02) {
          const yaw = lobby.camera.yaw
          const fx = -Math.sin(yaw)
          const fz = -Math.cos(yaw)
          const rx = Math.cos(yaw)
          const rz = -Math.sin(yaw)
          const n = Math.hypot(ix, iz)
          _move.set((fx * iz + rx * ix) / n, 0, (fz * iz + rz * ix) / n).multiplyScalar(RUN_SPEED * len)
        } else {
          _move.set(0, 0, 0)
        }
        if (scripted) {
          // Start from rest when you get control.
          velocity.current.set(0, 0, 0)
          vy.current = 0
        } else {
          velocity.current.lerp(_move, 1 - Math.exp(-ACCELERATION * delta))

          _pos.x = p.x + velocity.current.x * delta
          _pos.z = p.z + velocity.current.z * delta
          collideCircle(obstacles, _pos, RADIUS)
          // Stay on the decks (railings all round; the sea below).
          clampWalkable(_pos, RADIUS)
          p.x = _pos.x
          p.z = _pos.z

          // Jump and fall (the decks are flat: y = 0).
          if ((k.jump || joy.jump) && p.grounded && !p.frozen) {
            vy.current = JUMP_SPEED
            p.grounded = false
          }
          vy.current -= GRAVITY * delta
          p.y += vy.current * delta
          if (p.y <= 0) {
            p.y = 0
            vy.current = 0
            p.grounded = true
          }

          const speed = Math.hypot(velocity.current.x, velocity.current.z)
          if (speed > 0.3) p.yaw = Math.atan2(velocity.current.x, velocity.current.z)
          p.speed = speed
        }
        const speed = p.speed
        if (p.salute > 0) p.salute = Math.max(0, p.salute - delta)

        const group = groupRef.current
        const visual = visualRef.current
        if (group && visual) {
          // You ride inside the helicopter until its door.
          group.visible = !scripted || intro.showPlayer
          group.position.set(p.x, 0, p.z)
          visual.position.y = p.y
          _targetQuat.setFromAxisAngle(_up, p.yaw)
          visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
        }

        motion.speed = speed
        motion.grounded = p.grounded
        motion.vy = scripted ? intro.vy : vy.current
        motion.stride += delta * (5 + 6 * Math.min(1, speed / RUN_SPEED))
        // Salute fades in and out over its 1.6 s.
        motion.salute = p.salute > 0 ? Math.min(1, p.salute / 0.3, (1.6 - p.salute) / 0.25) : 0
      }),
    [obstacles, keys],
  )

  return (
    <group ref={groupRef} position={[lobby.player.x, 0, lobby.player.z]}>
      <mesh geometry={shadow.geo} material={shadow.mat} position={[0, 0.02, 0]} renderOrder={1} />
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={1.8} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
      </group>
    </group>
  )
}
