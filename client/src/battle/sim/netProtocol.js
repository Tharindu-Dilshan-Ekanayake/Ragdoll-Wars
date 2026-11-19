import { drain } from './fx.js'
import { UNIT_TYPES } from './units.js'

/**
 * Multiplayer snapshots: what the server (server/src/rooms/BattleRoom.js) sends every
 * client ~15 times a second, and the tables both ends agree on. Plain arrays of
 * integers (positions in cm, angles in milliradians) so msgpack packs them small.
 *
 * Per snapshot:
 *   t, ts        battle time, time scale
 *   s            living soldiers, SOLDIER_STRIDE numbers each (see encodeSnapshot)
 *   v            vehicles, VEHICLE_STRIDE each
 *   p            projectiles, PROJECTILE_STRIDE each
 *   m            mines, MINE_STRIDE each
 *   d            deaths since the last snapshot: [id, part, dx, dy, dz, power, blast, charred] (cm / tenths)
 *   rv           soldiers a medic revived since the last snapshot (ids): clients clear the
 *                body they drew for each (absent when none)
 *   fx           new effects: tr tracers, fl flashes, im impacts, de decals, ex explosions,
 *                fm flames, so sounds
 *   st           stats [alive0, alive1, lost0, lost1, downed0, downed1, kills0, kills1]
 *   z            Zombie Horde [wave, total, state, cash, left, buildT x10, breaches, max, kills, result] or null
 *   b            built pieces [key, x, z, rot, ...] when they changed (else absent)
 *   a            players out walking (walk mode): sid, x, y, z (cm), yaw (mrad),
 *                speed (cm/s), grounded - WALKER_STRIDE each; added by the room, absent
 *                when nobody walks
 *
 * Bodies, ragdolls and their blood are left to each client: they're cosmetic, so the
 * server just says who died and how hard they were hit.
 */

export const TYPE_KEYS = Object.keys(UNIT_TYPES)
export const TYPE_INDEX = Object.fromEntries(TYPE_KEYS.map((k, i) => [k, i]))
export const SOUND_KINDS = ['shot', 'impact', 'hit', 'thud', 'spawn', 'reload', 'boom', 'launch', 'mortar', 'flame', 'heal', 'groan', 'horn', 'breach', 'build', 'jet']
const SOUND_INDEX = Object.fromEntries(SOUND_KINDS.map((k, i) => [k, i]))
/** String metas a sound can carry (weapon keys and vehicle gun sounds). */
export const META_KEYS = [...TYPE_KEYS, 'cannon', 'autocannon']
const META_INDEX = Object.fromEntries(META_KEYS.map((k, i) => [k, i]))
export const PROJ_KINDS = ['rocket', 'shell', 'cannon', 'bomb']
const PROJ_INDEX = Object.fromEntries(PROJ_KINDS.map((k, i) => [k, i]))
export const ZOMBIE_STATES = ['build', 'wave']
export const ZOMBIE_RESULTS = [null, 'won', 'lost']

export const SOLDIER_STRIDE = 21
export const VEHICLE_STRIDE = 14
export const PROJECTILE_STRIDE = 8
export const MINE_STRIDE = 5
export const WALKER_STRIDE = 7

/** Soldier flag bits. */
export const F_DOWNED = 1
export const F_BURNING = 2
export const F_DROPPING = 4
export const F_LEG_L = 8
export const F_LEG_R = 16
export const F_ARM_L = 32
export const F_ARM_R = 64
export const F_HEALING = 128
/** Vehicle flag bits. */
export const V_ALIVE = 1
export const V_WRECK = 2
export const V_CRASHING = 4
export const V_HIT = 8

/** Most of each effect per snapshot (the newest win). */
const CAP = { tr: 60, im: 50, so: 40, fl: 40, de: 20, ex: 16, fm: 24 }

const q = (v) => Math.round(v * 100)
const qa = (v) => Math.round(v * 1000)

/** Sounds' metas: a string key as a negative index, a number in hundredths. */
export const encodeMeta = (meta) => (typeof meta === 'string' ? -1 - (META_INDEX[meta] ?? 0) : Math.round((meta || 0) * 100))
export const decodeMeta = (n) => (n < 0 ? META_KEYS[-1 - n] : n / 100)

export function createEncoder(w) {
  const fx = w.fx
  return {
    cursors: { tr: fx.tracers.head, fl: fx.flashes.head, im: fx.impacts.head, de: fx.decals.head, ex: fx.explosions.head, fm: fx.flames.head, so: fx.sounds.head },
    buildVersion: -1,
  }
}

/** Keeps only the last `cap * stride` numbers of `arr`. */
function keepLast(arr, stride, cap) {
  const max = cap * stride
  return arr.length > max ? arr.slice(arr.length - max) : arr
}

