import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { useSettings } from '../../store/settings'
import { useQuality } from '../../store/quality'
import { BULLET_SPEED } from '../sim/constants'
import { drain } from '../sim/fx'
import { addFrameHook, battle, PHASE } from '../state'
import { getTextures } from './textures'

/**
 * Battle effects, each one pooled and drawn with a single draw call:
 *  - tracers: short glowing streaks flying at bullet speed (instanced boxes)
 *  - muzzle flashes: crossed glow cards on the barrel, plus one shared flash light
 *  - particles: dirt, dust, concrete chips, sparks and blood mist (MEDIUM/HIGH only)
 *  - blood pools: decals that spread on the ground (can be turned off in Settings)
 *
 * Time is battle time, so all of it slows down, speeds up and pauses with the battle.
 */

const MAX_TRACERS = 320
const MAX_FLASHES = 64
const MAX_DECALS = 180
const TRACER_LEN = 3.2

const m4 = new Matrix4()
const q4 = new Quaternion()
const v3 = new Vector3()
const s3 = new Vector3()
const zAxis = new Vector3(0, 0, 1)
const yAxisV = new Vector3(0, 1, 0)
const dirV = new Vector3()

function flashGeometry() {
  // Two cards crossed along the barrel and one facing forward.
  const a = new PlaneGeometry(0.34, 0.7).rotateX(Math.PI / 2).translate(0, 0, 0.3)
  const b = new PlaneGeometry(0.34, 0.7).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0, 0.3)
  const c = new PlaneGeometry(0.38, 0.38).translate(0, 0, 0.08)
  const g = mergeGeometries([a, b, c])
  a.dispose()
  b.dispose()
  c.dispose()
  return g
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`
const PARTICLE_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    if (d > 0.25) discard;
    float a = vAlpha * smoothstep(0.25, 0.08, d);
    gl_FragColor = vec4(vColor, a);
  }
`

// Particle look per impact kind: [count, colour, size, speed, up, gravity, life, grow]
const KINDS = {
  dirt: [4, '#6b5638', 0.32, 2.4, 2.6, 9, 0.7, 0.4],
  dust: [3, '#a8977a', 0.7, 0.8, 0.6, -0.3, 1.1, 2.2],
  blood: [5, '#7d0d0d', 0.2, 2.2, 1.6, 9, 0.55, 0.2],
  mist: [2, '#9c1c1c', 0.5, 0.6, 0.4, 0, 0.35, 1.6],
  concrete: [4, '#b8b4aa', 0.24, 3.2, 2.4, 10, 0.6, 0.2],
  spark: [2, '#ffd27a', 0.12, 7, 2.5, 12, 0.18, 0],
  puff: [7, '#b5a68a', 0.9, 1.6, 0.4, -0.2, 0.9, 1.6],
}
const KIND_RGB = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, new Color(v[1])]))

