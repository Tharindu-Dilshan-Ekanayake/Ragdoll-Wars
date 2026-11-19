import { getSDK, safeCall } from './sdk'

/**
 * Boxity services the game calls directly. Phase 1 only needs screen ads; rewarded
 * ads, Gems, friends and invites return with the features that use them.
 */

let screenType = null

/**
 * Tells Boxity which screen the player is on, for its screen ads: 'gameplay' normally,
 * 'panel' while a modal panel is open. Calling it again with the same type does nothing.
 */
export function setScreen(type) {
  if (!type || type === screenType) return
  const ads = getSDK()?.ads
  if (typeof ads?.screen !== 'function') return
  screenType = type
  safeCall(ads.screen.bind(ads), type)
}

/** Takes Boxity's screen ads down (teardown). */
export function hideScreen() {
  if (!screenType) return
  screenType = null
  const ads = getSDK()?.ads
  safeCall(ads?.hideScreen?.bind(ads))
}
