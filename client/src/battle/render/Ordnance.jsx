import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { useQuality } from '../../store/quality'
import { drain } from '../sim/fx'
import { groundAt } from '../sim/terrain'
import { MAX_MINES, MAX_PROJECTILES } from '../sim/ordnance'
import { J_PELVIS } from '../sim/rig'
import { addFrameHook, battle, PHASE } from '../state'
import { createParticles, spawnParticle, stepParticles } from './particles'
import { getTextures } from './textures'

/**
 * Phase 2's visuals, each pooled and drawn with one instanced mesh:
 *  - explosions: a fireball and a shockwave ring on the ground, a scorch mark left behind
 *    and (with a flash light on the preset) a burst of light
 *  - rockets and mortar shells in flight; rockets trail a glowing exhaust
 *  - flamethrower streams (a flickering cone), and flames on anyone burning
 *  - landmines with a blinking team light
 *  - a green cross over a soldier a medic is patching up
 *  - on presets with particles: explosion smoke, rocket smoke trails and fire embers
 *
 * Empty meshes are hidden so they cost no draw call. Time is battle time.
 */

const MAX_EXPLOSIONS = 32
const MAX_SCORCH = 48
const MAX_FLAMES = 48
const MAX_FIRES = 96
const MAX_HEALS = 24

const m4 = new Matrix4()
const q4 = new Quaternion()
const qFlat = new Quaternion()
const v3 = new Vector3()
const s3 = new Vector3()
const dir = new Vector3()
const zAxis = new Vector3(0, 0, 1)
const yAxis = new Vector3(0, 1, 0)
const TEAM_LIGHT = [new Color('#57a0ff'), new Color('#ff5a5a')]
const DIM = 0.18

function tint(geo, hex) {
  const c = new Color(hex)
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return geo
}

function instanced(geo, mat, n, withColor = false) {
  const mesh = new InstancedMesh(geo, mat, n)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  if (withColor) {
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
    mesh.instanceColor.setUsage(DynamicDrawUsage)
  }
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  return mesh
}

function commit(mesh, n) {
  mesh.count = n
  mesh.visible = n > 0
  if (!n) return
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.addUpdateRange(0, n * 16)
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges()
    mesh.instanceColor.addUpdateRange(0, n * 3)
    mesh.instanceColor.needsUpdate = true
  }
}

function put(mesh, i, x, y, z, q, sx, sy, sz) {
  v3.set(x, y, z)
  s3.set(sx, sy, sz)
  m4.compose(v3, q, s3)
  m4.toArray(mesh.instanceMatrix.array, i * 16)
}

function color(mesh, i, r, g, b) {
  const a = mesh.instanceColor.array
  a[i * 3] = r
  a[i * 3 + 1] = g
  a[i * 3 + 2] = b
}

