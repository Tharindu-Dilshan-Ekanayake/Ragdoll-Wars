import { HelpBody, SettingsBody } from '../../ui/SettingsHelp'
import { clearBattlefield } from '../commands'
import { Glyph } from './icons'
import { useHud } from './hudStore'
import { RoomCard } from './RoomCard'

/** Modal panels over the battle: settings, how to play, and the two confirmations. */


function Modal({ title, children, onClose, small }) {
  return (
    <div className="ff-modal" role="dialog" aria-label={title} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ff-modal__card ${small ? 'ff-modal__card--small' : ''}`}>
        <div className="ff-modal__head">
          <h2>{title}</h2>
          <button type="button" className="ff-iconbtn ff-iconbtn--small" onClick={onClose} title="Close (Esc)">
            <Glyph name="close" className="ff-ico" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Panels({ onExit }) {
  const panel = useHud((s) => s.panel)
  const setPanel = useHud((s) => s.setPanel)
  const close = () => setPanel(null)
  if (!panel) return null
  if (panel === 'settings')
    return (
      <Modal title="Settings" onClose={close}>
        <RoomCard />
        <SettingsBody />
      </Modal>
    )
  if (panel === 'help')
    return (
      <Modal title="How to play" onClose={close}>
        <HelpBody />
      </Modal>
    )
  if (panel === 'clear')
    return (
      <Modal title="Clear the battlefield?" onClose={close} small>
        <p className="ff-modal__text">Every soldier and body is removed and the casualty count resets.</p>
        <div className="ff-modal__buttons">
          <button type="button" className="ff-btn" onClick={close}>
            Keep fighting
          </button>
          <button
            type="button"
            className="ff-btn ff-btn--danger"
            onClick={() => {
              clearBattlefield()
              close()
            }}
          >
            Clear all
          </button>
        </div>
      </Modal>
    )
  if (panel === 'exit')
    return (
      <Modal title="Leave this battle?" onClose={close} small>
        <p className="ff-modal__text">You'll go back to the Sea Fort. Anything not saved in the Saves tab is lost.</p>
        <div className="ff-modal__buttons">
          <button type="button" className="ff-btn" onClick={close}>
            Stay
          </button>
          <button
            type="button"
            className="ff-btn ff-btn--accent"
            onClick={() => {
              close()
              onExit()
            }}
          >
            Sea Fort
          </button>
        </div>
      </Modal>
    )
  return null
}
