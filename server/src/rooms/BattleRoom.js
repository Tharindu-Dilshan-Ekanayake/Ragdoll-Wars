import { Room } from '@colyseus/core'

import { MAPS, ZOMBIE_MAP } from '../../../client/src/battle/maps/index.js'
import { createEncoder, encodeSnapshot } from '../../../client/src/battle/sim/netProtocol.js'
import { BUILD_GROUPS } from '../../../client/src/battle/sim/pieces.js'
import { applySave } from '../../../client/src/battle/sim/saveGame.js'
import { QUICK_SQUADS, UNIT_TYPES } from '../../../client/src/battle/sim/units.js'
import { clearAll, createWorld, deleteSelected, initZombieMode, moveSelected, orderSelected, spawnUnits, stepWorld, withUnits } from '../../../client/src/battle/sim/world.js'
import { PRICES, restartZombies, startWave } from '../../../client/src/battle/sim/zombies.js'
import { resolveIdentity } from '../bloxityApi.js'

/**
 * One multiplayer battle: up to four players on one battlefield, run here.
 *
 * The server owns the simulation (the very same code the game runs offline, from
 * client/src/battle/sim) and steps it 30 times a second. Players send commands - drop
 * these units, move those, build this - which are checked (your own team's units only,
 * sane numbers, enough cash in Zombie Horde) and applied; everyone gets a compact
 * snapshot ~15 times a second (sim/netProtocol.js) and draws it, with bodies, ragdolls
 * and effects played on their own machine.
 *
 * Modes: 'sandbox' (each player commands Blue or Red; teams auto-balance, players can
 * switch) and 'zombies' (Zombie Horde in co-op: everyone on Blue, one shared purse).
 * The first player in is the host: they can clear the field, change speed, pause and
 * load a saved battlefield; if they leave, the next player takes over.
 */

const MAX_PLAYERS = 4
const SIM_HZ = 30
const SNAP_EVERY = 2
const RECONNECT_SECONDS = 15
/** Server-side caps: no ragdolls (clients play those), a fair-sized battle. */
const CAPS = { units: 50, corpses: 40, ragdolls: 0, vehicles: 6, structures: 160 }
/** Commands per second a player may send (bursts allowed up to this many). */
const RATE = 30

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const makeCode = (length = 5) => Array.from({ length }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
const cleanName = (name) =>
  String(name || 'Commander')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 20) || 'Commander'
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const idList = (v) => (Array.isArray(v) ? v.filter((n) => Number.isInteger(n)).slice(0, 400) : [])
const ORDERS = new Set(['attack', 'hold', 'flank'])
/** What players may build (the dock's pieces and the Remove tool; not map scenery). */
const BUILDABLE = new Set(BUILD_GROUPS.flatMap((g) => g.keys))
const SPEEDS = new Set([0.5, 1, 2])
/** Walk mode updates: at most one per this many ms per player (they send 10 a second). */
const WALK_MIN_MS = 50
const PROPORTION_KEYS = ['height', 'shoulderWidth', 'armLength', 'legOffsetX', 'torsoScaleX', 'neckHeight', 'headScale']

/**
 * What a player's avatar wears, as the other players' games need it to draw them:
 * { e: equipped ids (Bloxity's `avatar.getEquipped()`), p: body proportions }. Only
 * short id strings and in-range numbers get through.
 */
function cleanAvatar(raw) {
  if (!raw || typeof raw !== 'object') return null
  const e = {}
  if (raw.e && typeof raw.e === 'object') {
    let n = 0
    for (const [k, v] of Object.entries(raw.e)) {
      if (n >= 32 || !/^[a-zA-Z]{1,16}Id$/.test(k)) continue
      if ((typeof v === 'string' && v.length <= 64) || (typeof v === 'number' && Number.isFinite(v))) {
        e[k] = typeof v === 'string' ? v.replace(/[^\w.:-]/g, '') : v
        n += 1
      }
    }
  }
  const p = {}
  for (const k of PROPORTION_KEYS) {
    const v = raw.p?.[k]
    p[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0.5, Math.min(1.6, v)) : 1
  }
  return { e, p }
}

export class BattleRoom extends Room {
  maxClients = MAX_PLAYERS
  autoDispose = true
  /** sessionId -> { name, uid, team, host, tokens, refillAt } */
  players = new Map()
  frame = 0
  speed = 1
  paused = false

