import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useState } from 'react'

import { startAmbience, stopAmbience } from '../audio/sfx'
import { useQuality } from '../store/quality'
import BattleScene from './BattleScene'
import Hud from './hud/Hud'
import { useHud } from './hud/hudStore'
import { startHudTicker } from './hud/hudTicker'
import { mapById } from './maps'
import { disposeTextures } from './render/textures'
import { createWorld, setCaps } from './sim/world'
import { battle } from './state'

/**
 * The battle screen (its own lazily-loaded chunk): loads the map, creates the
 * simulation, mounts the 3D view and the HUD, and tears it all down on exit.
 */

const capsFrom = (s) => ({ units: s.units, corpses: s.corpses, ragdolls: s.ragdolls, vehicles: s.vehicles, structures: s.structures })

function BattleLoader({ done }) {
  // useProgress covers anything three's loaders fetch; the battlefield itself is built
  // in code, so the steps below are what actually takes the time.
  const { active, progress } = useProgress()
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!done) return undefined
    const id = setTimeout(() => setGone(true), 450)
    return () => clearTimeout(id)
  }, [done])
  if (gone) return null
  return (
    <div className={`ff-loader ${done ? 'ff-loader--out' : ''}`}>
      <div className="ff-loader__card">
        <div className="ff-loader__title">Floppy Front</div>
        <div className="ff-loader__bar">
          <span style={{ width: `${done ? 100 : active ? Math.max(30, progress) : 70}%` }} />
        </div>
        <div className="ff-loader__step">{done ? 'Ready!' : 'Digging trenches and filling sandbags…'}</div>
      </div>
    </div>
  )
}

/**
 * Makes `world` the live battle: camera reset, caps following the graphics preset,
 * speed following the HUD, the HUD ticker and the wind. Returns the teardown.
 */
function installWorld(world) {
  battle.world = world
  // Look along the map's long side: across it on a wide screen, down it on a phone held
  // upright (so both armies fit).
  const portrait = window.innerWidth < window.innerHeight
  const v = battle.view
  const yaw = portrait ? Math.PI / 2 : 0
  const dist = portrait ? 105 : 74
  Object.assign(v, { tx: 0, tz: 6, yaw, pitch: 0.95, dist: dist + 6 })
  Object.assign(v.goal, { tx: 0, tz: portrait ? 0 : 6, yaw, pitch: 0.92, dist })
  useHud.setState({ placing: null, paused: false, speed: 1, selection: null, panel: null })
  const offQuality = useQuality.subscribe((s, prev) => {
    if (s.settings !== prev.settings) setCaps(world, capsFrom(s.settings))
  })
  const syncTime = () => {
    const h = useHud.getState()
    world.timeScale = h.paused ? 0 : h.speed
  }
  syncTime()
  const offHud = useHud.subscribe(syncTime)
  const stopTicker = startHudTicker()
  startAmbience()
  return () => {
    offQuality()
    offHud()
    stopTicker()
    stopAmbience()
    if (battle.world === world) battle.world = null
    battle.hover = null
    battle.moveMarker = null
    disposeTextures()
  }
}

export default function Battle({ mapId, onExit }) {
  const [map, setMap] = useState(null)
  const [ready, setReady] = useState(false)

  // Load the map, then build its battle. The world lives outside React (battle.world).
  useEffect(() => {
    let cancelled = false
    let teardown = null
    mapById(mapId)
      .load()
      .then((m) => {
        if (cancelled) return
        teardown = installWorld(createWorld(m.default, capsFrom(useQuality.getState().settings)))
        setMap(m.default)
      })
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [mapId])

  const handleReady = useCallback(() => setReady(true), [])

  return (
    <div className="ff-battle">
      {map && <BattleScene map={map} onReady={handleReady} />}
      <div id="ff-selectbox" className="ff-selectbox" />
      {ready && <Hud onExit={onExit} />}
      <BattleLoader done={ready} />
    </div>
  )
}
