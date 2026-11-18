/**
 * Hand-drawn SVG icons for the HUD: weapon silhouettes for the unit cards and small
 * glyphs for buttons. All original, all inline (no icon font, no image requests).
 */

const WEAPON_PATHS = {
  pistol: 'M6 18h26l2-3h6v6h-4l-1 3H20l-2 9h-8l2-9H6z',
  smg: 'M4 18h34l3-2h10v5h-8l-2 4h-6l-1 9h-6l1-9h-6l-3 7H11l3-7H4z M44 23h3v8h-3z',
  rifle: 'M2 20l10-3h30l3-2h17v4H50l-3 3h-9l-3 10h-6l2-10h-8l-2 6h-6l2-6H12l-10 2z',
  shotgun: 'M2 21l12-4h28l2-2h20v3H46v4H30l-2 3H16l-2-3z M30 22h12v3H30z',
  sniper: 'M1 21l11-4h12v-3h12v3h8l2-2h20v3H48l-3 3H30l-1 4h-5l1-4H13l-12 3z M50 21l4 9h-2l-4-8z',
  mg: 'M1 20l11-4h30l3-3h17v5H48l-2 3h-6v4h-9v-4h-4l-2 6h-6l2-6H12l-11 2z M44 22l4 10h-2l-5-9z M38 21l-3 10h-2l3-10z',
  rocket: 'M2 15h44v8H2z M46 14l12 5-12 5z M14 23h5l-2 9h-5z M28 23h5l-2 7h-5z M20 10h8v5h-8z',
  flame: 'M4 18h26v6H4z M30 19h10v4H30z M40 17l4 1v6l-4 1z M8 24h16a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8z M12 24l-2 8h4l2-8z M46 21c6-6 10-2 14-6-1 5-4 6-2 9-4-1-6 3-12 0z',
  medic: 'M26 4h12v12h12v12H38v12H26V28H14V16h12z',
  mortar: 'M14 26l26-20 4 5-26 20z M10 30h22v3H10z M22 29l-6-9 3-2 6 9z M38 9l6-5 3 4-6 5z',
  mine: 'M8 22c0-5 11-8 24-8s24 3 24 8v4H8z M27 10h10v5H27z M6 26h52v4H6z',
}

export function WeaponIcon({ type, className }) {
  return (
    <svg className={className} viewBox="0 0 64 36" aria-hidden="true">
      <path d={WEAPON_PATHS[type] || WEAPON_PATHS.rifle} fill="currentColor" />
    </svg>
  )
}

const GLYPHS = {
  attack: 'M4 20L16 8l2 2-8 8h12v4H10l8 8-2 2z M20 4l8 8-2 2-8-8z',
  hold: 'M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z',
  flank: 'M5 25V13c0-4 3-7 7-7h9V2l7 7-7 7v-4h-9c-1 0-2 1-2 2v11z',
  select: 'M4 4h6v3H7v3H4z M22 4h6v6h-3V7h-3z M4 22h3v3h3v3H4z M28 22v6h-6v-3h3v-3z M12 12h8v8h-8z',
  trash: 'M9 7h14l-1 20H10z M6 5h20v2H6z M13 2h6v3h-6z',
  clear: 'M16 3l13 23H3z M15 11h2v8h-2z M15 21h2v2h-2z',
  pause: 'M8 6h6v20H8z M18 6h6v20h-6z',
  play: 'M9 5l17 11L9 27z',
  gear: 'M14 2h4l1 4 3 1 3-2 3 3-2 3 1 3 4 1v4l-4 1-1 3 2 3-3 3-3-2-3 1-1 4h-4l-1-4-3-1-3 2-3-3 2-3-1-3-4-1v-4l4-1 1-3-2-3 3-3 3 2 3-1z M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  help: 'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26z M15 21h3v3h-3z M12 12c0-3 2-5 4.5-5S21 9 21 11.5c0 3-4 3.5-4 6.5h-3c0-4 4-4.5 4-6.5 0-1-.7-2-1.5-2-1 0-1.5 1-1.5 2.5z',
  menu: 'M4 7h24v3H4z M4 15h24v3H4z M4 23h24v3H4z',
  close: 'M7 5l9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9-2-2 9-9-9-9z',
  bolt: 'M18 2L6 18h8l-2 12 12-16h-8z',
  focus: 'M16 9a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M15 2h2v6h-2z M15 24h2v6h-2z M2 15h6v2H2z M24 15h6v2h-6z',
  chevron: 'M8 12l8 8 8-8 2 2-10 10L6 14z',
  box: 'M4 4h24v24H4z M7 7v18h18V7z',
}

export function Glyph({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d={GLYPHS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/**
 * A little body diagram: each zone tinted by how badly it's hurt (0 fine, 1 hit,
 * 2+ badly). Used by the soldier inspector.
 */
export function BodyDiagram({ wounds, team }) {
  const base = team === 0 ? '#3d78dc' : '#d64545'
  const tint = (n) => (n >= 2 ? '#ff3b30' : n === 1 ? '#ff9f0a' : base)
  return (
    <svg className="ff-body" viewBox="0 0 40 80" aria-hidden="true">
      <circle cx="20" cy="10" r="7" fill={tint(wounds.head)} />
      <rect x="12" y="19" width="16" height="24" rx="4" fill={tint(wounds.torso)} />
      <rect x="4" y="20" width="7" height="22" rx="3.5" fill={tint(wounds.armR)} />
      <rect x="29" y="20" width="7" height="22" rx="3.5" fill={tint(wounds.armL)} />
      <rect x="12.5" y="44" width="7" height="30" rx="3.5" fill={tint(wounds.legR)} />
      <rect x="20.5" y="44" width="7" height="30" rx="3.5" fill={tint(wounds.legL)} />
    </svg>
  )
}
