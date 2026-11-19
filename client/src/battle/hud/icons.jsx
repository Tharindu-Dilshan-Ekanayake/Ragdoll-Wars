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
  jeep: 'M6 16h18l6-6h10l2 6h14l4 4v6H4v-6z M14 22a5 5 0 1 0 0.01 0z M46 22a5 5 0 1 0 0.01 0z M30 6h3v6h-3z',
  apc: 'M4 18l6-6h38l8 6v8H4z M22 6h14v6H22z M36 8h20v3H36z M10 26a4 4 0 1 0 0.01 0z M22 26a4 4 0 1 0 0.01 0z M38 26a4 4 0 1 0 0.01 0z M50 26a4 4 0 1 0 0.01 0z',
  tank: 'M2 22h60l-6 8H8z M8 16h44l4 6H6z M20 8h18v8H20z M38 10h24v3H38z',
  gunship: 'M10 16h30l8 4-8 4H14z M2 18h10v2H2z M2 14l4 0 3 4H4z M8 10h44v2H8z M18 24l-2 6h20l-2-6z',
  scout: 'M14 16h22l7 4-7 4H18z M4 18h12v2H4z M4 15h3l2 3H5z M12 11h36v2H12z M20 24l-2 5h16l-2-5z',
  airstrike: 'M2 18l20-3 8-9h4l-4 9 18-2 6-5h3l-2 7 2 7h-3l-6-5-18-2 4 9h-4l-8-9-20-3z',
  heavybomb: 'M14 12h28a6 6 0 0 1 0 12H14z M42 13l10-5v20l-10-5z M8 16l6-2v8l-6-2z M22 12h3v12h-3z',
  // Build mode.
  trench: 'M2 20h14l4 6h24l4-6h14v4H50l-4 6H18l-4-6H2z M6 16h10v4H6z M48 16h10v4H48z',
  sandbags: 'M8 26h14v6H8z M24 26h14v6H24z M40 26h14v6H40z M16 19h14v6H16z M32 19h14v6H32z M24 12h14v6H24z',
  barrier: 'M8 30h48l-4-6H44l-2-14H22l-2 14H12z M22 14h20v3H22z',
  blastwall: 'M14 4h36v28H14z M10 30h44v3H10z M18 8h28v2H18z',
  sandwall: 'M6 10h24v22H6z M34 10h24v22H34z M6 17h24v2H6z M34 17h24v2H34z M6 24h24v2H6z M34 24h24v2H34z',
  pipes: 'M18 22a8 8 0 1 0 0.01 0z M46 22a8 8 0 1 0 0.01 0z M32 6a8 8 0 1 0 0.01 0z',
  tanktrap: 'M14 8l4-2 32 24-4 2z M46 6l4 2-32 24-4-2z M30 4h4v28h-4z',
  teeth: 'M4 30l7-16 7 16z M23 30l9-20 9 20z M46 30l7-16 7 16z',
  wire: 'M6 8h3v24H6z M31 8h3v24h-3z M55 8h3v24h-3z M8 18c4-6 8 6 12 0s8 6 12 0 8 6 12 0 8 6 12 0v3c-4 6-8-6-12 0s-8-6-12 0-8-6-12 0-8-6-12 0z',
  cwall: 'M8 6h48v26H8z M8 15h48v2H8z M8 24h48v2H8z M24 6h2v9h-2z M40 17h2v7h-2z',
  bunker: 'M4 14h56v18H4z M2 10h60v5H2z M14 20h36v4H14z',
  tower: 'M14 4h36l-4 8H18z M18 12h28v8H18z M20 20h3v14h-3z M41 20h3v14h-3z M22 26l20-6 1 2-20 6z',
  helipad: 'M4 4h56v28H4z M8 8v20h48V8z M24 11h4v14h-4z M36 11h4v14h-4z M28 16h8v4h-8z',
  container: 'M4 8h56v22H4z M10 11h2v16h-2z M18 11h2v16h-2z M26 11h2v16h-2z M34 11h2v16h-2z M42 11h2v16h-2z M50 11h2v16h-2z',
  tent: 'M32 4L4 32h56z M28 32l4-12 4 12z',
  camonet: 'M4 10l14-4 14 4 14-4 14 4-4 6-12-2-12 3-12-3-12 2z M8 14h2v20H8z M54 14h2v20h-2z',
  floodlight: 'M20 4h24v10H20z M31 14h2v18h-2z M24 30h16v3H24z M22 6h20v6H22z',
  radiomast: 'M31 2h2v32h-2z M22 10h20v2H22z M25 18h14v2H25z M27 26h10v2H27z M32 4L18 32h2L32 8l12 24h2z',
  crate: 'M14 6h36v26H14z M17 9v20h30V9z M17 9l30 20-2 0-28-18z',
  ammocrate: 'M8 12h48v20H8z M8 12h48v5H8z M26 22h12v4H26z',
  drum: 'M18 6h28v26H18z M18 12h28v2H18z M18 24h28v2H18z',
  fuel: 'M18 6h28v26H18z M18 15h28v5H18z M38 2h4v4h-4z',
  hay: 'M6 12h44a10 10 0 0 1 0 20H6a10 10 0 0 1 0-20z M14 12h2v20h-2z M38 12h2v20h-2z',
  fence: 'M6 8h3v24H6z M30 8h3v24h-3z M55 8h3v24h-3z M4 14h56v3H4z M4 23h56v3H4z',
  tree: 'M32 2l12 12h-6l10 10h-8l8 8H16l8-8h-8l10-10h-6z M30 32h4v4h-4z',
  bush: 'M10 32a10 10 0 0 1 6-18 12 12 0 0 1 22-4 10 10 0 0 1 16 8 8 8 0 0 1 0 14z',
  rock: 'M6 32l6-14 10-8 14 2 10-4 10 10 4 14z',
  remove: 'M20 6h24v4H20z M14 10h36v3H14z M18 14h28l-3 20H21z M26 18h2v12h-2z M36 18h2v12h-2z',
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
  walk: 'M17 2a3 3 0 1 0 0.01 0z M14 9h5l3 6 4 2-1 3-6-3-1-2-1 5 4 4 1 7h-3l-1-6-4-3-2 9H9l3-14-3 2-1 5H5l1-7z',
  command: 'M4 22l12-6 12 6-12 6z M4 15l12-6 12 6-12 6z M16 3l12 6-12 6-12-6z',
  trophy: 'M9 4h14v3h5v4c0 4-3 6.5-6.5 7-1 2-3 3.3-4.5 3.8V25h4v3H11v-3h4v-3.2c-1.5-.5-3.5-1.8-4.5-3.8C7 17.5 4 15 4 11V7h5z M6.5 9.5V11c0 2 1.2 3.4 2.6 4L9 9.5z M25.5 9.5H23l-.1 5.5c1.4-.6 2.6-2 2.6-4z',
  cloud: 'M9 26a6.5 6.5 0 0 1-1.3-12.9A8.5 8.5 0 0 1 24 11.2 7.4 7.4 0 0 1 23.5 26z',
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
