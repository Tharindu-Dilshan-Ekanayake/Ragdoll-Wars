/**
 * A rampart: a raised stone wall your troops stand on (Mirefall Bastion). Plain data and
 * lookups only - no imports - so the sim, the renderer and the input layer can all use
 * it. The zombie side (hitting it, bringing sections down, repairs) is in zombies.js.
 *
 * A map marks its rampart with obstacle boxes flagged `rampart`:
 *   'deck'    - a section of the wall (also `deck: true`, `seg`: its index). Soldiers
 *               placed on top stand at its height and walk about on it.
 *   'parapet' - the low wall along a section's front edge (`deck: true`, same `seg`).
 *   'step'    - stairs up the back (the walker climbs them; soldiers don't).
 * `deck` boxes don't block the shots of anyone standing on or near their top: you fire
 * over the parapet and down the face (obstacles.js).
 *
 * Each section has its own strength: battered to nothing it falls, opening a gap, and
 * whoever stood on it drops. Fallen sections are rebuilt between waves.
 */

/** How far in from a section's edges soldiers keep. */
const INSET = 0.4

/** The rampart of `map`, or null: sections with their standing area and strength. */
export function buildRampart(map, maxHp = 4200) {
  const decks = map.obstacles.filter((o) => o.rampart === 'deck')
  if (!decks.length) return null
  const segs = decks
    .slice()
    .sort((a, b) => a.seg - b.seg)
    .map((d) => {
      const boxes = map.obstacles.filter((o) => o.seg === d.seg && o.rampart !== 'step')
      const parapet = boxes.find((o) => o.rampart === 'parapet')
      // Stand between the back edge and the parapet.
      const x0 = d.x - d.w / 2 + INSET
      let x1 = d.x + d.w / 2 - INSET
      if (parapet) x1 = Math.min(x1, parapet.x - parapet.w / 2 - INSET * 0.6)
      return {
        i: d.seg,
        x0,
        x1,
        z0: d.z - d.d / 2 + INSET,
        z1: d.z + d.d / 2 - INSET,
        /** The whole footprint (for things falling off it). */
        fx0: d.x - d.w / 2,
        fx1: d.x + d.w / 2,
        fz0: d.z - d.d / 2,
        fz1: d.z + d.d / 2,
        h: d.h,
        hp: maxHp,
        max: maxHp,
        up: true,
        boxes,
      }
    })
  const front = Math.max(...decks.map((d) => d.x + d.w / 2))
  return { segs, front, back: Math.min(...decks.map((d) => d.x - d.w / 2)), version: 0 }
}

/** The standing section under (x, z), or -1. */
export function deckAt(r, x, z) {
  if (!r) return -1
  for (const s of r.segs) if (s.up && x >= s.fx0 && x <= s.fx1 && z >= s.fz0 && z <= s.fz1) return s.i
  return -1
}

/** The section whose stretch of wall covers z (standing or not), or null. */
export function segAt(r, z) {
  if (!r) return null
  for (const s of r.segs) if (z >= s.fz0 && z <= s.fz1) return s
  return null
}

/** Moves p ({x, z}) inside section `i`'s standing area. */
export function clampToDeck(r, i, p) {
  const s = r.segs[i]
  if (p.x < s.x0) p.x = s.x0
  else if (p.x > s.x1) p.x = s.x1
  if (p.z < s.z0) p.z = s.z0
  else if (p.z > s.z1) p.z = s.z1
  return p
}

/** Share of the whole rampart still standing (0-1). */
export function rampartHealth(r) {
  if (!r) return 1
  let hp = 0
  let max = 0
  for (const s of r.segs) {
    hp += s.up ? s.hp : 0
    max += s.max
  }
  return max ? hp / max : 1
}
