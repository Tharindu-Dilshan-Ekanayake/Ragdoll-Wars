import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useState } from 'react'

import { sfx } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { disposeTextures } from '../battle/render/textures'
import { useApp } from '../store/app'
import { PAD_RADIUS, STATIONS } from './baseCamp'
import LobbyHud from './LobbyHud'
import LobbyScene from './LobbyScene'
import { beginArrival, lobby, respawnLobby, useLobby } from './lobbyState'

/**
 * The lobby screen - what loads first. Base Camp in 3D with your avatar, the HUD over it,
 * and a loading cover until the first frame is drawn. You arrive by helicopter
 * (Arrival.jsx); the flight starts the moment the camp is on screen and can be skipped.
 *
 * A 10 Hz ticker (never the frame loop) works out which station's pad you're on and
 * opens its panel when you step in; leaving the pad and coming back opens it again. It
 * also notices when the arrival hands you control, so the HUD can come in.
 */

/** Boxity's loading screen is ended once per page, when the camp first shows. */
let loadingEnded = false

function LobbyLoader({ done }) {
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
          <span style={{ width: `${done ? 100 : active ? Math.max(25, progress) : 60}%` }} />
        </div>
        <div className="ff-loader__step">{done ? 'Ready!' : 'Pitching tents at Base Camp…'}</div>
      </div>
    </div>
  )
}

function startZoneTicker() {
  let inside = null
  const id = setInterval(() => {
    const arriving = lobby.intro.playerScripted
    if (arriving !== useLobby.getState().arriving) useLobby.setState({ arriving })
    if (arriving) return
    const p = lobby.player
    let zone = null
    for (const st of STATIONS) {
      if (Math.hypot(p.x - st.x, p.z - st.z) < PAD_RADIUS) {
        zone = st.id
        break
      }
    }
    const store = useLobby.getState()
    if (zone !== store.zone) useLobby.setState({ zone })
    if (zone && zone !== inside && !store.panel) {
      // Stepped onto a pad: salute and open its station.
      p.salute = 1.6
      useLobby.setState({ panel: zone })
      sfx.select()
    }
    inside = zone
  }, 100)
  return () => clearInterval(id)
}

export default function Lobby() {
  const { game } = useBloxity()
  const ready = useLobby((s) => s.ready)
  const panel = useLobby((s) => s.panel)
  const arriving = useLobby((s) => s.arriving)

  useEffect(() => {
    respawnLobby()
    beginArrival()
    useLobby.setState({ zone: null, panel: null, ready: false, arriving: true })
    if (!loadingEnded) game.loadingStep('Pitching tents at Base Camp…')
    const stop = startZoneTicker()
    return () => {
      stop()
      disposeTextures()
    }
  }, [game])

  // Panels freeze your avatar (and tell Boxity's screen ads a panel is up).
  useEffect(() => {
    lobby.player.frozen = Boolean(panel)
    useApp.getState().setPanel(Boolean(panel))
  }, [panel])

  const handleReady = useCallback(() => {
    useLobby.setState({ ready: true })
    // The camp is on screen: the helicopter can start its run in.
    lobby.intro.waiting = false
    if (!loadingEnded) {
      loadingEnded = true
      performance.mark('ff:playable')
      game.loadingEnd()
    }
    useApp.getState().setPlayable()
    // Fetch the battle quietly while you look around.
    const prefetch = () => import('../battle/Battle.jsx').catch(() => {})
    if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 3000 })
    else setTimeout(prefetch, 1500)
  }, [game])

  return (
    <div className="ff-lobby">
      <LobbyScene onReady={handleReady} />
      <div className={`ff-letterbox ${arriving ? 'ff-letterbox--on' : ''}`} aria-hidden="true" />
      {ready && <LobbyHud />}
      <LobbyLoader done={ready} />
    </div>
  )
}
