import { useEffect, useState } from 'react'

import { sfx } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { Glyph } from '../battle/hud/icons'
import { STATIONS } from './seaFort'
import { lobby, useLobby } from './lobbyState'
import StationPanels from './StationPanels'
import { joinBattle, parseCode } from '../net/battleNet'
import { useNet } from '../store/net'
import TouchStick from './TouchStick'

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * Your Bloxity profile picture (`pfp`): a full URL for a guest, or a path on Bloxity's
 * image server - sized the way the SDK asks for its own.
 */
function pfpUrl(identity) {
  const p = typeof identity?.pfp === 'string' ? identity.pfp : ''
  if (!p) return ''
  if (/^https?:\/\//.test(p)) return p
  return `https://static.bloxity.io/img/${p.replace(/^\//, '')}?width=128&quality=85&v=2`
}

/** Top right: just your picture and your name. */
function NameTag({ identity, name }) {
  const src = pfpUrl(identity)
  const [broken, setBroken] = useState('')
  return (
    <div className="ff-player ff-player--hud">
      {src && broken !== src ? (
        <img className="ff-player__pfp" src={src} alt="" draggable={false} onError={() => setBroken(src)} />
      ) : (
        <span className="ff-player__pfp ff-player__pfp--letter">{name.slice(0, 1).toUpperCase()}</span>
      )}
      <span className="ff-player__name">{name}</span>
    </div>
  )
}

/** The battle code in this page's address (an invite link: ?join=CODE), read once. */
const inviteCode = typeof window !== 'undefined' ? parseCode(new URLSearchParams(window.location.search).get('join')) : ''
let inviteTaken = false

/**
 * The lobby HUD: your picture and name top right with settings and help under them, the
 * "open" prompt while you stand on a pad, touch controls, and the station panels.
 */
export default function LobbyHud() {
  const zone = useLobby((s) => s.zone)
  const panel = useLobby((s) => s.panel)
  const arriving = useLobby((s) => s.arriving)
  const setPanel = useLobby((s) => s.setPanel)
  const { identity, isReady } = useBloxity()
  const station = STATIONS.find((s) => s.id === zone)
  const name = identity?.displayName || identity?.username || 'Commander'
  const netStatus = useNet((s) => s.status)
  const netMessage = useNet((s) => s.message)
  // An invite link: join that battle as soon as we know who you are (or after a moment,
  // for a guest on a build without a Boxity sign-in).
  const [invited, setInvited] = useState(Boolean(inviteCode))
  // Into a waiting room (made one, or joined by code or link): show it.
  useEffect(() => {
    if (netStatus === 'waiting') useLobby.getState().setPanel('multiplayer')
  }, [netStatus])
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
      <NameTag identity={identity} name={name} />
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
      {netStatus === 'waiting' && panel !== 'multiplayer' && (
        <div className="ff-invite">
          <span>You're in a room, waiting for the battle to start</span>
          <button type="button" className="ff-btn ff-btn--small" onClick={() => open('multiplayer')}>
            Open
          </button>
        </div>
      )}
      <TouchStick />
      <StationPanels />
    </div>
  )
}