export default function Effects() {
  const particlesOn = useQuality((s) => s.settings.particles)
  const maxParticles = useQuality((s) => s.settings.particleCount)
  const flashLightOn = useQuality((s) => s.settings.flashLight)
  const blood = useSettings((s) => s.blood)
  const lightRef = useRef(null)
  /** How far into the sim's impact ring the particles have read. */
  const impactCursor = useRef(battle.world ? battle.world.fx.impacts.head : 0)

  const fx = useMemo(() => {
    const tex = getTextures()
    // Tracers
    const tracerGeo = new BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
    const tracerMat = new MeshBasicMaterial({ color: '#ffcf6e', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    const tracers = new InstancedMesh(tracerGeo, tracerMat, MAX_TRACERS)
    tracers.instanceMatrix.setUsage(DynamicDrawUsage)
    tracers.frustumCulled = false
    tracers.count = 0
    // Flashes
    const flashGeo = flashGeometry()
    const flashMat = new MeshBasicMaterial({ map: tex.flash, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    const flashes = new InstancedMesh(flashGeo, flashMat, MAX_FLASHES)
    flashes.instanceMatrix.setUsage(DynamicDrawUsage)
    flashes.frustumCulled = false
    flashes.count = 0
    // Blood pools
    const decalGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const decalMat = new MeshBasicMaterial({ color: '#5a0b0b', alphaMap: tex.splat, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    const decals = new InstancedMesh(decalGeo, decalMat, MAX_DECALS)
    decals.instanceMatrix.setUsage(DynamicDrawUsage)
    decals.frustumCulled = false
    decals.count = 0
    decals.renderOrder = 0
    return { tracers, flashes, decals, tracerGeo, tracerMat, flashGeo, flashMat, decalGeo, decalMat }
  }, [])

  // Particles, rebuilt when the preset changes how many there may be.
  const particles = useMemo(() => {
    if (!particlesOn) return null
    const n = maxParticles
    const geo = new BufferGeometry()
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const alpha = new Float32Array(n)
    geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
    geo.setAttribute('aColor', new BufferAttribute(col, 3).setUsage(DynamicDrawUsage))
    geo.setAttribute('aSize', new BufferAttribute(size, 1).setUsage(DynamicDrawUsage))
    geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage))
    const mat = new ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
    })
    const points = new Points(geo, mat)
    points.frustumCulled = false
    return {
      points,
      geo,
      mat,
      n,
      vel: new Float32Array(n * 3),
      life: new Float32Array(n),
      maxLife: new Float32Array(n).fill(1),
      baseSize: new Float32Array(n),
      grow: new Float32Array(n),
      grav: new Float32Array(n),
      next: 0,
    }
  }, [particlesOn, maxParticles])

  useEffect(
    () => () => {
      fx.tracerGeo.dispose()
      fx.tracerMat.dispose()
      fx.flashGeo.dispose()
      fx.flashMat.dispose()
      fx.decalGeo.dispose()
      fx.decalMat.dispose()
    },
    [fx],
  )
  useEffect(
    () => () => {
      if (!particles) return
      particles.geo.dispose()
      particles.mat.dispose()
    },
    [particles],
  )

  useEffect(() => {
    const spawn = (kindKey, x, y, z) => {
      if (!particles) return
      const k = KINDS[kindKey]
      const c = KIND_RGB[kindKey]
      const p = particles
      const posArr = p.geo.attributes.position.array
      const colArr = p.geo.attributes.aColor.array
      for (let i = 0; i < k[0]; i += 1) {
        const j = p.next
        p.next = (p.next + 1) % p.n
        posArr[j * 3] = x
        posArr[j * 3 + 1] = y
        posArr[j * 3 + 2] = z
        const a = Math.random() * Math.PI * 2
        const sp = k[3] * (0.5 + Math.random() * 0.7)
        p.vel[j * 3] = Math.cos(a) * sp
        p.vel[j * 3 + 1] = k[4] * (0.5 + Math.random())
        p.vel[j * 3 + 2] = Math.sin(a) * sp
        const shade = 0.85 + Math.random() * 0.3
        colArr[j * 3] = c.r * shade
        colArr[j * 3 + 1] = c.g * shade
        colArr[j * 3 + 2] = c.b * shade
        p.life[j] = k[6] * (0.7 + Math.random() * 0.6)
        p.maxLife[j] = p.life[j]
        p.baseSize[j] = k[2] * (0.7 + Math.random() * 0.6)
        p.grow[j] = k[7]
        p.grav[j] = k[5]
      }
    }

    return addFrameHook(PHASE.DRAW, (state, delta) => {
      const w = battle.world
      if (!w) return
      const time = w.time
      const bloodOn = useSettings.getState().blood
      const cam = battle.camera

      // --- Tracers -----------------------------------------------------------------
      const tr = w.fx.tracers
      let nT = 0
      const tArr = fx.tracers.instanceMatrix.array
      for (let i = 0; i < tr.size; i += 1) {
        const t = tr.items[i]
        const age = time - t.t0
        if (age < 0 || t.len <= 0) continue
        const head = age * BULLET_SPEED
        const tail = head - TRACER_LEN
        if (tail >= t.len) continue
        const a = Math.max(0, tail)
        const b = Math.min(head, t.len)
        if (b <= a) continue
        const inv = 1 / t.len
        dirV.set((t.x1 - t.x0) * inv, (t.y1 - t.y0) * inv, (t.z1 - t.z0) * inv)
        q4.setFromUnitVectors(zAxis, dirV)
        const thick = t.heavy ? 0.06 : 0.035
        v3.set(t.x0 + dirV.x * a, t.y0 + dirV.y * a, t.z0 + dirV.z * a)
        s3.set(thick, thick, b - a)
        m4.compose(v3, q4, s3)
        m4.toArray(tArr, nT * 16)
        nT += 1
        if (nT >= MAX_TRACERS) break
      }
      fx.tracers.count = nT
      if (nT) {
        fx.tracers.instanceMatrix.clearUpdateRanges()
        fx.tracers.instanceMatrix.addUpdateRange(0, nT * 16)
        fx.tracers.instanceMatrix.needsUpdate = true
      }

      // --- Muzzle flashes + the shared flash light -----------------------------------
      const fl = w.fx.flashes
      let nF = 0
      const fArr = fx.flashes.instanceMatrix.array
      let lightBest = null
      let lightAge = 1
      for (let i = 0; i < fl.size; i += 1) {
        const f = fl.items[i]
        const age = time - f.t0
        if (age < 0 || age > 0.055) continue
        const k = 1 - age / 0.055
        dirV.set(f.dx, f.dy, f.dz)
        q4.setFromUnitVectors(zAxis, dirV)
        const sz = f.size * (0.6 + 0.6 * k) * (0.85 + ((i * 0.37) % 0.3))
        v3.set(f.x, f.y, f.z)
        s3.set(sz, sz, sz)
        m4.compose(v3, q4, s3)
        m4.toArray(fArr, nF * 16)
        nF += 1
        if (age < lightAge && cam) {
          // The flash nearest the camera's focus gets the light.
          const dx = f.x - battle.view.tx
          const dz = f.z - battle.view.tz
          if (dx * dx + dz * dz < battle.view.dist * battle.view.dist) {
            lightAge = age
            lightBest = f
          }
        }
      }
      fx.flashes.count = nF
      if (nF) {
        fx.flashes.instanceMatrix.clearUpdateRanges()
        fx.flashes.instanceMatrix.addUpdateRange(0, nF * 16)
        fx.flashes.instanceMatrix.needsUpdate = true
      }
      const light = lightRef.current
      if (light) {
        if (lightBest) {
          light.position.set(lightBest.x + lightBest.dx * 0.5, lightBest.y + 0.3, lightBest.z + lightBest.dz * 0.5)
          light.intensity = 6 * (1 - lightAge / 0.055)
        } else {
          light.intensity = 0
        }
      }

      // --- Impacts -> particles ------------------------------------------------------
      impactCursor.current = drain(w.fx.impacts, impactCursor.current, (it) => {
        if (time - it.t0 > 0.5) return
        if (it.kind === 0) {
          spawn('dirt', it.x, it.y + 0.05, it.z)
          spawn('dust', it.x, it.y + 0.1, it.z)
        } else if (it.kind === 1) {
          if (bloodOn) {
            spawn('blood', it.x, it.y, it.z)
            spawn('mist', it.x, it.y, it.z)
          } else spawn('dust', it.x, it.y, it.z)
        } else if (it.kind === 2) {
          spawn('concrete', it.x, it.y, it.z)
          spawn('spark', it.x, it.y, it.z)
          spawn('dust', it.x, it.y, it.z)
        } else {
          spawn('puff', it.x, it.y, it.z)
        }
      })
      if (particles) {
        const p = particles
        const dt = Math.min(0.05, delta) * w.timeScale
        const posArr = p.geo.attributes.position.array
        const sizeArr = p.geo.attributes.aSize.array
        const alphaArr = p.geo.attributes.aAlpha.array
        for (let j = 0; j < p.n; j += 1) {
          if (p.life[j] <= 0) {
            if (alphaArr[j] !== 0) alphaArr[j] = 0
            continue
          }
          p.life[j] -= dt
          const t = 1 - p.life[j] / p.maxLife[j]
          p.vel[j * 3 + 1] -= p.grav[j] * dt
          posArr[j * 3] += p.vel[j * 3] * dt
          posArr[j * 3 + 1] += p.vel[j * 3 + 1] * dt
          posArr[j * 3 + 2] += p.vel[j * 3 + 2] * dt
          if (posArr[j * 3 + 1] < 0.02) {
            posArr[j * 3 + 1] = 0.02
            p.vel[j * 3] *= 0.5
            p.vel[j * 3 + 1] = 0
            p.vel[j * 3 + 2] *= 0.5
          }
          sizeArr[j] = p.baseSize[j] * (1 + p.grow[j] * t)
          alphaArr[j] = (1 - t) * (t < 0.1 ? t * 10 : 1) * 0.9
        }
        p.geo.attributes.position.needsUpdate = true
        p.geo.attributes.aSize.needsUpdate = true
        p.geo.attributes.aAlpha.needsUpdate = true
        p.geo.attributes.aColor.needsUpdate = true
        p.mat.uniforms.uScale.value = state.size.height * 0.9
      }

      // --- Blood pools ------------------------------------------------------------------
      const dc = w.fx.decals
      if (w.fx.clearDecals) {
        for (const d of dc.items) d.t0 = -99
        w.fx.clearDecals = false
      }
      let nD = 0
      if (bloodOn) {
        const dArr = fx.decals.instanceMatrix.array
        for (let i = 0; i < dc.size; i += 1) {
          const d = dc.items[i]
          if (d.t0 < 0 || d.t0 > time) continue
          const grow = Math.min(1, (time - d.t0) / 1.6)
          const sz = d.size * (0.35 + 0.65 * Math.sqrt(grow)) * 2
          q4.setFromAxisAngle(yAxisV, d.rot)
          v3.set(d.x, 0.012 + (i % 13) * 0.0008, d.z)
          s3.set(sz, 1, sz)
          m4.compose(v3, q4, s3)
          m4.toArray(dArr, nD * 16)
          nD += 1
        }
      }
      fx.decals.count = nD
      if (nD) {
        fx.decals.instanceMatrix.clearUpdateRanges()
        fx.decals.instanceMatrix.addUpdateRange(0, nD * 16)
        fx.decals.instanceMatrix.needsUpdate = true
      }
    })
  }, [fx, particles])

  return (
    <group>
      <primitive object={fx.decals} visible={blood} />
      <primitive object={fx.tracers} />
      <primitive object={fx.flashes} />
      {particles && <primitive object={particles.points} />}
      {flashLightOn && <pointLight ref={lightRef} color="#ffb860" intensity={0} distance={9} decay={1.6} />}
    </group>
  )
}