  async onCreate(options = {}) {
    this.mode = options.mode === 'zombies' ? 'zombies' : 'sandbox'
    // Zombie Horde has its own battlefield; sandbox rooms play the map they asked for.
    const entry = this.mode === 'zombies' ? ZOMBIE_MAP : MAPS.find((m) => m.id === options.mapId) || MAPS[0]
    const map = (await entry.load()).default
    this.mapId = map.id
    this.w = createWorld(map, CAPS, this.mode)
    this.w.deaths = []
    if (this.mode === 'zombies') initZombieMode(this.w)
    this.enc = createEncoder(this.w)
    this.code = null
    if (options.private) {
      // A short code friends can read out instead of the long generated id.
      this.roomId = makeCode()
      this.code = this.roomId
      await this.setPrivate(true)
    }
    await this.setMetadata({ mode: this.mode, mapId: this.mapId, code: this.code })
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / SIM_HZ)
    this.onMessage('*', (client, type, payload) => this.command(client, String(type), payload))
  }

  /** Join options `{ name, token }`: a Boxity token is checked and its name wins. */
  async onAuth(_client, options) {
    let identity = null
    try {
      identity = await resolveIdentity(options)
    } catch {
      identity = null
    }
    return { name: cleanName(identity?.name || options?.name), uid: identity?.verified ? identity.playerId : '' }
  }

  onJoin(client, options, auth) {
    const team = this.mode === 'zombies' ? 0 : this.emptierTeam()
    const host = ![...this.players.values()].some((p) => p.host)
    this.players.set(client.sessionId, {
      name: auth?.name || 'Commander',
      uid: auth?.uid || '',
      team,
      host,
      tokens: RATE,
      refillAt: Date.now(),
      avatar: cleanAvatar(options?.avatar),
      /** Walk mode: [x, y, z, yaw, speed, grounded] (cm, mrad), or null while commanding. */
      walk: null,
      walkAt: 0,
    })
    // The newcomer needs every built piece: resend the list with the next snapshot.
    this.enc.buildVersion = -1
    client.send('welcome', { mapId: this.mapId, mode: this.mode, code: this.code, team, host, speed: this.speed, paused: this.paused })
    this.sendPlayers()
  }

  async onLeave(client, consented) {
    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS)
        this.enc.buildVersion = -1
        return
      } catch {
        // Gone for good.
      }
    }
    const was = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (was?.host) {
      const next = this.players.values().next().value
      if (next) next.host = true
    }
    this.sendPlayers()
  }

  emptierTeam() {
    let blue = 0
    let red = 0
    for (const p of this.players.values()) if (p.team === 0) blue += 1
    else red += 1
    return red < blue ? 1 : 0
  }

  sendPlayers() {
    const list = [...this.players.entries()].map(([sid, p]) => ({ sid, name: p.name, team: p.team, host: p.host, avatar: p.avatar }))
    this.broadcast('players', list)
  }

  tick(dtMs) {
    const w = this.w
    w.timeScale = this.paused ? 0 : this.speed
    stepWorld(w, Math.min(0.1, dtMs / 1000))
    this.frame += 1
    if (this.frame % SNAP_EVERY === 0 && this.clients.length) {
      const snap = encodeSnapshot(w, this.enc)
      let a = null
      for (const [sid, p] of this.players) {
        if (!p.walk) continue
        a = a || []
        a.push(sid, ...p.walk)
      }
      if (a) snap.a = a
      this.broadcast('snap', snap)
    }
  }

  /** Walk mode: where a player's avatar is (or null: back to commanding). */
  walk(p, v) {
    if (v === null) {
      p.walk = null
      return
    }
    const now = Date.now()
    if (!Array.isArray(v) || v.length !== 6 || !v.every(Number.isInteger) || now - p.walkAt < WALK_MIN_MS) return
    p.walkAt = now
    const lx = (this.w.obs.limitX + 2) * 100
    const lz = (this.w.obs.limitZ + 2) * 100
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
    p.walk = [clamp(v[0], -lx, lx), clamp(v[1], 0, 3000), clamp(v[2], -lz, lz), clamp(v[3], -3200, 3200), clamp(v[4], 0, 3000), v[5] ? 1 : 0]
  }

  toast(client, text, kind = 'warn') {
    client.send('toast', { text, kind })
  }

  /** Token bucket: false once a player sends commands faster than RATE per second. */
  allow(p) {
    const now = Date.now()
    p.tokens = Math.min(RATE, p.tokens + ((now - p.refillAt) / 1000) * RATE)
    p.refillAt = now
    if (p.tokens < 1) return false
    p.tokens -= 1
    return true
  }

  command(client, type, payload) {
    const p = this.players.get(client.sessionId)
    if (!p) return
    // Walk updates come steadily ten a second, so they have their own limit.
    if (type === 'walk') return this.walk(p, payload)
    if (!this.allow(p)) return
    const w = this.w
    const msg = payload && typeof payload === 'object' ? payload : {}
    switch (type) {
      case 'team': {
        if (this.mode !== 'sandbox') return
        p.team = payload === 1 ? 1 : 0
        this.sendPlayers()
        return
      }
      case 'place': {
        const key = String(msg.key || '')
        const t = UNIT_TYPES[key]
        if (!BUILDABLE.has(key) && !(t && !t.zombieAI)) return
        let x = num(msg.x)
        let z = num(msg.z)
        if (x === null || z === null) return
        x = Math.max(-w.obs.limitX, Math.min(w.obs.limitX, x))
        z = Math.max(-w.obs.limitZ, Math.min(w.obs.limitZ, z))
        let count = Math.max(1, Math.min(10, Math.floor(num(msg.count) || 1)))
        const order = ORDERS.has(msg.order) ? msg.order : 'attack'
        const rot = msg.rot ? 1 : 0
        let price = 0
        if (w.zmode) {
          if (w.zmode.result) return
          price = PRICES[key] || 0
          const afford = price > 0 ? Math.floor(w.zmode.cash / price) : count
          if (afford <= 0) return this.toast(client, `Not enough cash - that costs $${price}`)
          count = Math.min(count, afford)
        }
        const r = spawnUnits(w, key, p.team, x, z, count, order, rot)
        if (w.zmode && r.spawned) w.zmode.cash -= r.spawned * price
        if (r.info) this.toast(client, r.info, 'info')
        if (r.limited) this.toast(client, r.limited)
        return
      }
      case 'move': {
        const x = num(msg.x)
        const z = num(msg.z)
        if (x === null || z === null) return
        withUnits(w, p.team, idList(msg.s), idList(msg.v), () => moveSelected(w, x, z))
        return
      }
      case 'order': {
        if (!ORDERS.has(msg.order)) return
        withUnits(w, p.team, idList(msg.s), idList(msg.v), () => orderSelected(w, msg.order))
        return
      }
      case 'delete':
        withUnits(w, p.team, idList(msg.s), idList(msg.v), () => deleteSelected(w))
        return
      case 'quick': {
        if (this.mode !== 'sandbox') return
        for (let team = 0; team < 2; team += 1) {
          const base = w.map.bases[team]
          for (const [key, n, dz] of QUICK_SQUADS) spawnUnits(w, key, team, base.x + (team === 0 ? 14 : -14), base.z + dz, n, 'attack')
        }
        return
      }
      case 'clear':
        if (!p.host || this.mode !== 'sandbox') return this.toast(client, 'Only the host can clear the battlefield')
        clearAll(w)
        return
      case 'speed': {
        if (!p.host) return this.toast(client, 'Only the host can change the speed')
        if (SPEEDS.has(msg.speed)) this.speed = msg.speed
        this.paused = Boolean(msg.paused)
        this.broadcast('speed', { speed: this.speed, paused: this.paused })
        return
      }
      case 'wave':
        if (w.zmode) startWave(w)
        return
      case 'restart':
        if (!w.zmode || !p.host) return
        clearAll(w)
        restartZombies(w)
        return
      case 'load': {
        if (!p.host || this.mode !== 'sandbox') return this.toast(client, 'Only the host can load a battlefield')
        if (!msg || msg.v !== 1 || msg.mapId !== this.mapId) return this.toast(client, 'That save is for another map')
        const tooBig = ['soldiers', 'vehicles', 'pieces', 'mines'].some((k) => !Array.isArray(msg[k]) || msg[k].length > 400)
        if (tooBig) return
        applySave(w, msg)
        return
      }
      default:
    }
  }
}
