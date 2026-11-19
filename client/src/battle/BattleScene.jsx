import { useEffect, useRef } from 'react'

import { worldSound } from '../audio/sfx'
import CameraRig from './render/CameraRig'
import Effects from './render/Effects'
import Bats from './render/Bats'
import Callouts from './render/Callouts'
import Ordnance from './render/Ordnance'
import GameCanvas from './render/GameCanvas'
import MapView from './render/MapView'
import Markers from './render/Markers'
import Soldiers from './render/Soldiers'
import Structures from './render/Structures'
import Vehicles from './render/Vehicles'
import { drain } from './sim/fx'
import { netStep } from './net/netWorld'
import { stepWorld } from './sim/world'
import { addFrameHook, addShake, battle, PHASE } from './state'
import HeliArrival from './walk/HeliArrival'
import RemoteWalkers from './walk/RemoteWalkers'
import Walker from './walk/Walker'

/** Steps the simulation, and feeds its sound events to the audio engine. */
function SimAndSound() {
  const cursor = useRef(battle.world ? battle.world.fx.sounds.head : 0)
  useEffect(() => {
    const listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }
    const offSim = addFrameHook(PHASE.SIM, (_s, delta) => {
      const w = battle.world
      if (!w) return
      // Online, the server simulates: the mirror just glides and plays the bodies.
      if (w.netMirror) netStep(w, w.netMirror, delta)
      else stepWorld(w, delta)
    })
    const offSound = addFrameHook(PHASE.AFTER, (state) => {
      const w = battle.world
      if (!w) return
      const cam = state.camera
      const v = battle.view
      const wk = battle.walk
      if (wk.on) {
        // On foot you hear the battle from where you stand, facing the way you look.
        listener.x = wk.x
        listener.y = wk.y + 1.6
        listener.z = wk.z
        listener.rx = Math.cos(wk.cam.yaw)
        listener.rz = -Math.sin(wk.cam.yaw)
      } else {
        // Listen from part-way between the focus and the camera: an RTS view hears
        // the battle it's looking at, not the sky.
        listener.x = v.tx + (cam.position.x - v.tx) * 0.3
        listener.y = cam.position.y * 0.3
        listener.z = v.tz + (cam.position.z - v.tz) * 0.3
        listener.rx = Math.cos(v.yaw)
        listener.rz = -Math.sin(v.yaw)
      }
      cursor.current = drain(w.fx.sounds, cursor.current, (s) => {
        worldSound(s.kind, s.x, s.y, s.z, s.meta, listener)
        // Blasts, a tank's gun and bullets cracking by your head shake the camera.
        if (s.kind === 'boom' || (s.kind === 'shot' && s.meta === 'cannon') || (s.kind === 'whiz' && s.meta === 1 && wk.on)) {
          const d = Math.hypot(s.x - listener.x, s.z - listener.z)
          const k = s.kind === 'boom' ? (s.meta || 4) / 4 : s.kind === 'whiz' ? 0.12 : 0.35
          if (d < 90) addShake(Math.min(0.85, (k * 1.1) / (1 + d / 9)))
        }
      })
    })
    return () => {
      offSim()
      offSound()
    }
  }, [])
  return null
}

/** You as your avatar, and the other players' avatars. */
function WalkLayer({ map }) {
  return (
    <>
      <Walker />
      <HeliArrival map={map} />
      <RemoteWalkers />
    </>
  )
}

const getBattleWorld = () => battle.world
/** The camera's focus, for the sun's shadow box. */
const battleFocus = () => battle.view

/** The battle's 3D view. */
export default function BattleScene({ map, onReady }) {
  return (
    <GameCanvas clearColor={map.fog} fogColor={map.fog} fogRange={map.fogRange} onReady={onReady}>
      <SimAndSound />
      <CameraRig map={map} selectBoxId="ff-selectbox" />
      <MapView map={map} focus={battleFocus} />
      <Soldiers getWorld={getBattleWorld} />
      <Effects />
      <Callouts />
      <Bats />
      <Structures />
      <Ordnance />
      <Vehicles />
      <Markers map={map} />
      <WalkLayer map={map} />
    </GameCanvas>
  )
}
