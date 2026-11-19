import { useEffect, useState } from 'react'

import { sfx } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { Glyph } from '../battle/hud/icons'
import { STATIONS } from './seaFort'
import { lobby, useLobby } from './lobbyState'
import StationPanels from './StationPanels'
import { cloudText, useCloud } from '../net/cloud'
import { joinBattle, parseCode } from '../net/battleNet'
import { useNet } from '../store/net'
import TouchStick from './TouchStick'

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** The battle code in this page's address (an invite link: ?join=CODE), read once. */
const inviteCode = typeof window !== 'undefined' ? parseCode(new URLSearchParams(window.location.search).get('join')) : ''
let inviteTaken = false

/**
 * The lobby HUD: settings and help top-right under your name and
 * sign-in, where you are top-centre, the "open" prompt while you stand on a pad, touch controls, and the
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
  const cloud = useCloud((s) => s.status)
  const netStatus = useNet((s) => s.status)
  const netMessage = useNet((s) => s.message)
  // An invite link: join that battle as soon as we know who you are (or after a moment,
  // for a guest on a build without a Boxity sign-in).
  const [invited, setInvited] = useState(Boolean(inviteCode))
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (!inviteCode) return undefined
    const id = setTimeout(() => setWaited(true), 2500)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!inviteCode || inviteTaken || !(isReady || waited)) return
    inviteTaken = true
    // The link has done its job: a refresh shouldn't try to join again.
    const url = new URL(window.location.href)
    url.searchParams.delete('join')
    window.history.replaceState(null, '', url.toString())
    joinBattle({ kind: 'code', code: inviteCode }, name)
  }, [isReady, waited, name])

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
          <span className="ff-arrival__title">Sea Fort</span>
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
        <button type="button" className="ff-iconbtn" title="Leaderboards" onClick={() => open('ranks')}>
          <Glyph name="trophy" className="ff-ico" />
        </button>
      </div>
      <div className="ff-campname">
        <span className="ff-campname__title">Sea Fort</span>
        <span className="ff-campname__sub">{isTouch ? 'Cross a bridge, step into a circle' : 'WASD to walk · drag to look · cross a bridge and step into a circle'}</span>
      </div>
      <div className="ff-player ff-player--hud">
        <span className="ff-player__dot" />
        {name}
        {isLoggedIn && cloud !== 'off' && (
          <span className={`ff-cloud ff-cloud--${cloud}`} title={cloudText(cloud, isLoggedIn)}>
            <Glyph name="cloud" className="ff-ico" />
          </span>
        )}
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
      {invited && (netStatus === 'connecting' || netStatus === 'error') && (
        <div className={`ff-invite ${netStatus === 'error' ? 'is-error' : ''}`}>
          <span>{netStatus === 'error' ? netMessage : `Joining battle ${inviteCode}…`}</span>
          {netStatus === 'error' && (
            <button type="button" className="ff-btn ff-btn--small" onClick={() => setInvited(false)}>
              OK
            </button>
          )}
        </div>
      )}
      <TouchStick />
      <StationPanels />
    </div>
  )
}
