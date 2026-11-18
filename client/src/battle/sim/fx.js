/**
 * Fixed-size rings of visual and audio events, written by the simulation and read by
 * the renderer and the audio engine. Nothing is allocated after start-up: an event
 * overwrites the oldest one once a ring is full.
 *
 * Readers either draw everything still alive in a ring each frame (tracers, flashes,
 * blood pools) or keep their own cursor and consume new entries (impacts, sounds).
 */

function ring(size, make) {
  return { items: Array.from({ length: size }, make), size, head: 0 }
}

function next(r) {
  const item = r.items[r.head % r.size]
  r.head += 1
  return item
}

export function createFx() {
  return {
    tracers: ring(320, () => ({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, t0: -99, len: 0, heavy: false })),
    flashes: ring(64, () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, t0: -99, size: 1 })),
    /** kind: 0 dirt, 1 blood, 2 concrete, 3 dust puff (landing / spawn). */
    impacts: ring(256, () => ({ x: 0, y: 0, z: 0, kind: 0, t0: -99 })),
    decals: ring(180, () => ({ x: 0, z: 0, size: 0, rot: 0, t0: -99 })),
    /** kind: 'shot' (meta: weapon key), 'impact', 'hit', 'thud', 'spawn', 'reload'. */
    sounds: ring(160, () => ({ kind: '', x: 0, y: 0, z: 0, meta: null })),
    /** Set by clearAll: the renderer wipes the blood pools. */
    clearDecals: false,
  }
}

export function emitTracer(fx, x0, y0, z0, x1, y1, z1, t0, heavy) {
  const t = next(fx.tracers)
  t.x0 = x0
  t.y0 = y0
  t.z0 = z0
  t.x1 = x1
  t.y1 = y1
  t.z1 = z1
  t.t0 = t0
  t.len = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
  t.heavy = heavy
}

export function emitFlash(fx, x, y, z, dx, dy, dz, t0, size) {
  const f = next(fx.flashes)
  f.x = x
  f.y = y
  f.z = z
  f.dx = dx
  f.dy = dy
  f.dz = dz
  f.t0 = t0
  f.size = size
}

export function emitImpact(fx, x, y, z, kind, t0) {
  const i = next(fx.impacts)
  i.x = x
  i.y = y
  i.z = z
  i.kind = kind
  i.t0 = t0
}

export function emitDecal(fx, x, z, size, t0) {
  const d = next(fx.decals)
  d.x = x
  d.z = z
  d.size = size
  d.rot = Math.random() * Math.PI * 2
  d.t0 = t0
}

export function emitSound(fx, kind, x, y, z, meta) {
  const s = next(fx.sounds)
  s.kind = kind
  s.x = x
  s.y = y
  s.z = z
  s.meta = meta
}

/**
 * Calls fn(item) for each entry written since `cursor` and returns the new cursor.
 * Entries already overwritten are skipped.
 */
export function drain(r, cursor, fn) {
  if (r.head - cursor > r.size) cursor = r.head - r.size
  for (; cursor < r.head; cursor += 1) fn(r.items[cursor % r.size])
  return cursor
}
