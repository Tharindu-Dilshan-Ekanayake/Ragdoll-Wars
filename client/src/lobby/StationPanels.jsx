import { sfx } from '../audio/sfx'
import { Glyph, WeaponIcon } from '../battle/hud/icons'
import { MAPS } from '../battle/maps'
import { UNIT_ORDER, UNIT_TYPES } from '../battle/sim/units'
import { useApp } from '../store/app'
import { HelpBody, SettingsBody } from '../ui/SettingsHelp'
import { STATIONS } from './baseCamp'
import { useLobby } from './lobbyState'
import MapPreview from './MapPreview'

/** The panels the lobby's stations open (plus settings and help). */

function Modal({ title, kicker, onClose, wide, children }) {
  return (
    <div className="ff-modal" role="dialog" aria-label={title} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ff-modal__card ${wide ? 'ff-modal__card--wide' : ''}`}>
        <div className="ff-modal__head">
          <div>
            {kicker && <div className="ff-modal__kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="ff-iconbtn ff-iconbtn--small" onClick={onClose} title="Close (Esc)">
            <Glyph name="close" className="ff-ico" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SandboxPanel() {
  const startBattle = useApp((s) => s.startBattle)
  return (
    <div className="ff-maps">
      {MAPS.map((m) => (
        <section key={m.id} className="ff-mapcard">
          <MapPreview entry={m} />
          <div className="ff-mapcard__body">
            <div className="ff-mapcard__title">
              <h3>{m.name}</h3>
              <span>{m.size}</span>
            </div>
            <p>{m.blurb}</p>
            <button
              type="button"
              className="ff-btn ff-btn--accent ff-btn--big"
              onClick={() => {
                sfx.click()
                startBattle(m.id)
              }}
            >
              Deploy
            </button>
          </div>
        </section>
      ))}
      <section className="ff-mapcard ff-mapcard--soon">
        <div className="ff-mapcard__body">
          <div className="ff-mapcard__title">
            <h3>More battlefields</h3>
          </div>
          <p>Desert, snow, beach and city maps are on the way.</p>
        </div>
      </section>
    </div>
  )
}

const MAX_RANGE = Math.max(...UNIT_ORDER.map((k) => UNIT_TYPES[k].range))

function ArmoryPanel() {
  return (
    <div className="ff-roster">
      {UNIT_ORDER.map((k, i) => {
        const u = UNIT_TYPES[k]
        const rpm = Math.round(60 / u.interval)
        return (
          <div key={k} className="ff-roster__unit">
            <div className="ff-roster__head">
              <span className="ff-card__key">{i + 1}</span>
              <WeaponIcon type={k} className="ff-roster__icon" />
              <div>
                <div className="ff-roster__name">{u.name}</div>
                <div className="ff-roster__role">{u.role}</div>
              </div>
            </div>
            <dl className="ff-kv">
              <dt>Health</dt>
              <dd>{u.hp}</dd>
              <dt>Damage</dt>
              <dd>{u.pellets > 1 ? `${u.damage} × ${u.pellets}` : u.damage}</dd>
              <dt>Fire rate</dt>
              <dd>{rpm} / min</dd>
              <dt>Magazine</dt>
              <dd>{u.mag}</dd>
              <dt>Range</dt>
              <dd>{u.range} m</dd>
            </dl>
            <div className="ff-roster__bar">
              <span style={{ width: `${(u.range / MAX_RANGE) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SoonPanel({ text, points }) {
  return (
    <div className="ff-soon">
      <p>{text}</p>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="ff-tag ff-tag--warn">In the works</div>
    </div>
  )
}

function LobbyControls() {
  return (
    <div className="ff-help">
      <section>
        <h3>Getting around Base Camp</h3>
        <ul>
          <li>
            <b>WASD</b> or the arrow keys to walk · <b>Space</b> to jump
          </li>
          <li>
            <b>Drag</b> to look around · <b>scroll</b> to zoom
          </li>
          <li>
            Step into a glowing circle to open that station · <b>E</b> opens it again · <b>Esc</b> closes
          </li>
          <li>On a phone: thumb-stick bottom left, jump bottom right, drag the view to look</li>
        </ul>
      </section>
      <HelpBody />
    </div>
  )
}

export default function StationPanels() {
  const panel = useLobby((s) => s.panel)
  const setPanel = useLobby((s) => s.setPanel)
  if (!panel) return null
  const close = () => setPanel(null)
  if (panel === 'settings')
    return (
      <Modal title="Settings" onClose={close}>
        <SettingsBody />
      </Modal>
    )
  if (panel === 'help' || panel === 'notes')
    return (
      <Modal title="Field Notes" kicker="How to play" onClose={close}>
        <LobbyControls />
      </Modal>
    )
  const st = STATIONS.find((s) => s.id === panel)
  if (!st) return null
  if (panel === 'sandbox')
    return (
      <Modal title="Pick a battlefield" kicker="Single player · sandbox battle" onClose={close} wide>
        <SandboxPanel />
      </Modal>
    )
  if (panel === 'armory')
    return (
      <Modal title="The troops" kicker="Armory" onClose={close} wide>
        <ArmoryPanel />
      </Modal>
    )
  if (panel === 'zombies')
    return (
      <Modal title="Zombie Horde" kicker="Coming soon" onClose={close}>
        <SoonPanel
          text="Dig in behind your defences while bigger and bigger hordes of floppy zombies shamble out of the fog."
          points={['Earn cash for every zombie you drop', 'Spend it on troops between hordes', 'Survive long enough to unlock rewards']}
        />
      </Modal>
    )
  return (
    <Modal title="Multiplayer" kicker="Coming soon" onClose={close}>
      <SoonPanel
        text="Play with friends: everyone commands their own army on the same battlefield."
        points={['Make a lobby and share its code', 'Team up or fight each other', 'Meet other players here at Base Camp']}
      />
    </Modal>
  )
}