export function encodeSnapshot(w, enc) {
  const s = []
  for (const x of w.slots) {
    if (!x.used || !x.alive) continue
    let f = 0
    if (x.downed) f |= F_DOWNED
    if (x.burnT > 0) f |= F_BURNING
    if (x.dropY > 0) f |= F_DROPPING
    if (x.legL > 0) f |= F_LEG_L
    if (x.legR > 0) f |= F_LEG_R
    if (x.armL > 0) f |= F_ARM_L
    if (x.armR > 0) f |= F_ARM_R
    const healing = x.patient && x.healT > 0
    if (healing) f |= F_HEALING
    s.push(
      x.id,
      TYPE_INDEX[x.type],
      x.team,
      q(x.x),
      q(x.z),
      qa(x.yaw),
      qa(x.aimYaw),
      qa(x.aimPitch),
      q(x.wCrouch),
      q(x.wProne),
      q(x.wDown),
      q(x.animMove),
      q(x.ready),
      q(x.recoil),
      q(x.reloadP),
      f,
      q(x.dropY),
      q(x.scale),
      Math.max(0, Math.round(x.hp)),
      healing ? x.patientId : 0,
      q(x.fy),
    )
  }
  const v = []
  for (const x of w.veh.list) {
    if (!x.used) continue
    let f = 0
    if (x.alive) f |= V_ALIVE
    if (x.wreck) f |= V_WRECK
    if (x.crashing) f |= V_CRASHING
    if (x.hitT < 0.08) f |= V_HIT
    v.push(x.id, TYPE_INDEX[x.type], x.team, q(x.x), q(x.y), q(x.z), qa(x.yaw), qa(x.pitch), qa(x.roll), qa(x.turretYaw), Math.round((Math.max(0, x.hp) / x.maxHp) * 100), f, q(x.dropY), q(x.wreckT))
  }
  const p = []
  for (const x of w.ord.projectiles) {
    if (!x.active) continue
    p.push(PROJ_INDEX[x.kind] ?? 0, q(x.x), q(x.y), q(x.z), q(x.vx), q(x.vy), q(x.vz), x.big ? 1 : 0)
  }
  const m = []
  for (const x of w.ord.mines) if (x.active) m.push(x.team, q(x.x), q(x.z), x.armT <= 0 ? 1 : 0, Math.round(x.seed * 100))

  const d = []
  if (w.deaths && w.deaths.length) {
    for (let i = 0; i < w.deaths.length; i += 8) {
      const [id, part, dx, dy, dz, power, blast, charred] = w.deaths.slice(i, i + 8)
      d.push(id, part, q(dx), q(dy), q(dz), Math.round(power * 10), blast, charred)
    }
    w.deaths.length = 0
  }

  const fx = w.fx
  const c = enc.cursors
  let tr = []
  c.tr = drain(fx.tracers, c.tr, (t) => tr.push(q(t.x0), q(t.y0), q(t.z0), q(t.x1), q(t.y1), q(t.z1), t.heavy ? 1 : 0))
  let fl = []
  c.fl = drain(fx.flashes, c.fl, (t) => fl.push(q(t.x), q(t.y), q(t.z), q(t.dx), q(t.dy), q(t.dz), q(t.size)))
  let im = []
  c.im = drain(fx.impacts, c.im, (t) => im.push(q(t.x), q(t.y), q(t.z), t.kind))
  let de = []
  c.de = drain(fx.decals, c.de, (t) => de.push(q(t.x), q(t.z), q(t.size)))
  let ex = []
  c.ex = drain(fx.explosions, c.ex, (t) => ex.push(q(t.x), q(t.y), q(t.z), q(t.radius)))
  let fm = []
  c.fm = drain(fx.flames, c.fm, (t) => fm.push(q(t.x), q(t.y), q(t.z), q(t.dx), q(t.dy), q(t.dz), q(t.len)))
  let so = []
  c.so = drain(fx.sounds, c.so, (t) => so.push(SOUND_INDEX[t.kind] ?? 0, q(t.x), q(t.y), q(t.z), encodeMeta(t.meta)))
  tr = keepLast(tr, 7, CAP.tr)
  fl = keepLast(fl, 7, CAP.fl)
  im = keepLast(im, 4, CAP.im)
  de = keepLast(de, 3, CAP.de)
  ex = keepLast(ex, 4, CAP.ex)
  fm = keepLast(fm, 7, CAP.fm)
  so = keepLast(so, 5, CAP.so)

  const st = w.stats
  const zm = w.zmode
  const snap = {
    t: Math.round(w.time * 1000),
    ts: w.timeScale,
    s,
    v,
    p,
    m,
    d,
    fx: { tr, fl, im, de, ex, fm, so },
    st: [st.alive[0], st.alive[1], st.lost[0], st.lost[1], st.downed[0], st.downed[1], st.kills[0], st.kills[1]],
    z: zm
      ? [
          zm.wave,
          zm.total,
          ZOMBIE_STATES.indexOf(zm.state),
          zm.cash,
          zm.left,
          Math.round(zm.buildT * 10),
          zm.breaches,
          zm.maxBreaches,
          zm.kills,
          ZOMBIE_RESULTS.indexOf(zm.result),
          // Rampart sections: strength in percent, -1 when fallen.
          ...(w.rampart ? w.rampart.segs.map((g) => (g.up ? Math.max(1, Math.round((g.hp / g.max) * 100)) : -1)) : []),
        ]
      : null,
  }
  if (w.build.version !== enc.buildVersion) {
    enc.buildVersion = w.build.version
    const b = []
    for (const p0 of w.build.list) b.push(p0.key, q(p0.x), q(p0.z), p0.rot)
    snap.b = b
  }
  if (w.revives && w.revives.length) {
    snap.rv = w.revives.slice()
    w.revives.length = 0
  }
  return snap
}
