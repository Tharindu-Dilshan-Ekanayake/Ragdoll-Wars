/**
 * The game slug from the Boxity developer dashboard. The deploy workflow passes it as
 * VITE_GAME_SLUG; local builds fall back to `ragdoll-wars`, the id the game is
 * registered under on Boxity Legion.
 */
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'ragdoll-wars'
