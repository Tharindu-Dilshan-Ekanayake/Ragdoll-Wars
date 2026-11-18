import { useEffect } from 'react'

import { sfx } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { Glyph } from '../battle/hud/icons'
import { STATIONS } from './baseCamp'
import { lobby, useLobby } from './lobbyState'
import StationPanels from './StationPanels'
import TouchStick from './TouchStick'

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * The lobby HUD: settings and help top-left, where you are top-centre, your name and
 * sign-in top-right, the "open" prompt while you stand on a pad, touch controls, and the
 * station panels.
 */
export default function LobbyHud() {
  const zone = useLobby((s) => s.zone)
  const panel = useLobby((s) => s.panel)
  const arriving = useLobby((s) => s.arriving)
  const setPanel = useLobby((s) => s.setPanel)
  const { identity, isLoggedIn, login, isReady } = useBloxity()
  const station = STATIONS.find((s) => s.id === zone)
  const name = identity?.displayName || identity?.username || 'Commander'

  // E opens the station you're standing on; Esc closes a panel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return
      const state = useLobby.getState()
      if (state.arriving) {
        if (e.key === 'Escape' || e.key === 'Enter') lobby.intro.skip = true
        return
      }
      if (e.key === 'Escape' && state.panel) state.setPanel(null)
      else if ((e.key === 'e' || e.key === 'E') && state.zone && !state.panel) {
        lobby.player.salute = 1.6
        state.setPanel(state.zone)
        sfx.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const open = (id) => {
    setPanel(id)
    sfx.click()
  }

  // Riding in: just the place name and a Skip button over the letterbox.
  if (arriving)
    return (
      <div className="ff-hud ff-lobbyhud">
        <div className="ff-arrival">
          <span className="ff-arrival__title">Base Camp</span>
          <span className="ff-arrival__sub">Inbound to the helipad</span>
        </div>
        <button
          type="button"
          className="ff-btn ff-skip"
          onClick={() => {
            lobby.intro.skip = true
            sfx.click()
          }}
        >
          Skip
          <Glyph name="play" className="ff-ico" />
        </button>
      </div>
    )

  return (
    <div className="ff-hud ff-lobbyhud">
      <div className="ff-corner">
        <button type="button" className="ff-iconbtn" title="Settings" onClick={() => open('settings')}>
          <Glyph name="gear" className="ff-ico" />
        </button>
        <button type="button" className="ff-iconbtn" title="How to play" onClick={() => open('help')}>
          <Glyph name="help" className="ff-ico" />
        </button>
      </div>
      <div className="ff-campname">
        <span className="ff-campname__title">Base Camp</span>
        <span className="ff-campname__sub">{isTouch ? 'Walk into a glowing circle' : 'WASD to walk · drag to look · step into a glowing circle'}</span>
      </div>
      <div className="ff-player ff-player--hud">
        <span className="ff-player__dot" />
        {name}
        {isReady && !isLoggedIn && (
          <button type="button" className="ff-btn ff-btn--small" onClick={login}>
            Sign in
          </button>
        )}
      </div>
      {station && !panel && (
        <button
          type="button"
          className={`ff-prompt ${station.live ? '' : 'ff-prompt--soon'}`}
          onClick={() => {
            lobby.player.salute = 1.6
            open(station.id)
          }}
        >
          {!isTouch && <span className="ff-prompt__key">E</span>}
          Open {station.title}
        </button>
      )}
      <TouchStick />
      <StationPanels />
    </div>
  )
}
