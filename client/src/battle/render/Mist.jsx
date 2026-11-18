import { useEffect, useMemo } from 'react'
import { CanvasTexture, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { addFrameHook, PHASE } from '../state'
import { hash } from './coverGeometry'

/**
 * Banks of mist lying over a map's low ground (`map.mist`: the x range to fill): big
 * soft puffs that always face the camera and drift slowly, one instanced mesh, one draw
 * call. They thin out as the camera comes up close, so you walk into the mist rather
 * than through a sheet. Off on LOW (the fog alone carries it there).
 */

const PER_PRESET = { LOW: 0, MEDIUM: 26, HIGH: 40 }
/** The drift clock (a number in a uniform; one battle at a time). */
const mistClock = { value: 0 }

const VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    vec3 c = vec3(instanceMatrix[3]);
    float sx = length(vec3(instanceMatrix[0]));
    float sy = length(vec3(instanceMatrix[1]));
    c.x += sin(uTime * 0.035 + aSeed * 6.28) * 5.0;
    c.z += cos(uTime * 0.027 + aSeed * 3.7) * 2.5;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += position.xy * vec2(sx, sy);
    vFade = smoothstep(5.0, 22.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float a = texture2D(uTex, vUv).a * uOpacity * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

/** A soft, lumpy puff (alpha only), 128 px. */
function puffTexture() {
  const S = 128
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  for (let k = 0; k < 9; k += 1) {
    const x = S * (0.3 + hash(k, 1.3) * 0.4)
    const y = S * (0.38 + hash(2.1, k) * 0.24)
    const r = S * (0.2 + hash(k, k) * 0.16)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.32)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
  const t = new CanvasTexture(c)
  return t
}

const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()

export default function Mist({ map }) {
  const level = useQuality((s) => s.level)
  const count = map.mist ? PER_PRESET[level] ?? 0 : 0

  const mist = useMemo(() => {
    if (!count) return null
    const geo = new PlaneGeometry(1, 1)
    const tex = puffTexture()
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: tex },
        uColor: { value: new Color(map.fog).lerp(new Color('#dfe6e2'), 0.35) },
        uOpacity: { value: 0.46 },
        uTime: mistClock,
      },
      transparent: true,
      depthWrite: false,
    })
    const mesh = new InstancedMesh(geo, mat, count)
    const seeds = new Float32Array(count)
    const { x0, x1 } = map.mist
    const hz = map.depth / 2
    for (let i = 0; i < count; i += 1) {
      const a = hash(i * 1.37, 7.1)
      const b = hash(3.3, i * 2.11)
      const c = hash(i * 0.71, i * 1.9)
      const w = 26 + c * 22
      p3.set(x0 + a * (x1 - x0), 1.6 + c * 2.2, -hz + b * hz * 2)
      m4.compose(p3, q4, s3.set(w, w * 0.34, 1))
      mesh.setMatrixAt(i, m4)
      seeds[i] = c
    }
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    return { mesh, geo, mat, tex }
  }, [map, count])

  useEffect(
    () => () => {
      if (!mist) return
      mist.geo.dispose()
      mist.mat.dispose()
      mist.tex.dispose()
      mist.mesh.dispose()
    },
    [mist],
  )

  useEffect(() => {
    if (!mist) return undefined
    return addFrameHook(PHASE.DRAW, (state) => {
      mistClock.value = state.clock.elapsedTime
    })
  }, [mist])

  return mist ? <primitive object={mist.mesh} /> : null
}
