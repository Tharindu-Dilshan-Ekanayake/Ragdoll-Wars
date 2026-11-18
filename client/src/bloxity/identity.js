/**
 * The game slug from the Boxity developer dashboard. The deploy workflow passes it as
 * VITE_GAME_SLUG; local builds fall back to `floppy-front`.
 *
 * Register Floppy Front as its own game on Boxity before deploying: the old template
 * slug (`1-phone-drop`) belongs to Phone Plunge.
 */
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'floppy-front'
