import { sfx } from '../audio/sfx'
import { useSettings } from '../store/settings'
import { QUALITY_LEVELS, useQuality } from '../store/quality'

/**
 * Settings and how-to-play contents, shared by the main menu and the battle (kept free
 * of battle code so the menu can show them without loading the battle chunk).
 */

export function SettingsBody() {
  const level = useQuality((s) => s.level)
  const manual = useQuality((s) => s.manual)
  const setLevel = useQuality((s) => s.setLevel)
  const blood = useSettings((s) => s.blood)
  const setBlood = useSettings((s) => s.setBlood)
  const volume = useSettings((s) => s.volume)
  const setVolume = useSettings((s) => s.setVolume)
  const settings = useQuality((s) => s.settings)
  return (
    <div className="ff-form">
      <div className="ff-form__row">
        <div className="ff-form__label">
          Graphics
          <small>{manual ? 'Picked by you' : 'Auto (drops by itself if the game gets slow)'}</small>
        </div>
        <div className="ff-seg">
          {QUALITY_LEVELS.map((l) => (
            <button
              type="button"
              key={l}
              className={`ff-chip ${level === l ? 'is-on' : ''}`}
              onClick={() => {
                setLevel(l, true)
                sfx.toggle()
              }}
            >
              {l[0] + l.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="ff-form__note">
        {settings.units} soldiers per team · {settings.shadows === 'realtime' ? 'real shadows' : 'soft shadows'} · {settings.particles ? 'particles on' : 'no particles'}
      </p>
      <div className="ff-form__row">
        <div className="ff-form__label">Blood</div>
        <div className="ff-seg">
          {[
            [true, 'On'],
            [false, 'Off'],
          ].map(([v, label]) => (
            <button
              type="button"
              key={label}
              className={`ff-chip ${blood === v ? 'is-on' : ''}`}
              onClick={() => {
                setBlood(v)
                sfx.toggle()
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="ff-form__row">
        <label className="ff-form__label" htmlFor="ff-volume">
          Sound
        </label>
        <input id="ff-volume" className="ff-range" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </div>
    </div>
  )
}

export function HelpBody() {
  return (
    <div className="ff-help">
      <section>
        <h3>Mouse &amp; keyboard</h3>
        <ul>
          <li>
            <b>1–6</b> or a card: pick a unit, then <b>click</b> the ground to drop it
          </li>
          <li>
            <b>Drag</b> to select soldiers · <b>click</b> the ground to send them there
          </li>
          <li>
            <b>Z / X / C</b>: Attack · Hold · Flank &nbsp; <b>Tab</b>: switch team
          </li>
          <li>
            <b>Right-drag</b> to turn · <b>scroll</b> to zoom · <b>WASD</b> to move · <b>Q / E</b> to turn
          </li>
          <li>
            <b>Space</b> pause · <b>Del</b> delete selected · <b>F</b> focus · <b>Esc</b> cancel
          </li>
        </ul>
      </section>
      <section>
        <h3>Touch</h3>
        <ul>
          <li>Tap a card, then tap the ground to drop soldiers</li>
          <li>Drag to pan · pinch to zoom · twist with two fingers to turn</li>
          <li>Tap a soldier to inspect · turn on Box select to drag-select</li>
        </ul>
      </section>
      <section>
        <h3>How the fighting works</h3>
        <ul>
          <li>Soldiers find targets they can actually see; walls and sandbags stop bullets.</li>
          <li>Hits land where they land: a leg wound makes them limp, both legs and they crawl, an arm wound spoils their aim, and wounds bleed.</li>
          <li>Badly hurt soldiers go down and drag themselves away. Attack charges in, Hold stays and takes cover, Flank swings round the side.</li>
        </ul>
      </section>
    </div>
  )
}
