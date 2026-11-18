import { emitDecal, emitExplosion, emitFlame, emitFlash, emitImpact, emitSound, emitTracer } from '../sim/fx'
import {
  decodeMeta,
  F_ARM_L,
  F_ARM_R,
  F_BURNING,
  F_DOWNED,
  F_DROPPING,
  F_HEALING,
  F_LEG_L,
  F_LEG_R,
  MINE_STRIDE,
  PROJ_KINDS,
  PROJECTILE_STRIDE,
  SOLDIER_STRIDE,
  SOUND_KINDS,
  TYPE_KEYS,
  V_ALIVE,
  V_CRASHING,
  V_HIT,
  V_WRECK,
  VEHICLE_STRIDE,
  WALKER_STRIDE,
  ZOMBIE_RESULTS,
  ZOMBIE_STATES,
} from '../sim/netProtocol'
import { pieceBoxes } from '../sim/pieces'
import { wrapAngle } from '../sim/rig'
import { resetSoldier } from '../sim/soldier'
import { UNIT_TYPES } from '../sim/units'
import { spawnVehicleAt } from '../sim/vehicles'
import { dropSlot, localKill, rebuildStatic, stepBodies, takeSlot } from '../sim/world'

/**
 * A multiplayer client's copy of the battle. The server runs the real simulation and
 * sends snapshots (sim/netProtocol.js); this keeps a local world in the same shape the
 * renderers already draw, so nothing else needs to know it's online:
 *
 * - Soldiers and vehicles are matched by their server id to local slots (a body can
 *   keep lying in its slot after the server reuses it for someone new), and glide
 *   towards each snapshot's positions instead of jumping.
 * - When someone dies the server says how; the body falls here, as a ragdoll or a
 *   crumple, and is cleared by this client's own body budget.
 * - Projectiles keep flying between snapshots; effects and sounds from the server go
 *   into the local effect rings, stamped with local time.
 * - Built pieces arrive as a list when they change, and rebuild the local obstacles
 *   (bodies and ragdolls still need something to land on).
 */

const GRAVITY_OF = { rocket: 0.8, shell: 9.8, cannon: 0.8, bomb: 30 }
const SMOOTH = 14

export function createNetMirror() {
  return { soldiers: new Map(), vehicles: new Map(), lastBuild: null, walkers: new Map(), walkSeq: 0 }
}

const cm = (n) => n / 100
const mrad = (n) => n / 1000

