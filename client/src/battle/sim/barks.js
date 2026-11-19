import { emitSound } from './fx.js'
import { UNIT_TYPES } from './units.js'

/**
 * Callouts: soldiers shout in a fight ("Contact!", "Medic!", "Reloading!", "Fall back!",
 * a grunt when hit). Each is one 'bark' sound event at the speaker's head (meta: one of
 * BARKS); the audio plays a synthesised voice for it and the renderer (Callouts.jsx)
 * floats the matching word over the speaker. A few per second at most, so a big fight
 * is a murmur of shouts rather than a wall of them.
 */
export const BARKS = ['say_contact', 'say_hurt', 'say_medic', 'say_reload', 'say_retreat', 'say_down']

/** Shortest gap between any two shouts in the battle (s). */
const GAP = 0.3
/** A soldier doesn't shout again within this long (s), unless `force`d. */
const OWN_GAP = 4

/**
 * `s` shouts `kind`. `force`: skip his own cool-down (a call for a medic after a grunt).
 * Zombies don't talk (they groan: zombies.js).
 */
export function bark(w, s, kind, force = false) {
  if (w.time < w.barkNext || (!force && w.time < s.barkT)) return
  if (UNIT_TYPES[s.type].zombieAI) return
  w.barkNext = w.time + GAP
  s.barkT = w.time + OWN_GAP
  emitSound(w.fx, 'bark', s.x, s.fy + 2.05, s.z, kind)
}
