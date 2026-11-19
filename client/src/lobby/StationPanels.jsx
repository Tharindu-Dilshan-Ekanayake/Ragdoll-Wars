import { sfx } from '../audio/sfx'
import { Glyph, WeaponIcon } from '../battle/hud/icons'
import { MAPS, ZOMBIE_MAP } from '../battle/maps'
import { UNIT_ORDER, UNIT_TYPES } from '../battle/sim/units'
import { useApp } from '../store/app'
import { useProgress, ZOMBIE_BADGES } from '../store/progress'
import { useEffect, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { joinBattle, parseCode } from '../net/battleNet'
import { cloudText, fetchBoards, useCloud } from '../net/cloud'
import { LEADERBOARDS } from '../shared/profile'
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
            <p title={m.blurb}>{m.blurb}</p>
            <button
              type="button"
              className="ff-btn ff-btn--accent"
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
  if (u.unarmed) return 'Unarmed'
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
          <span className="ff-tag ff-tag--warn">20 waves</span>
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

/** Blue or Red: which army you'll build in the battle. */
function SidePick({ team, setTeam }) {
  return (
    <div className="ff-seg ff-mp__sides" role="group" aria-label="Your side">
      {[
        [0, 'Blue'],
        [1, 'Red'],
      ].map(([id, label]) => (
        <button
          type="button"
          key={id}
          className={`ff-chip ff-mp__side ff-mp__side--${id} ${team === id ? 'is-on' : ''}`}
          onClick={() => {
            setTeam(id)
            sfx.toggle()
          }}
        >
          <span className="ff-mp__sidedot" />
          {label}
        </button>
      ))}
    </div>
  )
}

function MultiplayerPanel() {
  const { identity } = useBloxity()
  const status = useNet((s) => s.status)
  const message = useNet((s) => s.message)
  const [mapId, setMapId] = useState(MAPS[0].id)
  const [mode, setMode] = useState('sandbox')
  const [team, setTeam] = useState(0)
  const [code, setCode] = useState('')
  const name = identity?.displayName || identity?.username || 'Commander'
  const busy = status === 'connecting'
  const zombies = mode === 'zombies'
  const go = (how) => {
    sfx.click()
    joinBattle({ ...how, team }, name)
  }
  return (
    <div className="ff-mp">
      <section className="ff-mp__card ff-mp__card--wide">
        <h3>Your side</h3>
        <p>Pick Blue or Red, then build your own army in the battle. You can switch side there too. (Zombie Horde: everyone fights together on one side.)</p>
        <SidePick team={team} setTeam={setTeam} />
      </section>
      <section className="ff-mp__card">
        <h3>Create a room</h3>
        <p>You get a room code to send to your friends: up to 4 players. You choose the mode and the map.</p>
        <div className="ff-seg">
          {[
            ['sandbox', 'Sandbox battle'],
            ['zombies', 'Co-op Zombie Horde'],
          ].map(([id, label]) => (
            <button type="button" key={id} className={`ff-chip ${mode === id ? 'is-on' : ''}`} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        {zombies ? (
          <p>Map: {ZOMBIE_MAP.name} · {ZOMBIE_MAP.size}</p>
        ) : (
          <select className="ff-select" value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
            {MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.size}
              </option>
            ))}
          </select>
        )}
        <div className="ff-mp__row">
          <button type="button" className="ff-btn ff-btn--accent" disabled={busy} onClick={() => go({ kind: 'private', mode, mapId })}>
            Create room
          </button>
        </div>
      </section>
      <section className="ff-mp__card">
        <h3>Enter a room code</h3>
        <p>Got a code (or an invite link) from a friend? Put it in and you join their battle.</p>
        <div className="ff-mp__row">
          <input
            className="ff-input"
            value={code}
            maxLength={200}
            placeholder="Room code or invite link"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && parseCode(code) && go({ kind: 'code', code })}
          />
          <button type="button" className="ff-btn ff-btn--accent" disabled={busy || !parseCode(code)} onClick={() => go({ kind: 'code', code })}>
            Join room
          </button>
        </div>
      </section>
      <section className="ff-mp__card ff-mp__card--wide ff-mp__quick">
        <h3>Or just play</h3>
        <p>Jump into any open battle with other players (or start one they can join).</p>
        <div className="ff-mp__row">
          <button type="button" className="ff-btn" disabled={busy} onClick={() => go({ kind: 'quick', mode: 'sandbox' })}>
            Quick sandbox
          </button>
          <button type="button" className="ff-btn" disabled={busy} onClick={() => go({ kind: 'quick', mode: 'zombies' })}>
            Quick Zombie Horde
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

/** A board's number as people read it (minutes as hours and minutes). */
function boardValue(id, v) {
  if (id === 'playtime') return v >= 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v}m`
  if (id === 'zombie_wave') return `Wave ${v}`
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v)
}

function LeaderboardPanel() {
  const boards = useCloud((s) => s.boards)
  const loading = useCloud((s) => s.boardsLoading)
  const error = useCloud((s) => s.boardsError)
  const status = useCloud((s) => s.status)
  const { isLoggedIn, login, isReady } = useBloxity()
  const [tab, setTab] = useState(LEADERBOARDS[0].id)
  useEffect(() => {
    fetchBoards()
  }, [])
  const board = boards?.boards?.find((b) => b.id === tab)
  return (
    <div className="ff-ranks">
      <div className="ff-seg ff-ranks__tabs">
        {LEADERBOARDS.map((b) => (
          <button key={b.id} type="button" className={`ff-chip ${tab === b.id ? 'is-on' : ''}`} onClick={() => setTab(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      <ol className="ff-ranks__list">
        {board?.top?.length
          ? board.top.map((r, i) => (
              <li key={`${r.name}-${i}`} className={`ff-ranks__row ${i < 3 ? `is-top is-top${i + 1}` : ''}`}>
                <span className="ff-ranks__pos">{i + 1}</span>
                <span className="ff-ranks__name">{r.name}</span>
                <span className="ff-ranks__val">{boardValue(tab, r.value)}</span>
              </li>
            ))
          : !loading && <li className="ff-ranks__empty">{error || (board ? 'Nobody on this board yet - be the first!' : 'No leaderboards yet')}</li>}
        {loading && !board && <li className="ff-ranks__empty">Loading…</li>}
      </ol>
      {board?.me && (
        <div className="ff-ranks__row ff-ranks__me">
          <span className="ff-ranks__pos">{board.me.rank ? `#${board.me.rank}` : '-'}</span>
          <span className="ff-ranks__name">You</span>
          <span className="ff-ranks__val">{boardValue(tab, board.me.value)}</span>
        </div>
      )}
      <div className="ff-ranks__foot">
        <Glyph name="cloud" className="ff-ico" />
        <span>{cloudText(status, isLoggedIn)}</span>
        {isReady && !isLoggedIn && (
          <button type="button" className="ff-btn ff-btn--small ff-btn--accent" onClick={login}>
            Sign in
          </button>
        )}
      </div>
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
  if (panel === 'ranks')
    return (
      <Modal title="Leaderboards" kicker="Top commanders" onClose={close}>
        <LeaderboardPanel />
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