/** Applies one snapshot from the server to mirror world `w`. */
export function applySnapshot(w, net, snap) {
  w.timeScale = snap.ts
  const seen = new Set()

  // --- Soldiers -------------------------------------------------------------------------
  const s = snap.s
  for (let i = 0; i < s.length; i += SOLDIER_STRIDE) {
    const id = s[i]
    const type = TYPE_KEYS[s[i + 1]]
    seen.add(id)
    let x = net.soldiers.get(id)
    if (!x || !x.alive) {
      x = takeSlot(w)
      if (!x) continue
      resetSoldier(x, UNIT_TYPES[type], s[i + 2], cm(s[i + 3]), cm(s[i + 4]), mrad(s[i + 5]), 'hold')
      x.id = id
      x.net = { x: x.x, z: x.z, yaw: x.yaw, aimYaw: x.aimYaw, aimPitch: 0, patientId: 0 }
      net.soldiers.set(id, x)
    }
    const t = x.net
    t.x = cm(s[i + 3])
    t.z = cm(s[i + 4])
    t.yaw = mrad(s[i + 5])
    t.aimYaw = mrad(s[i + 6])
    t.aimPitch = mrad(s[i + 7])
    x.type = type
    x.team = s[i + 2]
    x.wCrouch = cm(s[i + 8])
    x.wProne = cm(s[i + 9])
    x.wDown = cm(s[i + 10])
    x.animMove = cm(s[i + 11])
    x.ready = cm(s[i + 12])
    x.recoil = Math.max(x.recoil, cm(s[i + 13]))
    x.reloadP = s[i + 14] / 100
    const f = s[i + 15]
    x.downed = Boolean(f & F_DOWNED)
    x.burnT = f & F_BURNING ? Math.max(x.burnT, 0.6) : 0
    x.legL = f & F_LEG_L ? 1 : 0
    x.legR = f & F_LEG_R ? 1 : 0
    x.armL = f & F_ARM_L ? 1 : 0
    x.armR = f & F_ARM_R ? 1 : 0
    x.dropY = f & F_DROPPING ? cm(s[i + 16]) : 0
    x.scale = cm(s[i + 17])
    x.hp = s[i + 18]
    t.patientId = f & F_HEALING ? s[i + 19] : 0
  }
  // Medics at work: point them at their patient (for the heal cross).
  for (const x of net.soldiers.values()) {
    const pid = x.net.patientId
    const p = pid ? net.soldiers.get(pid) : null
    x.patient = p && p.alive ? p : null
    x.patientId = pid
    x.healT = x.patient ? 1 : 0
  }

  // --- Deaths, then whoever simply left the field -------------------------------------------
  const d = snap.d
  for (let i = 0; i < d.length; i += 8) {
    const x = net.soldiers.get(d[i])
    if (!x || !x.alive) continue
    x.x = x.net.x
    x.z = x.net.z
    localKill(w, x, d[i + 1], cm(d[i + 2]), cm(d[i + 3]), cm(d[i + 4]), d[i + 5] / 10, d[i + 6], d[i + 7])
    net.soldiers.delete(d[i])
  }
  for (const [id, x] of net.soldiers) {
    if (seen.has(id)) continue
    if (x.alive) dropSlot(w, x)
    net.soldiers.delete(id)
  }

  // --- Vehicles ---------------------------------------------------------------------------
  const v = snap.v
  const seenV = new Set()
  for (let i = 0; i < v.length; i += VEHICLE_STRIDE) {
    const id = v[i]
    const type = TYPE_KEYS[v[i + 1]]
    seenV.add(id)
    let x = net.vehicles.get(id)
    if (!x || !x.used) {
      x = spawnVehicleAt(w, type, v[i + 2], cm(v[i + 3]), cm(v[i + 5]), mrad(v[i + 6]), 'hold')
      if (!x) continue
      x.id = id
      x.y = cm(v[i + 4])
      x.net = { x: x.x, y: x.y, z: x.z, yaw: x.yaw, pitch: 0, roll: 0, turretYaw: x.yaw }
      net.vehicles.set(id, x)
    }
    const t = x.net
    t.x = cm(v[i + 3])
    t.y = cm(v[i + 4])
    t.z = cm(v[i + 5])
    t.yaw = mrad(v[i + 6])
    t.pitch = mrad(v[i + 7])
    t.roll = mrad(v[i + 8])
    t.turretYaw = mrad(v[i + 9])
    x.hp = (v[i + 10] / 100) * x.maxHp
    const f = v[i + 11]
    x.alive = Boolean(f & V_ALIVE)
    x.wreck = Boolean(f & V_WRECK)
    x.crashing = Boolean(f & V_CRASHING)
    if (f & V_HIT) x.hitT = 0
    x.dropY = cm(v[i + 12])
    x.wreckT = cm(v[i + 13])
    if (!x.alive) x.selected = false
  }
  for (const [id, x] of net.vehicles) {
    if (seenV.has(id)) continue
    x.used = false
    x.alive = false
    x.selected = false
    net.vehicles.delete(id)
  }

  // --- Projectiles and mines ----------------------------------------------------------------
  const pool = w.ord.projectiles
  let k = 0
  const p = snap.p
  for (let i = 0; i < p.length && k < pool.length; i += PROJECTILE_STRIDE, k += 1) {
    const o = pool[k]
    o.active = true
    o.kind = PROJ_KINDS[p[i]]
    o.shell = o.kind === 'shell'
    o.grav = GRAVITY_OF[o.kind]
    o.x = cm(p[i + 1])
    o.y = cm(p[i + 2])
    o.z = cm(p[i + 3])
    o.vx = cm(p[i + 4])
    o.vy = cm(p[i + 5])
    o.vz = cm(p[i + 6])
    o.big = Boolean(p[i + 7])
  }
  for (; k < pool.length; k += 1) pool[k].active = false
  const mines = w.ord.mines
  const m = snap.m
  let j = 0
  for (let i = 0; i < m.length && j < mines.length; i += MINE_STRIDE, j += 1) {
    const o = mines[j]
    o.active = true
    o.team = m[i]
    o.x = cm(m[i + 1])
    o.z = cm(m[i + 2])
    o.armT = m[i + 3] ? 0 : 1
    o.seed = m[i + 4] / 100
  }
  for (; j < mines.length; j += 1) mines[j].active = false

  // --- Effects and sounds -----------------------------------------------------------------
  const fx = w.fx
  const now = w.time
  const e = snap.fx
  for (let i = 0; i < e.tr.length; i += 7) emitTracer(fx, cm(e.tr[i]), cm(e.tr[i + 1]), cm(e.tr[i + 2]), cm(e.tr[i + 3]), cm(e.tr[i + 4]), cm(e.tr[i + 5]), now, Boolean(e.tr[i + 6]))
  for (let i = 0; i < e.fl.length; i += 7) emitFlash(fx, cm(e.fl[i]), cm(e.fl[i + 1]), cm(e.fl[i + 2]), cm(e.fl[i + 3]), cm(e.fl[i + 4]), cm(e.fl[i + 5]), now, cm(e.fl[i + 6]))
  for (let i = 0; i < e.im.length; i += 4) emitImpact(fx, cm(e.im[i]), cm(e.im[i + 1]), cm(e.im[i + 2]), e.im[i + 3], now)
  for (let i = 0; i < e.de.length; i += 3) emitDecal(fx, cm(e.de[i]), cm(e.de[i + 1]), cm(e.de[i + 2]), now)
  for (let i = 0; i < e.ex.length; i += 4) emitExplosion(fx, cm(e.ex[i]), cm(e.ex[i + 1]), cm(e.ex[i + 2]), cm(e.ex[i + 3]), now)
  for (let i = 0; i < e.fm.length; i += 7) emitFlame(fx, cm(e.fm[i]), cm(e.fm[i + 1]), cm(e.fm[i + 2]), cm(e.fm[i + 3]), cm(e.fm[i + 4]), cm(e.fm[i + 5]), cm(e.fm[i + 6]), now)
  for (let i = 0; i < e.so.length; i += 5) emitSound(fx, SOUND_KINDS[e.so[i]], cm(e.so[i + 1]), cm(e.so[i + 2]), cm(e.so[i + 3]), decodeMeta(e.so[i + 4]))

  // --- Stats, Zombie Horde, built pieces ----------------------------------------------------------
  // Other players out walking (walk mode): sid -> their latest pose. Flat list, stride
  // WALKER_STRIDE: sid, x, y, z (cm), yaw (mrad), speed (cm/s), grounded.
  const seq = (net.walkSeq += 1)
  const a = snap.a
  if (a) {
    for (let i = 0; i + WALKER_STRIDE <= a.length; i += WALKER_STRIDE) {
      let wk = net.walkers.get(a[i])
      if (!wk) {
        wk = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true, seq: 0 }
        net.walkers.set(a[i], wk)
      }
      wk.x = cm(a[i + 1])
      wk.y = cm(a[i + 2])
      wk.z = cm(a[i + 3])
      wk.yaw = mrad(a[i + 4])
      wk.speed = cm(a[i + 5])
      wk.grounded = a[i + 6] === 1
      wk.seq = seq
    }
  }
  for (const [sid, wk] of net.walkers) if (wk.seq !== seq) net.walkers.delete(sid)

  const st = snap.st
  w.stats.alive[0] = st[0]
  w.stats.alive[1] = st[1]
  w.stats.lost[0] = st[2]
  w.stats.lost[1] = st[3]
  w.stats.downed[0] = st[4]
  w.stats.downed[1] = st[5]
  w.stats.kills[0] = st[6]
  w.stats.kills[1] = st[7]
  if (snap.z) {
    const z = snap.z
    w.zmode = w.zmode || {}
    Object.assign(w.zmode, {
      wave: z[0],
      total: z[1],
      state: ZOMBIE_STATES[z[2]] || 'build',
      cash: z[3],
      left: z[4],
      buildT: z[5] / 10,
      breaches: z[6],
      maxBreaches: z[7],
      kills: z[8],
      result: ZOMBIE_RESULTS[z[9]] || null,
    })
  }
  if (snap.b) {
    const list = []
    for (let i = 0; i < snap.b.length; i += 4) {
      const key = snap.b[i]
      const x = cm(snap.b[i + 1])
      const z = cm(snap.b[i + 2])
      const rot = snap.b[i + 3]
      list.push({ id: i / 4 + 1, key, x, z, rot, hp: 1, maxHp: 1, seed: ((x * 13.1 + z * 7.7) % 1 + 1) % 1, boxes: pieceBoxes(key, x, z, rot) })
    }
    w.build.list = list
    rebuildStatic(w)
  }
  w.version += 1
}

