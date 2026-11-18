import { Html } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, PlaneGeometry, RingGeometry } from 'three'

import { DEFAULT_PROPORTIONS } from '../../bloxity/store'
import FallbackAvatar from '../../lobby/avatar/FallbackAvatar'
import { BloxityAvatar } from '../../lobby/avatar/PlayerAvatar'
import { useNet } from '../../store/net'
import ErrorBoundary from '../../ui/ErrorBoundary'
import { getTextures } from '../render/textures'
import { TEAMS } from '../sim/constants'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * The other players in a multiplayer battle, when they're out walking (walk mode): their
 * own Bloxity avatars, wearing what they wear, with a team-coloured ring and their name.
 * Positions come in with the server's snapshots (net/netWorld.js keeps the latest per
 * player) and are glided towards here. Hidden while they're commanding.
 */

const SMOOTH = 12

function RemoteWalker({ sid, name, team, avatar }) {
  const groupRef = useRef(null)
  const bodyRef = useRef(null)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: 6, vy: 0, stride: 0, salute: 0 })
  const parts = useMemo(() => {
    const color = TEAMS[team]?.css || '#ffffff'
    return {
      blob: new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
      blobMat: new MeshBasicMaterial({ map: getTextures().blob, transparent: true, depthWrite: false }),
      ring: new RingGeometry(0.5, 0.62, 28).rotateX(-Math.PI / 2),
      ringMat: new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    }
  }, [team])
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) v.dispose()
    },
    [parts],
  )

  useEffect(() => {
    let shown = false
    let lastY = 0
    return addFrameHook(PHASE.DRAW, (_s, rawDelta) => {
      const group = groupRef.current
      const body = bodyRef.current
      if (!group || !body) return
      const wk = battle.world?.netMirror?.walkers.get(sid)
      group.visible = Boolean(wk)
      motionRef.current.paused = !wk
      if (!wk) {
        shown = false
        return
      }
      const dt = Math.min(rawDelta, 0.05)
      const k = shown ? 1 - Math.exp(-SMOOTH * dt) : 1
      group.position.x += (wk.x - group.position.x) * k
      group.position.z += (wk.z - group.position.z) * k
      const y = body.position.y + (wk.y - body.position.y) * k
      let dy = wk.yaw - body.rotation.y
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      body.rotation.y += dy * k
      body.position.y = y
      const motion = motionRef.current
      motion.time += dt
      motion.speed = wk.speed
      motion.grounded = wk.grounded
      motion.vy = shown && dt > 0 ? (y - lastY) / dt : 0
      motion.stride += dt * (5 + 6 * Math.min(1, wk.speed / 6))
      lastY = y
      shown = true
    })
  }, [sid])

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={parts.blob} material={parts.blobMat} position={[0, 0.03, 0]} renderOrder={1} />
      <mesh geometry={parts.ring} material={parts.ringMat} position={[0, 0.04, 0]} renderOrder={2} />
      <group ref={bodyRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <BloxityAvatar equipped={avatar?.e || null} proportions={avatar?.p || DEFAULT_PROPORTIONS} targetHeight={1.8} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
        <Html position={[0, 2.25, 0]} center zIndexRange={[5, 0]} className="ff-walker-tag" style={{ pointerEvents: 'none' }}>
          <span className={`ff-walker-tag__name ff-walker-tag__name--${team}`}>{name}</span>
        </Html>
      </group>
    </group>
  )
}

/** Everyone else in the room (online only). */
export default function RemoteWalkers() {
  const status = useNet((s) => s.status)
  const players = useNet((s) => s.players)
  const sid = useNet((s) => s.sessionId)
  if (status !== 'online') return null
  return players.filter((p) => p.sid !== sid).map((p) => <RemoteWalker key={p.sid} sid={p.sid} name={p.name} team={p.team} avatar={p.avatar} />)
}
