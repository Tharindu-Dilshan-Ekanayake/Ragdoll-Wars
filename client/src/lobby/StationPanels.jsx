import { sfx } from '../audio/sfx'
import { Glyph, WeaponIcon } from '../battle/hud/icons'
import { MAPS, ZOMBIE_MAP } from '../battle/maps'
import { UNIT_ORDER, UNIT_TYPES } from '../battle/sim/units'
import { useApp } from '../store/app'
import { useProgress, ZOMBIE_BADGES } from '../store/progress'
import { useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { joinBattle } from '../net/battleNet'
import { useNet } from '../store/net'
import { useSaves } from '../store/saves'
import { HelpBody, SettingsBody } from '../ui/SettingsHelp'
import { STATIONS } from './seaFort'
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

function SavedBattles() {
  const saves = useSaves((s) => s.saves)
  const startBattle = useApp((s) => s.startBattle)
  if (!saves.length) return null
  return (
    <section className="ff-saved">
      <h3>Saved battlefields</h3>
      {saves.map((s) => (
        <div key={s.id} className="ff-save">
          <div className="ff-save__info">
            <span className="ff-save__name">{s.name}</span>
            <span className="ff-save__meta">
              {s.counts.soldiers} soldiers · {s.counts.vehicles} vehicles · {s.counts.pieces} built
            </span>
          </div>
          <button
            type="button"
            className="ff-btn ff-btn--small ff-btn--accent"
            onClick={() => {
              sfx.click()
              startBattle(s.mapId, 'sandbox', s.id)
            }}
          >
            Play
          </button>
        </div>
      ))}
    </section>
  )
}

function SandboxPanel() {
  const startBattle = useApp((s) => s.startBattle)
  return (
    <div className="ff-maps">
      <SavedBattles />
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

    </div>
  )
}

const MAX_RANGE = Math.max(...UNIT_ORDER.map((k) => UNIT_TYPES[k].range))

/** What a unit does per hit, in words: bullets, a blast, fire, or healing. */
function damageText(u) {
  if (u.blast) return `${u.blast.damage} blast · ${u.blast.radius} m`
  if (u.flame) return `${u.flame.dps}/s fire`
  if (u.pellets > 1) return `${u.damage} × ${u.pellets}`
  return u.damage
}

function ArmoryPanel() {
  return (
    <div className="ff-roster">
      {UNIT_ORDER.map((k, i) => {
        const u = UNIT_TYPES[k]
        // Single-shot launchers are paced by their reload.
        const rpm = Math.round(60 / (u.mag === 1 ? u.interval + u.reload : u.interval))
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
              <dd>{damageText(u)}</dd>
              {u.medic && (
                <>
                  <dt>Heals</dt>
                  <dd>
                    {u.medic.heal} HP · revives
                  </dd>
                </>
              )}
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

function ZombiePanel() {
  const startBattle = useApp((s) => s.startBattle)
  const best = useProgress((s) => s.zombieBest)
  const badges = useProgress((s) => s.badges)
  return (
    <div className="ff-zpanel">
      <div className="ff-zpanel__hero">
        <div className="ff-zpanel__tags">
          <span className="ff-tag ff-tag--warn">15 waves</span>
          <span className="ff-tag">Best: wave {best || '-'}</span>
        </div>
        <div className="ff-zpanel__title">Keep the bastion standing.</div>
      </div>
      <p>
        Mirefall Bastion: a stone rampart across a drowned marsh, and the dead coming out of the mist. Put your troops up on the wall to shoot down into the horde - they
        can't climb it, but they'll pound a section until it falls. Every zombie you drop pays a bounty, every wave cleared pays a bonus and patches the wall. Ten zombies
        through and it's over.
      </p>
      <ul>
        <li>Click the top of the rampart to place troops on it; walk up the stairs yourself</li>
        <li>Walkers, fast Runners, hulking Brutes - and a giant Behemoth on waves 10 and 15</li>
        <li>Start with $500; machine guns, rockets and mortars on the wall are your friends</li>
      </ul>
      <div className="ff-badges">
        {ZOMBIE_BADGES.map((b) => (
          <div key={b.id} className={`ff-badge ff-badge--${b.id} ${badges[b.id] ? '' : 'is-locked'}`} title={b.text}>
            <span className="ff-badge__star">★</span>
            <span>
              {b.name}
              <small>{b.text}</small>
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ff-btn ff-btn--accent ff-btn--big"
        onClick={() => {
          sfx.click()
          startBattle(ZOMBIE_MAP.id, 'zombies')
        }}
      >
        Play Zombie Horde
      </button>
    </div>
  )
}

function MultiplayerPanel() {
  const { identity } = useBloxity()
  const status = useNet((s) => s.status)
  const message = useNet((s) => s.message)
  const [mapId, setMapId] = useState('training')
  const [mode, setMode] = useState('sandbox')
  const [code, setCode] = useState('')
  const name = identity?.displayName || identity?.username || 'Commander'
  const busy = status === 'connecting'
  const go = (how) => {
    sfx.click()
    joinBattle(how, name)
  }
  return (
    <div className="ff-mp">
      <section className="ff-mp__card">
        <h3>Quick match</h3>
        <p>Jump into an open battle with other players, or start one they can join.</p>
        <div className="ff-mp__row">
          <button type="button" className="ff-btn ff-btn--accent" disabled={busy} onClick={() => go({ kind: 'quick', mode: 'sandbox' })}>
            Sandbox battle
          </button>
          <button type="button" className="ff-btn ff-btn--accent" disabled={busy} onClick={() => go({ kind: 'quick', mode: 'zombies' })}>
            Co-op Zombie Horde
          </button>
        </div>
      </section>
      <section className="ff-mp__card">
        <h3>Private battle</h3>
        <p>Start a battle only friends with the code can join (up to 4 players).</p>
        <div className="ff-mp__row">
          <select className="ff-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="sandbox">Sandbox battle</option>
            <option value="zombies">Co-op Zombie Horde</option>
          </select>
          {mode === 'sandbox' && (
            <select className="ff-select" value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
              {MAPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="ff-btn" disabled={busy} onClick={() => go({ kind: 'private', mode, mapId })}>
            Create
          </button>
        </div>
      </section>
      <section className="ff-mp__card">
        <h3>Join a friend</h3>
        <div className="ff-mp__row">
          <input
            className="ff-input"
            value={code}
            maxLength={8}
            placeholder="Battle code"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code.trim() && go({ kind: 'code', code })}
          />
          <button type="button" className="ff-btn" disabled={busy || !code.trim()} onClick={() => go({ kind: 'code', code })}>
            Join
          </button>
        </div>
      </section>
      {(busy || status === 'error') && <div className={`ff-mp__status ${status === 'error' ? 'is-error' : ''}`}>{message}</div>}
    </div>
  )
}

function LobbyControls() {
  return (
    <div className="ff-help">
      <section>
        <h3>Getting around the Sea Fort</h3>
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
      <Modal title="Zombie Horde" kicker="Wave survival" onClose={close} wide>
        <ZombiePanel />
      </Modal>
    )
  return (
    <Modal title="Multiplayer" kicker="Play with friends" onClose={close} wide>
      <MultiplayerPanel />
    </Modal>
  )
}
