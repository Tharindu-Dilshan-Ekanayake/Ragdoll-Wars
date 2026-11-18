import { STICK_COUNT } from './ragdoll.js'
import { JOINT_COUNT } from './rig.js'

/**
 * A soldier's state: created once per slot (makeSoldier) and reset each time the slot
 * is used for a new soldier (resetSoldier). Shared by the battle and the lobby's
 * armory, which shows the troops standing at ease.
 */

let nextId = 1

export function makeSoldier(slot) {
  return {
    slot,
    id: 0,
    used: false,
    alive: false,
    team: 0,
    type: 'rifle',
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    aimYaw: 0,
    aimPitch: 0,
    hp: 100,
    maxHp: 100,
    bleed: 0,
    headW: 0,
    torsoW: 0,
    armL: 0,
    armR: 0,
    legL: 0,
    legR: 0,
    downed: false,
    downT: 0,
    order: 'attack',
    holdX: 0,
    holdZ: 0,
    moveX: 0,
    moveZ: 0,
    flankSide: 1,
    flankDone: false,
    goalX: 0,
    goalZ: 0,
    goalMode: 0,
    target: null,
    targetId: 0,
    nearest: null,
    sees: false,
    thinkT: 0,
    fireT: 0,
    burstLeft: 1,
    shotsInBurst: 0,
    mag: 30,
    reloadT: 0,
    reloadP: -1,
    lastShotT: -99,
    cover: -1,
    hurtT: 99,
    staggerT: 0,
    /** 0..1: how much fire is coming their way. Spoils aim, sends them to cover. */
    suppress: 0,
    wantCrouch: false,
    wantProne: false,
    crouchy: false,
    wCrouch: 0,
    wProne: 0,
    wDown: 0,
    animMove: 0,
    gait: 0,
    ready: 0,
    recoil: 0,
    flinchX: 0,
    flinchZ: 0,
    dropY: 0,
    /** Standing height: the top of the rampart section `deck` (rampart.js), or 0 / -1. */
    fy: 0,
    deck: -1,
    dropV: 0,
    scale: 1,
    progressT: 0,
    progressD: 0,
    detourT: 0,
    detourX: 0,
    detourZ: 0,
    dripT: 0,
    kills: 0,
    selected: false,
    seed: 0,
    // Fire: seconds left burning, damage per second, when to pick a new panic direction.
    burnT: 0,
    burnDps: 0,
    burnerSlot: -1,
    burnerId: 0,
    panicT: 0,
    charred: false,
    // Medic: the patient they're working on (and its id, in case the slot is reused),
    // how long they've been at it; and on the patient's side, who's coming for them.
    patient: null,
    patientId: 0,
    healT: 0,
    medicId: 0,
    medicSlot: -1,
    // Thrown by a blast without a ragdoll (over the ragdoll budget): a scripted arc.
    flinging: false,
    flingVX: 0,
    flingVY: 0,
    flingVZ: 0,
    flingY: 0,
    flingAng: 0,
    flingSpin: 0,
    flingAX: 1,
    flingAZ: 0,
    // Body state once dead.
    deadT: 0,
    joints: new Float32Array(JOINT_COUNT * 3),
    prev: new Float32Array(JOINT_COUNT * 3),
    rest: new Float32Array(STICK_COUNT),
    ragActive: false,
    ragAge: 0,
    ragCalm: 0,
    ragDt: 0,
    ragHitGround: false,
    crumple: false,
    sinkT: 0,
    /** Bumped whenever a dead body's joints move, so the renderer can cache its parts. */
    poseVersion: 0,
  }
}

export function resetSoldier(s, type, team, x, z, yaw, order) {
  s.id = nextId++
  s.used = true
  s.alive = true
  s.team = team
  s.type = type.key
  s.x = x
  s.z = z
  s.fy = 0
  s.deck = -1
  s.vx = 0
  s.vz = 0
  s.yaw = yaw
  s.aimYaw = yaw
  s.aimPitch = 0
  s.hp = type.hp
  s.maxHp = type.hp
  s.bleed = 0
  s.headW = s.torsoW = s.armL = s.armR = s.legL = s.legR = 0
  s.downed = false
  s.downT = 0
  s.order = order
  s.holdX = x
  s.holdZ = z
  s.flankSide = z >= 0 ? 1 : -1
  s.flankDone = false
  s.goalMode = 0
  s.target = null
  s.targetId = 0
  s.nearest = null
  s.sees = false
  s.thinkT = Math.random() * 0.3
  s.fireT = 0.4 + Math.random() * 0.4
  s.burstLeft = type.burst[0]
  s.shotsInBurst = 0
  s.mag = type.mag
  s.reloadT = 0
  s.reloadP = -1
  s.lastShotT = -99
  s.cover = -1
  s.hurtT = 99
  s.staggerT = 0
  s.suppress = 0
  s.wantCrouch = false
  s.wantProne = false
  s.crouchy = Math.random() < 0.6
  s.wCrouch = 0
  s.wProne = 0
  s.wDown = 0
  s.animMove = 0
  s.gait = Math.random() * 6
  s.ready = 0
  s.recoil = 0
  s.flinchX = 0
  s.flinchZ = 0
  s.progressT = 0
  s.progressD = Infinity
  s.detourT = 0
  s.dripT = 0
  s.kills = 0
  s.selected = false
  s.seed = Math.random() * 100
  s.burnT = 0
  s.burnDps = 0
  s.burnerSlot = -1
  s.burnerId = 0
  s.panicT = 0
  s.charred = false
  s.patient = null
  s.patientId = 0
  s.healT = 0
  s.medicId = 0
  s.medicSlot = -1
  s.flinging = false
  s.flingY = 0
  s.flingAng = 0
  s.ragActive = false
  s.crumple = false
  s.sinkT = 0
  s.poseVersion += 1
}
