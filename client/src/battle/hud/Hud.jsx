import { useEffect, useRef, useState } from 'react'

import { sfx } from '../../audio/sfx'
import { useApp } from '../../store/app'
import { useQuality } from '../../store/quality'
import { TEAMS } from '../sim/constants'
import { BUILD_GROUPS, BUILD_TYPES } from '../sim/structures'
import { DOCK_GROUPS, UNIT_ORDER, UNIT_TYPES } from '../sim/units'
import { useProgress } from '../../store/progress'
import { MAX_SAVES, useSaves } from '../../store/saves'
import { useCloud } from '../../net/cloud'
import { MAPS } from '../maps'
import { applySave, saveCounts, serialize } from '../sim/saveGame'
import { battle } from '../state'
import { deleteSelection, deselect, focusSelection, giveOrder, quickBattle, restartRun, selectAll, setSpeedCmd, setTeamCmd, startWaveNow, togglePauseCmd } from '../commands'
import { net } from '../../net/battleNet'
import { me, useNet } from '../../store/net'
import { PRICES } from '../sim/zombies'
import TouchStick from '../../lobby/TouchStick'
import { toggleWalk } from '../walk/walkMode'
import { BodyDiagram, Glyph, WeaponIcon } from './icons'
import { renderThumbnails } from './thumbnails'
import { useHud } from './hudStore'
import Panels from './Panels'
import GameLogo from './GameLogo'

/**
 * The battle HUD (DOM over the canvas). Layout: score and speed across the top, the
 * command rail on the left (team, orders, squad size), unit cards along the bottom,
 * actions bottom-right, and the soldier inspector top-right when something is picked.
 */

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** How much of the rampart is left, in percent, from its sections' (-1: fallen). */
const wallLeft = (wall) => Math.round(wall.reduce((a, p) => a + Math.max(0, p), 0) / wall.length)

/** Zombie Horde's top bar: wave, zombies left, cash, the wall or breaches, and Start wave. */
function ZombieBar() {
  const z = useHud((s) => s.zombie)
  if (!z) return null
  const building = z.state === 'build' && !z.result
  return (
    <div className="ff-zbar">
      <div className="ff-zbar__cell">
        <span className="ff-zbar__label">Wave</span>
        <span className="ff-zbar__num">
          {Math.max(1, z.wave + (building ? 1 : 0))}
          <small>/{z.total}</small>
        </span>
      </div>
      <div className="ff-zbar__cell">
        <span className="ff-zbar__label">{building ? 'Next wave' : 'Zombies'}</span>
        <span className="ff-zbar__num">{building ? `${z.buildT}s` : z.left}</span>
      </div>
      <div className="ff-zbar__cell ff-zbar__cell--cash">
        <span className="ff-zbar__label">Cash</span>
        <span className="ff-zbar__num">${z.cash}</span>
      </div>
      {z.wall && (
        <div className={`ff-zbar__cell ff-zbar__cell--wall ${z.wall.some((p) => p >= 0 && p < 30) || z.wall.includes(-1) ? 'is-danger' : ''}`}>
          <span className="ff-zbar__label">Rampart</span>
          <span className="ff-wallpips" title="Rampart sections, south to north">
            {z.wall.map((p, i) => (
              <span key={i} className={`ff-wallpip ${p < 0 ? 'is-down' : p < 30 ? 'is-low' : p < 65 ? 'is-mid' : ''}`}>
                <span style={{ height: `${Math.max(0, p)}%` }} />
              </span>
            ))}
          </span>
        </div>
      )}
      {z.wall ? (
        <div className={`ff-zbar__cell ${wallLeft(z.wall) < 35 ? 'is-danger' : ''}`}>
          <span className="ff-zbar__label">Wall</span>
          <span className="ff-zbar__num">{wallLeft(z.wall)}%</span>
        </div>
      ) : (
        <div className={`ff-zbar__cell ${z.breaches >= z.maxBreaches - 3 ? 'is-danger' : ''}`}>
          <span className="ff-zbar__label">Breaches</span>
          <span className="ff-zbar__num">
            {z.breaches}
            <small>/{z.maxBreaches}</small>
          </span>
        </div>
      )}
      {building && (
        <button type="button" className="ff-btn ff-btn--accent ff-zbar__go" onClick={startWaveNow}>
          Start wave
          <Glyph name="play" className="ff-ico" />
        </button>
      )}
    </div>
  )
}

