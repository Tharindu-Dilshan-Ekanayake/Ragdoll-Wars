/**
 * Headless battle smoke test and benchmark: `node scripts/sim-bench.mjs [perTeam]`.
 *
 * Fights a full battle on Training Grounds with no renderer and reports the cost of a
 * simulation tick, the cost of posing every soldier (what the renderer does each frame),
 * and how the fight went. Fails (exit 1) on NaN positions, a stalled battle, or a tick
 * budget overrun.
 */
import { performance } from 'node:perf_hooks'

import TRAINING_GROUNDS from '../src/battle/maps/trainingGrounds.js'
import { animate, buildParts, JOINT_COUNT, PART_COUNT, TRS } from '../src/battle/sim/rig.js'
import { activeBodies, createWorld, spawnUnits, stepWorld } from '../src/battle/sim/world.js'

const perTeam = Number(process.argv[2] || 100)
const caps = { units: perTeam, corpses: perTeam, ragdolls: 6 }
const w = createWorld(TRAINING_GROUNDS, caps)

const MIX = ['rifle', 'rifle', 'smg', 'pistol', 'shotgun', 'rifle', 'mg', 'sniper']
let placed = 0
for (let team = 0; team < 2; team += 1) {
  const sx = team === 0 ? -66 : 66
  for (let i = 0; placed < perTeam * (team + 1) && i < 200; i += 1) {
    const type = MIX[i % MIX.length]
    const z = -36 + (i % 9) * 9
    const x = sx + (team === 0 ? 1 : -1) * Math.floor(i / 9) * 2.5
    const r = spawnUnits(w, type, team, x, z, 1, i % 5 === 0 ? 'flank' : 'attack')
    placed += r.spawned
  }
}
console.log(`placed ${w.stats.deployed[0]} blue + ${w.stats.deployed[1]} red`)

const joints = new Float32Array(JOINT_COUNT * 3)
const parts = new Float32Array(PART_COUNT * TRS)
const DT = 1 / 60
let worstTick = 0
let tickTotal = 0
let ticks = 0
let poseTotal = 0
let poseFrames = 0
let maxBodies = 0
let maxRag = 0
let firstBlood = -1
const timeline = []

function checkFinite(s) {
  if (!Number.isFinite(s.x) || !Number.isFinite(s.z) || !Number.isFinite(s.yaw)) return false
  for (let i = 0; i < s.joints.length; i += 1) if (!Number.isFinite(s.joints[i])) return false
  return true
}

for (let frame = 0; frame < 60 * 150; frame += 1) {
  const t0 = performance.now()
  stepWorld(w, DT)
  const t1 = performance.now()
  tickTotal += t1 - t0
  worstTick = Math.max(worstTick, t1 - t0)
  ticks += 1

  if (frame % 6 === 0) {
    // What the renderer does per frame: pose every living soldier, build parts.
    const p0 = performance.now()
    for (const s of w.living) {
      animate(s, joints, w.time)
      buildParts(joints, parts, 1)
    }
    for (const s of w.bodies) buildParts(s.joints, parts, 1)
    poseTotal += performance.now() - p0
    poseFrames += 1
  }

  maxBodies = Math.max(maxBodies, w.bodies.length)
  maxRag = Math.max(maxRag, activeBodies(w))
  if (firstBlood < 0 && w.stats.lost[0] + w.stats.lost[1] > 0) firstBlood = w.time
  if (frame % 600 === 0) timeline.push(`${w.time.toFixed(0)}s blue ${w.stats.alive[0]} red ${w.stats.alive[1]} lost ${w.stats.lost[0]}/${w.stats.lost[1]}`)

  for (const s of w.slots) {
    if (s.used && !checkFinite(s)) {
      console.error(`NaN in soldier ${s.slot} (${s.type}, alive=${s.alive}) at t=${w.time.toFixed(2)}`)
      process.exit(1)
    }
  }
  if (w.stats.alive[0] === 0 || w.stats.alive[1] === 0) break
}

console.log(timeline.join('\n'))
console.log(`ended at ${w.time.toFixed(1)}s: blue ${w.stats.alive[0]} alive (lost ${w.stats.lost[0]}), red ${w.stats.alive[1]} alive (lost ${w.stats.lost[1]})`)
console.log(`first casualty at ${firstBlood.toFixed(1)}s, kills blue ${w.stats.kills[0]} red ${w.stats.kills[1]}`)
console.log(`sim tick: avg ${(tickTotal / ticks).toFixed(3)} ms, worst ${worstTick.toFixed(2)} ms`)
console.log(`pose+parts for all soldiers: avg ${(poseTotal / poseFrames).toFixed(3)} ms per frame`)
console.log(`max bodies on ground ${maxBodies}, max active ragdoll bodies ${maxRag}, flow fields built ${w.flow.builds}`)

let failed = false
if (firstBlood < 0) {
  console.error('FAIL: nobody died - soldiers never engaged')
  failed = true
}
if (tickTotal / ticks > 4) {
  console.error('FAIL: average sim tick over 4 ms')
  failed = true
}
process.exit(failed ? 1 : 0)
