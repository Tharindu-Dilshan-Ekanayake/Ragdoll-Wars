import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useState } from 'react'

import { startAmbience, stopAmbience } from '../audio/sfx'
import { useApp } from '../store/app'
import { useQuality } from '../store/quality'
import { getSave } from '../store/saves'
import BattleScene from './BattleScene'
import Hud from './hud/Hud'
import { useHud } from './hud/hudStore'
import { startHudTicker } from './hud/hudTicker'
import { mapById } from './maps'
import { disposeTextures } from './render/textures'
import { createWorld, initZombieMode, setCaps } from './sim/world'
import { leaveBattle, net } from '../net/battleNet'
import { me, useNet } from '../store/net'
import { applySnapshot, createNetMirror } from './net/netWorld'
import { applySave } from './sim/saveGame'
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
function installWorld(world, online = false) {
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
  let offHud = () => {}
  let offNet = () => {}
  if (online) {
    // The server's clock and the server's word: snapshots drive the world, and your
    // team comes from the room's player list.
    net.onSnapshot = (snap) => applySnapshot(world, world.netMirror, snap)
    if (net.pending) {
      applySnapshot(world, world.netMirror, net.pending)
      net.pending = null
    }
    net.onToast = (t) => useHud.getState().showToast(t.text, t.kind)
    net.onSpeed = (s) => useHud.setState({ speed: s.speed, paused: s.paused })
    net.onDisconnect = () => useHud.getState().showToast('Disconnected from the battle')
    const syncTeam = () => {
      const mine = me()
      if (mine && mine.team !== useHud.getState().team) useHud.setState({ team: mine.team })
    }
    syncTeam()
    offNet = useNet.subscribe(syncTeam)
  } else {
    syncTime()
    offHud = useHud.subscribe(syncTime)
  }
  const stopTicker = startHudTicker()
  startAmbience()
  return () => {
    offQuality()
    offHud()
    offNet()
    if (online) {
      net.onSnapshot = null
      net.onToast = null
      net.onSpeed = null
      net.onDisconnect = null
    }
    stopTicker()
    stopAmbience()
    if (battle.world === world) battle.world = null
    battle.hover = null
    battle.moveMarker = null
    disposeTextures()
  }
}

export default function Battle({ mapId, mode = 'sandbox', onExit }) {
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
        const online = net.online()
        const world = createWorld(m.default, capsFrom(useQuality.getState().settings), mode)
        if (online) world.netMirror = createNetMirror()
        else if (mode === 'zombies') initZombieMode(world)
        // Opening a saved battlefield (from the lobby or another map's Saves tab).
        const saveId = useApp.getState().takePendingSave()
        const save = saveId ? getSave(saveId) : null
        if (!online && save && save.mapId === m.default.id && mode === 'sandbox') applySave(world, save.data)
        useHud.setState({ mode, team: 0, zombie: null, placing: null, dockTab: 'units' })
        teardown = installWorld(world, online)
        setMap(m.default)
      })
    return () => {
      cancelled = true
      teardown?.()
      // Leaving the battle screen leaves the multiplayer room too.
      if (net.online()) leaveBattle()
    }
  }, [mapId, mode])

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