/** Zombie Horde's end screen; records the run once. */
function ZombieResult({ onExit }) {
  const z = useHud((s) => s.zombie)
  const result = z?.result
  const best = useProgress((s) => s.zombieBest)
  const [fresh, setFresh] = useState([])
  const recorded = useRef(null)
  useEffect(() => {
    if (!result || recorded.current === result) return
    recorded.current = result
    const earned = useProgress.getState().recordZombieRun(z.wave, result === 'won', z.kills)
    setFresh(earned)
    sfx[result === 'won' ? 'select' : 'error']()
  }, [result, z])
  useEffect(() => {
    if (!result) recorded.current = null
  }, [result])
  if (!result) return null
  const won = result === 'won'
  return (
    <div className="ff-modal" role="dialog" aria-label="Zombie Horde">
      <div className="ff-modal__card ff-zresult">
        <div className="ff-modal__kicker">Zombie Horde</div>
        <h2>{won ? 'You held the line!' : z.wall ? `The wall fell on wave ${z.wave}` : `Overrun on wave ${z.wave}`}</h2>
        <p className="ff-modal__text">
          {won ? `All ${z.total} waves survived` : z.wall ? 'The horde tore the whole wall down' : `${z.breaches} zombies broke through`} · {z.kills} zombies dropped · best wave {Math.max(best, won ? z.total : z.wave)}
        </p>
        {fresh.length > 0 && (
          <div className="ff-badges">
            {fresh.map((b) => (
              <div key={b.id} className={`ff-badge ff-badge--${b.id}`}>
                <span className="ff-badge__star">★</span>
                <span>{b.name} earned!</span>
              </div>
            ))}
          </div>
        )}
        <div className="ff-modal__buttons">
          <button type="button" className="ff-btn" onClick={onExit}>
            Back to the Sea Fort
          </button>
          <button type="button" className="ff-btn ff-btn--accent" onClick={restartRun}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}

function TopBar() {
  const mode = useHud((s) => s.mode)
  const stats = useHud((s) => s.stats)
  const speed = useHud((s) => s.speed)
  const paused = useHud((s) => s.paused)
  const speeds = [0.5, 1, 2]
  if (mode === 'zombies')
    return (
      <div className="ff-top ff-top--zombies">
        <ZombieBar />
        <div className="ff-speed">
          <button
            type="button"
            className={`ff-chip ${paused ? 'is-on' : ''}`}
            onClick={() => {
              togglePauseCmd()
              sfx.toggle()
            }}
            title="Pause (Space)"
          >
            <Glyph name={paused ? 'play' : 'pause'} className="ff-ico" />
          </button>
          {speeds.map((v) => (
            <button
              type="button"
              key={v}
              className={`ff-chip ${!paused && speed === v ? 'is-on' : ''}`}
              onClick={() => {
                setSpeedCmd(v)
                sfx.toggle()
              }}
            >
              {v === 0.5 ? '½×' : `${v}×`}
            </button>
          ))}
        </div>
        {paused && <div className="ff-paused">Paused</div>}
      </div>
    )
  return (
    <div className="ff-top">
      <div className="ff-score ff-score--blue">
        <span className="ff-score__name">Blue</span>
        <span className="ff-score__num">{stats.alive[0]}</span>
        <span className="ff-score__lost" title="Casualties">
          ✝ {stats.lost[0]}
        </span>
      </div>
      <div className="ff-speed">
        <button
          type="button"
          className={`ff-chip ${paused ? 'is-on' : ''}`}
          onClick={() => {
            togglePauseCmd()
            sfx.toggle()
          }}
          title="Pause (Space)"
        >
          <Glyph name={paused ? 'play' : 'pause'} className="ff-ico" />
        </button>
        {speeds.map((v) => (
          <button
            type="button"
            key={v}
            className={`ff-chip ${!paused && speed === v ? 'is-on' : ''}`}
            onClick={() => {
              setSpeedCmd(v)
              sfx.toggle()
            }}
          >
            {v === 0.5 ? '½×' : `${v}×`}
          </button>
        ))}
      </div>
      <div className="ff-score ff-score--red">
        <span className="ff-score__lost" title="Casualties">
          ✝ {stats.lost[1]}
        </span>
        <span className="ff-score__num">{stats.alive[1]}</span>
        <span className="ff-score__name">Red</span>
      </div>
      {paused && <div className="ff-paused">Paused</div>}
    </div>
  )
}

function Corner({ onExit }) {
  const setPanel = useHud((s) => s.setPanel)
  const walking = useHud((s) => s.walking)
  return (
    <div className="ff-corner">
      <button type="button" className="ff-iconbtn" title="Back to the Sea Fort" onClick={() => setPanel('exit')}>
        <Glyph name="menu" className="ff-ico" />
      </button>
      <button type="button" className="ff-iconbtn" title="Settings" onClick={() => setPanel('settings')}>
        <Glyph name="gear" className="ff-ico" />
      </button>
      <button type="button" className="ff-iconbtn" title="How to play (H)" onClick={() => setPanel('help')}>
        <Glyph name="help" className="ff-ico" />
      </button>
      <button
        type="button"
        className="ff-viewbtn"
        title={walking ? 'Look down on the whole battle (V)' : 'Back to your avatar (V)'}
        onClick={() => {
          toggleWalk()
          sfx.toggle()
        }}
      >
        <Glyph name={walking ? 'command' : 'walk'} className="ff-ico" />
        <span>{walking ? 'Top view' : 'Walk'}</span>
      </button>
      <Panels onExit={onExit} />
    </div>
  )
}

const ORDER_INFO = [
  { key: 'attack', label: 'Attack', glyph: 'attack', hot: 'Z' },
  { key: 'hold', label: 'Hold', glyph: 'hold', hot: 'X' },
  { key: 'flank', label: 'Flank', glyph: 'flank', hot: 'C' },
]

function Rail() {
  const team = useHud((s) => s.team)
  const order = useHud((s) => s.order)
  const count = useHud((s) => s.count)
  const selectMode = useHud((s) => s.selectMode)
  const setCount = useHud((s) => s.setCount)
  const toggleSelectMode = useHud((s) => s.toggleSelectMode)
  const zombies = useHud((s) => s.mode === 'zombies')
  return (
    <div className="ff-rail">
      <div className={`ff-rail__group ${zombies ? 'is-gone' : ''}`}>
        <div className="ff-rail__label">Team</div>
        {TEAMS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`ff-team ff-team--${t.key} ${team === t.id ? 'is-on' : ''}`}
            onClick={() => {
              setTeamCmd(t.id)
              sfx.toggle()
            }}
            title="Switch team (Tab)"
          >
            <span className="ff-team__flag" />
            {t.name}
          </button>
        ))}
      </div>
      <div className="ff-rail__group">
        <div className="ff-rail__label">Orders</div>
        {ORDER_INFO.map((o) => (
          <button type="button" key={o.key} className={`ff-order ${order === o.key ? 'is-on' : ''}`} onClick={() => giveOrder(o.key)} title={`${o.label} (${o.hot})`}>
            <Glyph name={o.glyph} className="ff-ico" />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <div className="ff-rail__group ff-rail__group--row">
        <div className="ff-rail__label">Squad</div>
        {[1, 5, 10].map((n) => (
          <button
            type="button"
            key={n}
            className={`ff-chip ${count === n ? 'is-on' : ''}`}
            onClick={() => {
              setCount(n)
              sfx.toggle()
            }}
          >
            ×{n}
          </button>
        ))}
      </div>
      {isTouch && (
        <button type="button" className={`ff-order ${selectMode ? 'is-on' : ''}`} onClick={toggleSelectMode}>
          <Glyph name="box" className="ff-ico" />
          <span>Box select</span>
        </button>
      )}
    </div>
  )
}

const mapName = (id) => MAPS.find((m) => m.id === id)?.name || id

/** The Saves tab: keep this battlefield, or bring back one saved earlier. */
function SavesPanel() {
  const saves = useSaves((s) => s.saves)
  const add = useSaves((s) => s.add)
  const remove = useSaves((s) => s.remove)
  const showToast = useHud((s) => s.showToast)
  const inCloud = useCloud((s) => s.status === 'synced' || s.status === 'saving')
  const save = () => {
    const w = battle.world
    if (!w) return
    const data = serialize(w)
    const counts = saveCounts(data)
    if (!counts.soldiers && !counts.vehicles && !counts.pieces && !counts.mines) {
      showToast('Nothing to save yet - put something on the battlefield first', 'info')
      return
    }
    const when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    if (!add({ name: `${mapName(data.mapId)} · ${when}`, mapId: data.mapId, savedAt: Date.now(), counts, data })) {
      showToast(`All ${MAX_SAVES} slots are full - delete one first`)
      sfx.error()
      return
    }
    showToast('Battlefield saved', 'info')
    sfx.select()
  }
  const load = (s) => {
    const w = battle.world
    if (!w) return
    if (net.online()) {
      if (!me()?.host) return showToast('Only the host can load a battlefield', 'info')
      if (s.mapId !== w.map.id) return showToast('That save is for another map')
      net.send('load', s.data)
      return
    }
    if (s.mapId === w.map.id) {
      applySave(w, s.data)
      showToast(`Loaded ${s.name}`, 'info')
      sfx.place()
    } else {
      useApp.getState().startBattle(s.mapId, 'sandbox', s.id)
    }
  }
  return (
    <div className="ff-saves">
      <div className="ff-saves__head">
        <button type="button" className="ff-btn ff-btn--accent" onClick={save}>
          Save this battlefield
        </button>
        <span className="ff-saves__count">
          {saves.length}/{MAX_SAVES} slots · {inCloud ? 'backed up to the cloud' : 'saved in this browser'}
        </span>
      </div>
      {saves.length === 0 && <div className="ff-saves__empty">No saved battlefields yet. Set up a fight, then save it here to play it again later.</div>}
      <div className="ff-saves__list">
        {saves.map((s) => (
          <div key={s.id} className="ff-save">
            <div className="ff-save__info">
              <span className="ff-save__name">{s.name}</span>
              <span className="ff-save__meta">
                {s.counts.soldiers} soldiers · {s.counts.vehicles} vehicles · {s.counts.pieces} built · {s.counts.mines} mines
              </span>
            </div>
            <button type="button" className="ff-btn ff-btn--small" onClick={() => load(s)}>
              Load
            </button>
            <button
              type="button"
              className="ff-iconbtn ff-iconbtn--small"
              title="Delete"
              onClick={() => {
                remove(s.id)
                sfx.remove()
              }}
            >
              <Glyph name="trash" className="ff-ico" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Every card's key, units and build pieces. */
const CARD_KEYS = [...DOCK_GROUPS.flatMap((g) => g.keys), ...BUILD_GROUPS.flatMap((g) => g.keys).filter((k) => k !== 'remove')]

/**
 * The cards' pictures (thumbnails.js renders them from the 3D models once a page; the
 * SVG silhouettes show until they're ready).
 */
function useCardArt() {
  const [thumbs, setThumbs] = useState({})
  useEffect(() => {
    let alive = true
    const got = {}
    let flushT = 0
    const flush = () => {
      flushT = 0
      if (alive) setThumbs({ ...got })
    }
    // Let the battle's first frames go first.
    const start = setTimeout(() => {
      renderThumbnails(CARD_KEYS, (k, url) => {
        got[k] = url
        if (!flushT) flushT = setTimeout(flush, 120)
      }).then(() => alive && flush())
    }, 900)
    return () => {
      alive = false
      clearTimeout(start)
      clearTimeout(flushT)
    }
  }, [])
  return thumbs
}

function Tray() {
  const placing = useHud((s) => s.placing)
  const team = useHud((s) => s.team)
  const setPlacing = useHud((s) => s.setPlacing)
  const hidden = useHud((s) => s.dockHidden)
  const toggleDock = useHud((s) => s.toggleDock)
  const tab = useHud((s) => s.dockTab)
  const setTab = useHud((s) => s.setDockTab)
  const rot = useHud((s) => s.buildRot)
  const rotate = useHud((s) => s.rotateBuild)
  const building = tab === 'build'
  const priced = useHud((s) => s.mode === 'zombies')
  const cash = useHud((s) => s.zombie?.cash ?? Infinity)
  const price = (key) => (priced && PRICES[key] ? <span className="ff-card__price">${PRICES[key]}</span> : null)
  const poor = (key) => priced && PRICES[key] > cash
  const thumbs = useCardArt()
  const art = (key) => (
    <span className="ff-card__art">
      {thumbs[key] ? <img src={thumbs[key]} alt="" draggable={false} /> : <WeaponIcon type={key} className="ff-card__icon" />}
    </span>
  )

  return (
    <div className={`ff-tray ${hidden ? 'is-hidden' : ''}`}>
      <Hint />
      <div className="ff-tray__tabs">
        {[
          ['units', 'Units'],
          ['build', 'Build'],
          ...(priced ? [] : [['saves', 'Saves']]),
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`ff-tab ${tab === key ? 'is-on' : ''}`}
            onClick={() => {
              setTab(key)
              sfx.toggle()
            }}
          >
            {label}
          </button>
        ))}
        {building && (
          <button
            type="button"
            className="ff-tab ff-tab--rotate"
            title="Rotate (R)"
            onClick={() => {
              rotate()
              sfx.toggle()
            }}
          >
            Rotate {rot ? '90°' : '0°'}
          </button>
        )}
      </div>
      {tab === 'saves' ? (
        <SavesPanel />
      ) : building ? (
        <div className="ff-tray__cards">
          <button type="button" className="ff-tray__fold" onClick={toggleDock} title={hidden ? 'Show' : 'Hide'}>
            <Glyph name="chevron" className={`ff-ico ${hidden ? 'is-flipped' : ''}`} />
          </button>
          {BUILD_GROUPS.map((group) => [
            <span key={group.label} className="ff-tray__group ff-g-build">
              {group.label}
            </span>,
            ...group.keys.map((key) => {
              const t = BUILD_TYPES[key]
              return (
                <button
                  type="button"
                  key={key}
                  className={`ff-card ff-card--build ff-g-build ${placing === key ? 'is-on' : ''} ${poor(key) ? 'is-poor' : ''}`}
                  onClick={() => {
                    setPlacing(key)
                    sfx.toggle()
                  }}
                >
                  {price(key)}
                  {art(key)}
                  <span className="ff-card__name">{t.name}</span>
                  <span className="ff-card__role">{t.role}</span>
                </button>
              )
            }),
          ])}
        </div>
      ) : (
      <div className="ff-tray__cards">
        <button type="button" className="ff-tray__fold" onClick={toggleDock} title={hidden ? 'Show units' : 'Hide units'}>
          <Glyph name="chevron" className={`ff-ico ${hidden ? 'is-flipped' : ''}`} />
        </button>
        {DOCK_GROUPS.map((group) => [
          <span key={group.label} className={`ff-tray__group ff-g-${group.label.toLowerCase()}`}>
            {group.label}
          </span>,
          ...group.keys.map((key) => {
            const u = UNIT_TYPES[key]
            const i = UNIT_ORDER.indexOf(key)
            return (
              <button
                type="button"
                key={key}
                className={`ff-card ff-card--team${team} ff-g-${group.label.toLowerCase()} ${placing === key ? 'is-on' : ''} ${poor(key) ? 'is-poor' : ''}`}
                onClick={() => {
                  setPlacing(key)
                  sfx.toggle()
                }}
              >
                {i >= 0 && <span className="ff-card__key">{(i + 1) % 10}</span>}
                {price(key)}
                {art(key)}
                <span className="ff-card__name">{u.name}</span>
                <span className="ff-card__role">{u.role}</span>
              </button>
            )
          }),
        ])}
      </div>
      )}
    </div>
  )
}

function Hint() {
  const placing = useHud((s) => s.placing)
  const mode = useHud((s) => s.mode)
  const zombie = useHud((s) => s.zombie)
  const count = useHud((s) => s.count)
  const team = useHud((s) => s.team)
  const selection = useHud((s) => s.selection)
  const alive = useHud((s) => s.stats.alive)
  const walking = useHud((s) => s.walking)
  let text
  if (walking && !placing && !selection) {
    // Walk mode shows its own controls up top.
    return null
  } else if (placing) {
    const piece = BUILD_TYPES[placing]
    const u = piece || UNIT_TYPES[placing]
    const name = u.name
    const what = piece
      ? piece.tool
        ? 'take down a structure'
        : `build ${count > 1 ? `${piece.scatter ? '' : 'a row of '}${count} × ` : ''}${name}${isTouch ? '' : ' · R to rotate'}`
      : u.strike
      ? `call in the ${name.toLowerCase()} on that spot`
      : u.trap
        ? `lay ${count} ${name.toLowerCase()}${count > 1 ? 's' : ''}`
        : `drop ${count} ${name}${count > 1 ? 's' : ''}`
    text = `${isTouch ? 'Tap' : 'Click'} the ground to ${what}${piece ? '' : ` for ${TEAMS[team].name}`}  ·  ${isTouch ? 'tap the card again' : 'right-click / Esc'} to stop`
  } else if (selection) {
    text = `${selection.count} selected  ·  ${isTouch ? 'tap' : 'click'} the ground to move them  ·  Attack / Hold / Flank to give orders`
  } else if (mode === 'zombies' && zombie && zombie.state === 'build' && !zombie.result) {
    text = 'Buy troops and build defences on the west side, then press Start wave'
  } else if (alive[0] + alive[1] === 0) {
    text = 'Pick a unit below, then click the battlefield to deploy it — or press Quick battle'
  } else if (isTouch) {
    text = 'Drag to pan  ·  pinch to zoom  ·  twist to turn  ·  tap a soldier to inspect'
  } else {
    text = 'Drag to select  ·  right-drag to turn  ·  scroll to zoom  ·  WASD to move'
  }
  return <div className="ff-hint">{text}</div>
}

function Actions() {
  const setPanel = useHud((s) => s.setPanel)
  const zombies = useHud((s) => s.mode === 'zombies')
  return (
    <div className="ff-actions">
      {!zombies && (
        <button type="button" className="ff-action ff-action--accent" onClick={quickBattle} title="Drop two matching armies">
          <Glyph name="bolt" className="ff-ico" />
          <span>Quick battle</span>
        </button>
      )}
      <button type="button" className="ff-action" onClick={selectAll} title="Select your whole team (Ctrl+A)">
        <Glyph name="select" className="ff-ico" />
        <span>Select team</span>
      </button>
      <button type="button" className="ff-action" onClick={focusSelection} title="Camera to selection (F)">
        <Glyph name="focus" className="ff-ico" />
        <span>Focus</span>
      </button>
      <button type="button" className="ff-action" onClick={deleteSelection} title="Delete selected (Del)">
        <Glyph name="trash" className="ff-ico" />
        <span>Delete</span>
      </button>
      {!zombies && (
        <button type="button" className="ff-action ff-action--danger" onClick={() => setPanel('clear')} title="Clear the battlefield">
          <Glyph name="clear" className="ff-ico" />
          <span>Clear all</span>
        </button>
      )}
    </div>
  )
}

const WOUND_NAMES = { head: 'Head', torso: 'Body', armL: 'Left arm', armR: 'Right arm', legL: 'Left leg', legR: 'Right leg' }

function Inspector() {
  const sel = useHud((s) => s.selection)
  if (!sel) return null
  if (sel.unit) {
    const u = sel.unit
    const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))
    const wounds = Object.entries(u.wounds).filter(([, n]) => n > 0)
    return (
      <div className={`ff-inspect ff-inspect--team${u.team}`}>
        <div className="ff-inspect__head">
          <WeaponIcon type={u.type} className="ff-inspect__icon" />
          <div>
            <div className="ff-inspect__title">
              {TEAMS[u.team].name} {u.name}
            </div>
            <div className="ff-inspect__sub">{u.role}</div>
          </div>
          <button type="button" className="ff-iconbtn ff-iconbtn--small" onClick={deselect} title="Close">
            <Glyph name="close" className="ff-ico" />
          </button>
        </div>
        <div className="ff-inspect__body">
          <BodyDiagram wounds={u.wounds} team={u.team} />
          <div className="ff-inspect__stats">
            <div className="ff-hp">
              <div className="ff-hp__bar">
                <span style={{ width: `${hpPct}%` }} className={hpPct < 30 ? 'is-low' : ''} />
              </div>
              <div className="ff-hp__num">
                {u.hp} / {u.maxHp}
              </div>
            </div>
            <dl className="ff-kv">
              <dt>Status</dt>
              <dd className={u.status === 'Downed' ? 'is-bad' : ''}>{u.status}</dd>
              <dt>Orders</dt>
              <dd>{u.order[0].toUpperCase() + u.order.slice(1)}</dd>
              <dt>Ammo</dt>
              <dd>
                {u.mag} / {u.magSize}
              </dd>
              <dt>Range</dt>
              <dd>{u.range} m</dd>
              <dt>Kills</dt>
              <dd>{u.kills}</dd>
            </dl>
          </div>
        </div>
        <div className="ff-wounds">
          {wounds.length === 0 && !u.bleeding && <span className="ff-tag ff-tag--ok">No injuries</span>}
          {wounds.map(([k, n]) => (
            <span key={k} className="ff-tag ff-tag--warn">
              {WOUND_NAMES[k]}
              {n > 1 ? ` ×${n}` : ''}
            </span>
          ))}
          {u.bleeding && <span className="ff-tag ff-tag--bad">Bleeding</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="ff-inspect">
      <div className="ff-inspect__head">
        <div>
          <div className="ff-inspect__title">{sel.count} soldiers</div>
          <div className="ff-inspect__sub">Selected · give them orders on the left</div>
        </div>
        <button type="button" className="ff-iconbtn ff-iconbtn--small" onClick={deselect} title="Deselect">
          <Glyph name="close" className="ff-ico" />
        </button>
      </div>
      <div className="ff-typechips">
        {Object.entries(sel.types).map(([k, n]) => (
          <span key={k} className="ff-typechip">
            <WeaponIcon type={k} className="ff-typechip__icon" />
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Multiplayer: the room's code (private rooms) and who's playing on which side. */
function RoomPanel() {
  const status = useNet((s) => s.status)
  const players = useNet((s) => s.players)
  const code = useNet((s) => s.code)
  const sid = useNet((s) => s.sessionId)
  if (status !== 'online') return null
  return (
    <div className="ff-room">
      <div className="ff-room__head">
        <span className="ff-room__title">Multiplayer</span>
        {code && (
          <span className="ff-room__code" title="Friends join with this code">
            Code <b>{code}</b>
          </span>
        )}
      </div>
      {players.map((p) => (
        <div key={p.sid} className="ff-room__player">
          <span className={`ff-room__dot ff-room__dot--${p.team}`} />
          <span className="ff-room__name">
            {p.name}
            {p.sid === sid ? ' (you)' : ''}
          </span>
          {p.host && <span className="ff-room__host" title="Host">★</span>}
        </div>
      ))}
    </div>
  )
}

function Toast() {
  const toast = useHud((s) => s.toast)
  const clearToast = useHud((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => clearToast(toast.id), 2600)
    return () => clearTimeout(id)
  }, [toast, clearToast])
  if (!toast) return null
  return (
    <div key={toast.id} className={`ff-toast ff-toast--${toast.kind}`}>
      {toast.text}
    </div>
  )
}

/** Walk mode: what the keys do, and the touch stick and jump button. */
function WalkControls() {
  const walking = useHud((s) => s.walking)
  if (!walking) return null
  return (
    <>
      <div className="ff-walkhint">{isTouch ? 'Stick to walk · drag to look · Top view to deploy troops' : 'WASD walk · Shift run · Space jump · drag to look · V top view'}</div>
      <TouchStick target="walk" />
    </>
  )
}

export default function Hud({ onExit }) {
  const panel = useHud((s) => s.panel)
  const walking = useHud((s) => s.walking)
  const level = useQuality((s) => s.level)
  // Boxity's screen ads follow modal panels.
  useEffect(() => {
    useApp.getState().setPanel(Boolean(panel))
  }, [panel])
  return (
    <div className={`ff-hud ${walking ? 'is-walking' : ''}`} data-quality={level}>
      <TopBar />
      <GameLogo />
      <Corner onExit={onExit} />
      <Rail />
      <Inspector />
      <Tray />
      <Actions />
      <Toast />
      <RoomPanel />
      <WalkControls />
      <ZombieResult onExit={onExit} />
    </div>
  )
}