function rocketGeometry() {
  const parts = [
    tint(new CylinderGeometry(0.045, 0.045, 0.6, 6).rotateX(Math.PI / 2), '#59613f'),
    tint(new ConeGeometry(0.045, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.38), '#8c8566'),
  ]
  for (let k = 0; k < 4; k += 1) parts.push(tint(new BoxGeometry(0.012, 0.14, 0.12).translate(0, 0.06, -0.24).rotateZ((k * Math.PI) / 2), '#3a3f2a'))
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

/** A cone with its tip at the origin opening along +Z; bright at the nozzle, dark red at the end. */
function flameGeometry() {
  const g = new ConeGeometry(1, 1, 12, 4, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(1, Math.max(0, pos.getZ(i)))
    // Hot orange at the nozzle, dark red at the tip (additive: dark = see-through).
    col[i * 3] = 0.85 - 0.45 * t
    col[i * 3 + 1] = 0.42 - 0.36 * t
    col[i * 3 + 2] = 0.1 - 0.1 * t
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

function crossGeometry() {
  const a = new BoxGeometry(0.12, 0.42, 0.06)
  const b = new BoxGeometry(0.42, 0.12, 0.06)
  const g = mergeGeometries([a, b])
  a.dispose()
  b.dispose()
  return g
}

export default function Ordnance() {
  const particlesOn = useQuality((s) => s.settings.particles)
  const particleCount = useQuality((s) => s.settings.particleCount)
  const flashLightOn = useQuality((s) => s.settings.flashLight)
  const lightRef = useRef(null)
  const cursors = useRef({ ex: battle.world ? battle.world.fx.explosions.head : 0, fl: battle.world ? battle.world.fx.flames.head : 0 })

  const fx = useMemo(() => {
    const tex = getTextures()
    const additive = (opts) => new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, ...opts })
    const geos = {
      ball: new IcosahedronGeometry(1, 1),
      ring: new RingGeometry(0.72, 1, 36).rotateX(-Math.PI / 2),
      flat: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      card: new PlaneGeometry(1, 1),
      rocket: rocketGeometry(),
      shell: new SphereGeometry(1, 6, 4),
      flame: flameGeometry(),
      cross: crossGeometry(),
      mine: (() => {
        const a = tint(new CylinderGeometry(0.27, 0.3, 0.1, 10), '#4b5233')
        const b = tint(new CylinderGeometry(0.08, 0.08, 0.05, 8).translate(0, 0.07, 0), '#2d3020')
        const g = mergeGeometries([a, b])
        a.dispose()
        b.dispose()
        return g
      })(),
      light: new SphereGeometry(0.045, 6, 4),
    }
    const mats = {
      ball: additive({ color: '#ffffff' }),
      ring: additive({ color: '#ffffff', opacity: 0.9 }),
      scorch: new MeshBasicMaterial({ color: '#241c14', alphaMap: tex.splat, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      glow: additive({ map: tex.flash, color: '#ffffff' }),
      solid: new MeshLambertMaterial({ vertexColors: true }),
      shell: new MeshLambertMaterial({ color: '#2f3326' }),
      flame: additive({ vertexColors: true, opacity: 0.55, side: DoubleSide }),
      fire: additive({ map: tex.flash, color: '#ffffff' }),
      cross: new MeshBasicMaterial({ color: '#3ee07a', toneMapped: false }),
      light: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    }
    const meshes = {
      balls: instanced(geos.ball, mats.ball, MAX_EXPLOSIONS, true),
      rings: instanced(geos.ring, mats.ring, MAX_EXPLOSIONS, true),
      scorch: instanced(geos.flat, mats.scorch, MAX_SCORCH),
      rockets: instanced(geos.rocket, mats.solid, MAX_PROJECTILES),
      shells: instanced(geos.shell, mats.shell, MAX_PROJECTILES),
      glows: instanced(geos.card, mats.glow, MAX_PROJECTILES * 2, true),
      flames: instanced(geos.flame, mats.flame, MAX_FLAMES),
      fires: instanced(geos.card, mats.fire, MAX_FIRES, true),
      crosses: instanced(geos.cross, mats.cross, MAX_HEALS),
      mines: instanced(geos.mine, mats.solid, MAX_MINES),
      lights: instanced(geos.light, mats.light, MAX_MINES, true),
    }
    meshes.scorch.renderOrder = 0
    meshes.balls.renderOrder = 3
    return { geos, mats, meshes }
  }, [])

  const smoke = useMemo(() => (particlesOn ? createParticles(Math.round(particleCount * 0.6), false) : null), [particlesOn, particleCount])
  const embers = useMemo(() => (particlesOn ? createParticles(Math.round(particleCount * 0.4), true) : null), [particlesOn, particleCount])

  useEffect(
    () => () => {
      for (const g of Object.values(fx.geos)) g.dispose()
      for (const m of Object.values(fx.mats)) m.dispose()
    },
    [fx],
  )
  useEffect(() => () => smoke?.dispose(), [smoke])
  useEffect(() => () => embers?.dispose(), [embers])

  useEffect(() => {
    let emberT = 0
    return addFrameHook(PHASE.DRAW, (state, delta) => {
      const w = battle.world
      if (!w) return
      const time = w.time
      const dt = Math.min(0.05, delta) * w.timeScale
      const cam = state.camera
      const M = fx.meshes
      const camQ = cam.quaternion

      // --- Explosions: fireball + shockwave; new ones puff smoke -----------------------
      const ex = w.fx.explosions
      let nB = 0
      let nR = 0
      let lightAge = 1
      let lightE = null
      for (let i = 0; i < ex.size; i += 1) {
        const e = ex.items[i]
        const age = time - e.t0
        if (age < 0 || age > 0.9) continue
        if (age < 0.6) {
          const t = age / 0.6
          const r = e.radius * (0.3 + 0.7 * Math.sqrt(t)) * 0.55
          put(M.balls, nB, e.x, e.y + r * 0.4, e.z, qFlat.identity(), r, r * 0.9, r)
          // White-hot, then orange, then gone (additive: darker is more see-through).
          const k = Math.pow(1 - t, 1.6)
          color(M.balls, nB, k, 0.5 * Math.pow(k, 1.5) + 0.02, 0.14 * k * k)
          nB += 1
        }
        if (age < 0.45) {
          const t = age / 0.45
          const r = e.radius * (0.4 + 1.3 * t)
          put(M.rings, nR, e.x, groundAt(w.terrain, e.x, e.z) + 0.06, e.z, qFlat.identity(), r, 1, r)
          const k = (1 - t) * 0.8
          color(M.rings, nR, k, k * 0.85, k * 0.6)
          nR += 1
        }
        if (age < lightAge) {
          lightAge = age
          lightE = e
        }
      }
      commit(M.balls, nB)
      commit(M.rings, nR)
      const light = lightRef.current
      if (light) {
        if (lightE && lightAge < 0.3) {
          light.position.set(lightE.x, lightE.y + 2, lightE.z)
          light.intensity = 40 * (1 - lightAge / 0.3)
          light.distance = lightE.radius * 5
        } else light.intensity = 0
      }
      cursors.current.ex = drain(ex, cursors.current.ex, (e) => {
        if (!smoke || time - e.t0 > 0.5) return
        const n = Math.round(10 + e.radius * 2)
        for (let k = 0; k < n; k += 1) {
          const a = Math.random() * Math.PI * 2
          const sp = e.radius * (0.4 + Math.random() * 0.9)
          const g = 0.22 + Math.random() * 0.14
          spawnParticle(smoke, e.x, e.y + 0.3, e.z, Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp, g + 0.08, g + 0.07, g + 0.05, 1.1 + Math.random() * 0.9, 1.8, 2 + Math.random() * 1.4, 0.8, 0.55)
        }
        if (embers) {
          for (let k = 0; k < 10; k += 1) {
            const a = Math.random() * Math.PI * 2
            const sp = 3 + Math.random() * 6
            spawnParticle(embers, e.x, e.y + 0.4, e.z, Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp, 1, 0.55, 0.15, 0.25, 0, 0.6 + Math.random() * 0.5, -9, 1)
          }
        }
      })

      // --- Scorch marks -----------------------------------------------------------------
      const sc = w.fx.scorches
      if (w.fx.clearScorches) {
        for (const d of sc.items) d.t0 = -99
        w.fx.clearScorches = false
      }
      let nS = 0
      for (let i = 0; i < sc.size; i += 1) {
        const d = sc.items[i]
        if (d.t0 < 0 || d.t0 > time) continue
        q4.setFromAxisAngle(yAxis, d.rot)
        const sz = d.size * 1.3 * Math.min(1, (time - d.t0) * 8)
        put(M.scorch, nS, d.x, 0.014 + (i % 11) * 0.0007, d.z, q4, sz, 1, sz)
        nS += 1
      }
      commit(M.scorch, nS)

      // --- Rockets and shells -------------------------------------------------------------
      const proj = w.ord.projectiles
      let nRk = 0
      let nSh = 0
      let nG = 0
      for (let i = 0; i < proj.length; i += 1) {
        const p = proj[i]
        if (!p.active) continue
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1
        dir.set(p.vx / sp, p.vy / sp, p.vz / sp)
        q4.setFromUnitVectors(zAxis, dir)
        if (p.kind === 'shell' || p.kind === 'bomb') {
          const b = p.kind === 'bomb' ? (p.big ? 0.45 : 0.2) : 0.07
          put(M.shells, nSh, p.x, p.y, p.z, q4, b, b, b * 2.5)
          nSh += 1
        } else if (p.kind === 'acid') {
          // A glowing green gob with a fainter one trailing.
          put(M.glows, nG, p.x, p.y, p.z, camQ, 0.42, 0.42, 0.42)
          color(M.glows, nG, 0.45, 0.95, 0.15)
          nG += 1
          put(M.glows, nG, p.x - dir.x * 0.35, p.y - dir.y * 0.35, p.z - dir.z * 0.35, camQ, 0.3, 0.3, 0.3)
          color(M.glows, nG, 0.3, 0.6, 0.1)
          nG += 1
        } else if (p.kind === 'cannon') {
          put(M.shells, nSh, p.x, p.y, p.z, q4, 0.06, 0.06, 0.3)
          nSh += 1
          const g = 0.5
          put(M.glows, nG, p.x, p.y, p.z, camQ, g, g, g)
          color(M.glows, nG, 1, 0.85, 0.5)
          nG += 1
        } else {
          put(M.rockets, nRk, p.x, p.y, p.z, q4, 1, 1, 1)
          nRk += 1
          const tx = p.x - dir.x * 0.42
          const ty = p.y - dir.y * 0.42
          const tz = p.z - dir.z * 0.42
          const g = 0.55 + Math.random() * 0.25
          put(M.glows, nG, tx, ty, tz, camQ, g, g, g)
          color(M.glows, nG, 1, 0.7, 0.35)
          nG += 1
          if (smoke) spawnParticle(smoke, tx, ty, tz, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 0.78, 0.78, 0.76, 0.35, 3, 1.1, 0.3, 0.5)
        }
      }
      commit(M.rockets, nRk)
      commit(M.shells, nSh)
      commit(M.glows, nG)

      // --- Flame streams ----------------------------------------------------------------
      const fl = w.fx.flames
      let nFl = 0
      for (let i = 0; i < fl.size; i += 1) {
        const f = fl.items[i]
        const age = time - f.t0
        if (age < 0 || age > 0.13) continue
        dir.set(f.dx, f.dy, f.dz)
        q4.setFromUnitVectors(zAxis, dir)
        const flick = 0.85 + Math.random() * 0.3
        const len = f.len * flick
        const r = len * (0.07 + Math.random() * 0.03)
        put(M.flames, nFl, f.x, f.y, f.z, q4, r, r, len)
        nFl += 1
      }
      commit(M.flames, nFl)
      cursors.current.fl = drain(fl, cursors.current.fl, (f) => {
        if (!embers || time - f.t0 > 0.3) return
        for (let k = 0; k < 4; k += 1) {
          const d = f.len * (0.3 + Math.random() * 0.7)
          const sp = 2 + Math.random() * 3
          spawnParticle(embers, f.x + f.dx * d, f.y + f.dy * d, f.z + f.dz * d, f.dx * sp, 1 + Math.random(), f.dz * sp, 1, 0.5 + Math.random() * 0.2, 0.1, 0.6 + Math.random() * 0.5, 1.5, 0.35 + Math.random() * 0.25, 2, 0.8)
        }
      })

      // --- People on fire; a medic's patient ----------------------------------------------
      let nFi = 0
      let nC = 0
      emberT -= dt
      const puff = emberT <= 0
      if (puff) emberT = 0.07
      const slots = w.slots
      for (let i = 0; i < slots.length; i += 1) {
        const s = slots[i]
        if (!s.used) continue
        if (s.burnT > 0 && nFi < MAX_FIRES - 1) {
          let x = s.x
          let y = 0.95
          let z = s.z
          if (!s.alive) {
            x = s.joints[J_PELVIS * 3]
            y = s.joints[J_PELVIS * 3 + 1] + 0.25
            z = s.joints[J_PELVIS * 3 + 2]
          }
          const fade = Math.min(1, s.burnT)
          for (let k = 0; k < 2; k += 1) {
            const sz = (k === 0 ? 1.0 : 0.75) * (0.8 + Math.random() * 0.4) * (0.5 + 0.5 * fade)
            put(M.fires, nFi, x + (Math.random() - 0.5) * 0.15, y + (k === 0 ? 0.25 : -0.3) * (s.alive ? 1 : 0.4), z + (Math.random() - 0.5) * 0.15, camQ, sz, sz * 1.3, sz)
            color(M.fires, nFi, 1, 0.55, 0.18)
            nFi += 1
          }
          if (puff && embers) spawnParticle(embers, x, y + 0.4, z, (Math.random() - 0.5) * 0.6, 1.5, (Math.random() - 0.5) * 0.6, 1, 0.45, 0.1, 0.45, 1, 0.5, 2, 0.8)
          if (puff && smoke && Math.random() < 0.5) spawnParticle(smoke, x, y + 0.9, z, 0, 0.8, 0, 0.18, 0.17, 0.16, 0.6, 2.5, 1.6, 0.6, 0.45)
        }
        if (s.alive && s.patient && s.healT > 0 && nC < MAX_HEALS) {
          const p = s.patient
          q4.setFromAxisAngle(yAxis, time * 2.5)
          put(M.crosses, nC, p.x, groundAt(w.terrain, p.x, p.z) + 2.15 + Math.sin(time * 4) * 0.06, p.z, q4, 1, 1, 1)
          nC += 1
        }
      }
      commit(M.fires, nFi)
      commit(M.crosses, nC)

      // --- Mines ------------------------------------------------------------------------
      const mines = w.ord.mines
      let nM = 0
      for (let i = 0; i < mines.length; i += 1) {
        const m = mines[i]
        if (!m.active) continue
        put(M.mines, nM, m.x, groundAt(w.terrain, m.x, m.z) + 0.05, m.z, qFlat.identity(), 1, 1, 1)
        put(M.lights, nM, m.x, 0.13, m.z, qFlat.identity(), 1, 1, 1)
        const c = TEAM_LIGHT[m.team]
        const on = m.armT <= 0 ? (Math.sin(time * 5 + m.seed) > 0.4 ? 1 : DIM) : 0.5
        color(M.lights, nM, c.r * on, c.g * on, c.b * on)
        nM += 1
      }
      commit(M.mines, nM)
      commit(M.lights, nM)

      if (smoke) stepParticles(smoke, dt, state.size.height)
      if (embers) stepParticles(embers, dt, state.size.height)
    })
  }, [fx, smoke, embers])

  const M = fx.meshes
  return (
    <group>
      <primitive object={M.scorch} />
      <primitive object={M.mines} />
      <primitive object={M.lights} />
      <primitive object={M.rockets} />
      <primitive object={M.shells} />
      <primitive object={M.glows} />
      <primitive object={M.flames} />
      <primitive object={M.fires} />
      <primitive object={M.crosses} />
      <primitive object={M.rings} />
      <primitive object={M.balls} />
      {smoke && <primitive object={smoke.points} />}
      {embers && <primitive object={embers.points} />}
      {flashLightOn && <pointLight ref={lightRef} color="#ffb060" intensity={0} distance={20} decay={1.4} />}
    </group>
  )
}
