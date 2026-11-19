import { useEffect, useRef } from 'react'

import { sfx } from '../../audio/sfx'
import { inviteLink } from '../../net/battleNet'
import { useNet } from '../../store/net'
import { useHud } from './hudStore'

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Multiplayer: tells you when someone joins or leaves the battle (draws nothing). */
export function RoomWatcher() {
  const status = useNet((s) => s.status)
  const players = useNet((s) => s.players)
  const sid = useNet((s) => s.sessionId)
  const known = useRef(null)
  useEffect(() => {
    if (status !== 'online') {
      known.current = null
      return
    }
    const now = new Map(players.map((p) => [p.sid, p.name]))
    if (known.current) {
      for (const [id, name] of now) if (!known.current.has(id) && id !== sid) useHud.getState().showToast(`${name} joined the battle`, 'info')
      for (const [id, name] of known.current) if (!now.has(id)) useHud.getState().showToast(`${name} left`, 'info')
    }
    known.current = now
  }, [players, status, sid])
  return null
}

/**
 * The multiplayer room, in the Settings panel: its code, the invite button and who's in
 * it (side, host). Nothing when you're playing alone.
 */
export function RoomCard() {
  const status = useNet((s) => s.status)
  const players = useNet((s) => s.players)
  const code = useNet((s) => s.code)
  const sid = useNet((s) => s.sessionId)
  if (status !== 'online') return null
  // Sends the invite link: the phone's share sheet where there is one, else the clipboard.
  const invite = async () => {
    const link = inviteLink(code)
    sfx.click()
    try {
      if (isTouch && navigator.share) {
        await navigator.share({ title: 'Floppy Front', text: `Join my battle! Code ${code}`, url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      useHud.getState().showToast('Invite link copied: send it to your friends', 'info')
    } catch (err) {
      if (err?.name !== 'AbortError') useHud.getState().showToast(`Send them this code: ${code}`, 'info')
    }
  }
  return (
    <section className="ff-room">
      <div className="ff-room__head">
        <span className="ff-room__title">Multiplayer</span>
        {code && (
          <span className="ff-room__code" title="Friends join with this code">
            Code <b>{code}</b>
          </span>
        )}
      </div>
      {code && (
        <button type="button" className="ff-btn ff-btn--small ff-room__invite" onClick={invite}>
          {isTouch && navigator.share ? 'Invite friends' : 'Copy invite link'}
        </button>
      )}
      {players.map((p) => (
        <div key={p.sid} className="ff-room__player">
          <span className={`ff-room__dot ff-room__dot--${p.team}`} />
          <span className="ff-room__name">
            {p.name}
            {p.sid === sid ? ' (you)' : ''}
          </span>
          {p.host && (
            <span className="ff-room__host" title="Host">
              ★
            </span>
          )}
        </div>
      ))}
    </section>
  )
}
