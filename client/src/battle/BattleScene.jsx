import { useEffect, useRef } from 'react'

import { worldSound } from '../audio/sfx'
import CameraRig from './render/CameraRig'
import Effects from './render/Effects'
import Ordnance from './render/Ordnance'
import GameCanvas from './render/GameCanvas'
import MapView from './render/MapView'
import Markers from './render/Markers'
import Soldiers from './render/Soldiers'
import { drain } from './sim/fx'
import { stepWorld } from './sim/world'
import { addFrameHook, battle, PHASE } from './state'

/** Steps the simulation, and feeds its sound events to the audio engine. */
function SimAndSound() {
  const cursor = useRef(battle.world ? battle.world.fx.sounds.head : 0)
  useEffect(() => {
    const listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }
    const offSim = addFrameHook(PHASE.SIM, (_s, delta) => {
      if (battle.world) stepWorld(battle.world, delta)
    })
    const offSound = addFrameHook(PHASE.AFTER, (state) => {
      const w = battle.world
      if (!w) return
      const cam = state.camera
      const v = battle.view
      // Listen from part-way between the focus and the camera: an RTS view hears
      // the battle it's looking at, not the sky.
      listener.x = v.tx + (cam.position.x - v.tx) * 0.3
      listener.y = cam.position.y * 0.3
      listener.z = v.tz + (cam.position.z - v.tz) * 0.3
      listener.rx = Math.cos(v.yaw)
      listener.rz = -Math.sin(v.yaw)
      cursor.current = drain(w.fx.sounds, cursor.current, (s) => worldSound(s.kind, s.x, s.y, s.z, s.meta, listener))
    })
    return () => {
      offSim()
      offSound()
    }
  }, [])
  return null
}

const getBattleWorld = () => battle.world
/** The camera's focus, for the sun's shadow box. */
const battleFocus = () => battle.view

/** The battle's 3D view. */
export default function BattleScene({ map, onReady }) {
  return (
    <GameCanvas clearColor={map.fog} fogColor={map.fog} onReady={onReady}>
      <SimAndSound />
      <CameraRig map={map} selectBoxId="ff-selectbox" />
      <MapView map={map} focus={battleFocus} />
      <Soldiers getWorld={getBattleWorld} />
      <Effects />
      <Ordnance />
      <Markers map={map} />
    </GameCanvas>
  )
}