/** Per frame: glide towards the latest snapshot, fly projectiles, run the bodies. */
export function netStep(w, net, realDt) {
  const dt = Math.min(realDt, 0.1)
  const h = dt * w.timeScale
  const k = 1 - Math.exp(-SMOOTH * dt)
  for (const x of net.soldiers.values()) {
    if (!x.alive) continue
    const t = x.net
    const ox = x.x
    const oz = x.z
    x.x += (t.x - x.x) * k
    x.z += (t.z - x.z) * k
    x.yaw += wrapAngle(t.yaw - x.yaw) * k
    x.aimYaw += wrapAngle(t.aimYaw - x.aimYaw) * k
    x.aimPitch += (t.aimPitch - x.aimPitch) * k
    const moved = Math.hypot(x.x - ox, x.z - oz)
    if (dt > 0) {
      x.vx = (x.x - ox) / dt
      x.vz = (x.z - oz) / dt
    }
    // The walk cycle follows the distance actually covered.
    x.gait += (moved * Math.PI) / (0.55 + 0.35 * Math.min(1, x.animMove))
    if (x.gait > 1000) x.gait -= Math.PI * 300
    x.recoil *= Math.exp(-14 * h)
  }
  for (const x of net.vehicles.values()) {
    const t = x.net
    x.x += (t.x - x.x) * k
    x.y += (t.y - x.y) * k
    x.z += (t.z - x.z) * k
    x.yaw += wrapAngle(t.yaw - x.yaw) * k
    x.pitch += (t.pitch - x.pitch) * k
    x.roll += (t.roll - x.roll) * k
    x.turretYaw += wrapAngle(t.turretYaw - x.turretYaw) * k
    x.hitT += dt
  }
  for (const o of w.ord.projectiles) {
    if (!o.active) continue
    o.vy -= o.grav * h
    o.x += o.vx * h
    o.y += o.vy * h
    o.z += o.vz * h
  }
  for (const o of w.ord.mines) if (o.active && o.armT > 0) o.armT -= h
  stepBodies(w, h)
}
