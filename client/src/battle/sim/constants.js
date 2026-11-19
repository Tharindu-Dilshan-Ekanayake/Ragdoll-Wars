/**
 * Shared numbers for the battle simulation. Plain JS, no three.js: the whole sim runs in
 * Node too (scripts/sim-bench.mjs), which is how it is benchmarked and smoke-tested.
 *
 * Units are metres and seconds. +Y is up.
 */

export const TEAM_BLUE = 0
export const TEAM_RED = 1

export const TEAMS = [
  { id: TEAM_BLUE, key: 'blue', name: 'Blue', css: '#3d8bff' },
  { id: TEAM_RED, key: 'red', name: 'Red', css: '#ff4d4d' },
]

/** Soldier orders. 'move' is given by clicking the ground with units selected. */
export const ORDERS = ['attack', 'hold', 'flank']

/** Hard ceiling on soldier slots (alive + bodies on the ground), whatever the preset. */
export const MAX_SLOTS = 360

export const GRAVITY = 12
export const SOLDIER_RADIUS = 0.34

/** Stances, smoothed into animation weights in the soldier. */
export const STANCE_STAND = 0
export const STANCE_CROUCH = 1
export const STANCE_PRONE = 2
export const STANCE_DOWNED = 3

/** Visual bullet speed (m/s). Slower than real so tracers read; hits land on arrival. */
export const BULLET_SPEED = 320

/** Hit zones a bullet can land in. */
export const PART_HEAD = 0
export const PART_TORSO = 1
export const PART_ARM_L = 2
export const PART_ARM_R = 3
export const PART_LEG_L = 4
export const PART_LEG_R = 5
export const PART_NAMES = ['Head', 'Body', 'Left arm', 'Right arm', 'Left leg', 'Right leg']
