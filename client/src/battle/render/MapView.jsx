import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  DoubleSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { useQuality } from '../../store/quality'
import { addFrameHook, PHASE } from '../state'
import { mapObstacles, mapPieces } from '../sim/pieces'
import { BoxBatch, buildCover, col, hash } from './coverGeometry'
import { buildPiecesGeometry, coverBoxesOf } from './structureModels'
import Scatter from './Scatter'
import { getTextures } from './textures'

/**
 * The battlefield: ground (a painted colour map of roads and mud times a grain texture), every
 * cover box merged into one static mesh per material, trees and a fence as scenery, a
 * ring of distant hills, the sky and the sun.
 *
 * Up close: grass, stones and flowers (Scatter.jsx), soft contact shadows painted under
 * every piece of cover, clouds drifting over, and on the coast a sea with rolling foam.
 *
 * Draw calls: ground 1, cover ~6, fence 1, trees 2, hills 1, sky 1, scatter 3 = ~15 for
 * the whole map.
 */

// --- Small helpers ----------------------------------------------------------------------

function noise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash(xi, zi)
  const b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1)
  const d = hash(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.3, z * 2.3) * 0.3 + noise(x * 5.1, z * 5.1) * 0.1

/**
 * How a battlefield looks: ground colours, mud and road paint, hills, trees and fence.
 * A map overrides any of these with `map.theme` (Training Grounds uses the defaults).
 * `tree`: 'pine' | 'snowpine' | 'palm' | 'dead' | 'cactus'.
 */
const DEFAULT_THEME = {
  grassA: '#6c8c43',
  grassB: '#8aa04f',
  dry: '#a19c5e',
  outside: '#5c7a3a',
  mud: [92, 72, 50],
  road: [140, 111, 74],
  rut: [95, 72, 46],
  ice: [214, 232, 240],
  hillNear: '#56703a',
  hillFar: '#7f9a88',
  tree: 'pine',
  trunk: '#5a3f28',
  fence: '#7a5a3a',
  /** Hill tops (snow on the cold maps). */
  peak: '#86a35e',
  /** Ground details (Scatter.jsx): meadow | desert | snow | beach | ruins. */
  scatter: 'meadow',
  /** Cloud cover 0-1, and their colour. */
  clouds: 0.42,
  cloudColor: '#ffffff',
  /** Contact shadows painted under cover, [r, g, b]. */
  ao: [34, 30, 18],
  /** Sun colour / strength, and the sky and ground light. */
  sun: '#fff3dc',
  sunIntensity: 2.1,
  skyLight: '#dfeeff',
  groundLight: '#6a6040',
  ambient: 1.25,
}
const themeOf = (map) => ({ ...DEFAULT_THEME, ...(map.theme || {}) })



const GROUND_W = 340
const GROUND_D = 260

/**
 * Paints the ground colours (grass, dry patches, roads, mud) into a 512 px canvas
 * texture. Cheap to make: the grass noise is computed at 128 px and scaled up, roads
 * and mud are drawn as soft canvas strokes. A tiling grain texture is multiplied on
 * top in the shader for close-up detail.
 */
function paintGround(map, S = 512) {
  const N = 128
  const small = document.createElement('canvas')
  small.width = N
  small.height = N
  const sctx = small.getContext('2d')
  const img = sctx.createImageData(N, N)
  const theme = themeOf(map)
  const grassA = col(theme.grassA)
  const grassB = col(theme.grassB)
  const dry = col(theme.dry)
  const outside = col(theme.outside)
  const [mr0, mg0, mb0] = theme.mud
  const [rr0, rg0, rb0] = theme.road
  const [ur0, ug0, ub0] = theme.rut
  const tmp = new Color()
  const hx = map.width / 2
  const hz = map.depth / 2
  for (let py = 0; py < N; py += 1) {
    for (let px = 0; px < N; px += 1) {
      const x = ((px + 0.5) / N - 0.5) * GROUND_W
      const z = ((py + 0.5) / N - 0.5) * GROUND_D
      tmp.copy(grassA).lerp(grassB, fbm(x * 0.06, z * 0.06))
      if (fbm(x * 0.02 + 9, z * 0.02) > 0.62) tmp.lerp(dry, 0.5)
      // Finer light-and-dark patches, so the field isn't one flat colour up close.
      tmp.multiplyScalar(0.9 + noise(x * 0.32 + 3, z * 0.32) * 0.2)
      const out = Math.max(Math.abs(x) - hx - 6, Math.abs(z) - hz - 6, 0)
      if (out > 0) tmp.lerp(outside, Math.min(1, out / 12))
      // Canvas pixels are sRGB.
      tmp.convertLinearToSRGB()
      const i = (py * N + px) * 4
      img.data[i] = tmp.r * 255
      img.data[i + 1] = tmp.g * 255
      img.data[i + 2] = tmp.b * 255
      img.data[i + 3] = 255
    }
  }
  sctx.putImageData(img, 0, 0)
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small, 0, 0, S, S)
  const kx = S / GROUND_W
  const kz = S / GROUND_D
  const toX = (x) => (x + GROUND_W / 2) * kx
  const toY = (z) => (z + GROUND_D / 2) * kz
  // Mud first, roads over it.
  for (const [mx, mz, mr] of map.mud) {
    const g = ctx.createRadialGradient(toX(mx), toY(mz), 0, toX(mx), toY(mz), mr * kx)
    g.addColorStop(0, `rgba(${mr0},${mg0},${mb0},0.6)`)
    g.addColorStop(0.65, `rgba(${mr0 + 6},${mg0 + 6},${mb0 + 4},0.35)`)
    g.addColorStop(1, `rgba(${mr0 + 6},${mg0 + 6},${mb0 + 4},0)`)
    ctx.fillStyle = g
    ctx.fillRect(toX(mx - mr), toY(mz - mr), mr * 2 * kx, mr * 2 * kz)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Frozen creeks: pale, glassy bands under the roads.
  const [ir, ig, ib] = theme.ice
  for (const r of map.ice || []) {
    for (const [w, a] of [
      [r.width * 2 + 2.5, 0.4],
      [r.width * 2, 0.9],
    ]) {
      ctx.strokeStyle = `rgba(${ir},${ig},${ib},${a})`
      ctx.lineWidth = w * kx
      ctx.beginPath()
      r.points.forEach(([x, z], i) => (i ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z))))
      ctx.stroke()
    }
  }
  for (const r of map.roads) {
    for (const [w, a] of [
      [r.width * 2 + 3, 0.35],
      [r.width * 2, 0.85],
    ]) {
      ctx.strokeStyle = `rgba(${rr0},${rg0},${rb0},${a})`
      ctx.lineWidth = w * kx
      ctx.beginPath()
      r.points.forEach(([x, z], i) => (i ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z))))
      ctx.stroke()
    }
    // Wheel ruts.
    ctx.strokeStyle = `rgba(${ur0},${ug0},${ub0},0.35)`
    ctx.lineWidth = 0.5 * kx
    for (const off of [-0.9, 0.9]) {
      ctx.beginPath()
      r.points.forEach(([x, z], i) => {
        const [nx, nz] = i < r.points.length - 1 ? r.points[i + 1] : r.points[i - 1]
        const dx = nx - x
        const dz = nz - z
        const l = Math.hypot(dx, dz) || 1
        const ox = (-dz / l) * off * (i < r.points.length - 1 ? 1 : -1)
        const oz = (dx / l) * off * (i < r.points.length - 1 ? 1 : -1)
        if (i) ctx.lineTo(toX(x + ox), toY(z + oz))
        else ctx.moveTo(toX(x + ox), toY(z + oz))
      })
      ctx.stroke()
    }
  }
  // Contact shadows: a soft darkening round the foot of every wall, crate and rock (the
  // only shadows on the presets without realtime ones, and it grounds them all).
  const [ar, ag, ab] = theme.ao
  for (const o of mapObstacles(map)) {
    const lift = Math.min(1, o.h / 2.6) * 0.6 + 0.4
    if (o.kind === 'tree') {
      const g = ctx.createRadialGradient(toX(o.x), toY(o.z), 0, toX(o.x), toY(o.z), 2.4 * kx)
      g.addColorStop(0, `rgba(${ar},${ag},${ab},0.32)`)
      g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
      ctx.fillStyle = g
      ctx.fillRect(toX(o.x - 2.4), toY(o.z - 2.4), 4.8 * kx, 4.8 * kz)
      continue
    }
    for (const [pad, a] of [
      [1.7, 0.05],
      [1.0, 0.07],
      [0.45, 0.1],
    ]) {
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${a * lift})`
      ctx.fillRect(toX(o.x - o.w / 2 - pad), toY(o.z - o.d / 2 - pad), (o.w + pad * 2) * kx, (o.d + pad * 2) * kz)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

function buildGround(map) {
  const g = new PlaneGeometry(GROUND_W, GROUND_D, 56, 42).rotateX(-Math.PI / 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i)
    const z = p.getZ(i)
    // Rolling ground outside the fence; the battlefield itself is flat.
    const out = Math.max(Math.abs(x) - map.width / 2 - 7, Math.abs(z) - map.depth / 2 - 7, 0)
    if (out > 0) p.setY(i, Math.min(1, out / 25) * (fbm(x * 0.03, z * 0.03) * 7 - 1.5))
    // A beach: past the shoreline the ground slopes away under the water.
    if (map.sea && z < map.sea.z) p.setY(i, Math.max(-2.5, (z - map.sea.z) * 0.25))
  }
  g.computeVertexNormals()
  return g
}

/** Ground material: the painted colour map times a tiling grain for close-up detail. */
function groundMaterial(colorMap, detail) {
  const m = new MeshLambertMaterial({ map: colorMap })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail }
    shader.uniforms.detailRepeat = { value: new Vector2(GROUND_W / 7, GROUND_D / 7) }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform sampler2D detailMap;
uniform vec2 detailRepeat;
void main() {`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  diffuseColor.rgb *= texture2D(detailMap, vMapUv * detailRepeat).rgb * 1.12;`,
      )
  }
  m.customProgramCacheKey = () => 'ff-ground-detail'
  return m
}

function buildFence(map) {
  const b = new BoxBatch()
  const hx = map.width / 2
  const hz = map.depth / 2
  const c = col(themeOf(map).fence)
  const post = (x, z) => b.box(x, 0.55, z, 0.14, 1.1, 0.14, c, 0)
  for (let x = -hx; x <= hx + 0.01; x += 5) {
    post(x, -hz)
    post(x, hz)
  }
  for (let z = -hz + 5; z < hz - 0.01; z += 5) {
    post(-hx, z)
    post(hx, z)
  }
  for (const y of [0.45, 0.95]) {
    b.box(0, y, -hz, hx * 2, 0.08, 0.06, c, 0)
    b.box(0, y, hz, hx * 2, 0.08, 0.06, c, 0)
    b.box(-hx, y, 0, 0.06, 0.08, hz * 2, c, 0)
    b.box(hx, y, 0, 0.06, 0.08, hz * 2, c, 0)
  }
  return b.build()
}

/**
 * The hills round the battlefield, then a taller, hazier range behind them - one mesh.
 * Ridged noise gives them crests; colour runs from the valleys up to `peak` (snow on
 * the cold maps) and fades towards the fog with distance.
 */
function buildHills(radius0, radius1, scale = 1, theme = DEFAULT_THEME, seaZ = null, haze = '#c9d9df', viewDistance = 430) {
  const seg = 128
  const pos = []
  const colors = []
  const idx = []
  const near = col(theme.hillNear)
  const far = col(theme.hillFar)
  const peak = col(theme.peak)
  const mist = col(haze)
  const c = new Color()
  const ridge = (x, z) => 1 - Math.abs(fbm(x, z) * 2 - 1)
  // [radius, height scale, haze 0-1] per ring: the near hills, then the far range.
  const ringsSpec = []
  for (let r = 0; r <= 5; r += 1) ringsSpec.push({ rad: radius0 + (radius1 - radius0) * (r / 5), t: r / 5, range: 0 })
  // The far range only where the camera can see that far (from anywhere on the field,
  // ~90 m off centre): past the far plane it would be cut into a strip across the sky.
  const farEdge = Math.min(radius1 * 1.32, viewDistance - 95)
  if (farEdge > radius1 + 25) for (let r = 1; r <= 3; r += 1) ringsSpec.push({ rad: radius1 + (farEdge - radius1) * (r / 3), t: r / 3, range: 1 })
  ringsSpec.forEach((ring, ri) => {
    for (let sIdx = 0; sIdx <= seg; sIdx += 1) {
      const a = (sIdx / seg) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = ca * ring.rad
      const z = sa * ring.rad * 0.8
      let h
      if (ring.range === 0) {
        const env = ri === 0 ? 0 : Math.sin(ring.t * Math.PI * 0.85)
        h = (fbm(ca * 3 + 5, sa * 3 + ri * 0.7) * 22 + ridge(ca * 5 + 2, sa * 5 + ri * 0.4) * 12 + 5) * env * scale
      } else {
        // The far range: big ridges, rising then holding.
        // The far range: broad, smooth ridges (no saw-teeth at this distance).
        const env = Math.min(1, ring.t * 1.6)
        h = (noise(ca * 2.2 + 11, sa * 2.2 - 3) * 30 + noise(ca * 4.5, sa * 4.5 + 2) * 12 + 18) * env * scale
      }
      if (seaZ !== null && z < seaZ) h = -6
      pos.push(x, h - 2, z)
      // Valley to peak, then haze with distance.
      const top = ring.range === 0 ? 34 * scale : 60 * scale
      const lift = Math.max(0, Math.min(1, h / top))
      if (ring.range === 0) {
        c.copy(near).lerp(far, ring.t * 0.6)
        c.multiplyScalar(0.9 + lift * 0.22)
        if (lift > 0.62) c.lerp(peak, Math.min(1, (lift - 0.62) / 0.2))
        c.lerp(mist, ring.t * 0.22)
      } else {
        // Far away: a soft silhouette, mostly sky-haze, snow-capped where the map has snow.
        c.copy(far).lerp(peak, lift * 0.35)
        c.lerp(mist, 0.55 + ring.t * 0.2)
      }
      colors.push(c.r, c.g, c.b)
    }
  })
  for (let r = 0; r < ringsSpec.length - 1; r += 1) {
    for (let sIdx = 0; sIdx < seg; sIdx += 1) {
      const a = r * (seg + 1) + sIdx
      const b = a + seg + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Crown (and trunk) for the map's tree style. */
function treeGeometries(kind, trunkHex) {
  const tint = (g, c) => {
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    return g
  }
  const mergeAll = (parts) => {
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
    for (const p of parts) p.dispose()
    return g
  }
  if (kind === 'snowpine') {
    const parts = []
    for (let k = 0; k < 3; k += 1) {
      parts.push(tint(new ConeGeometry(1.8 - k * 0.42, 2.6 - k * 0.3, 7).translate(0, 2.8 + k * 1.15, 0), col('#2d5a36')))
      parts.push(tint(new ConeGeometry(1.15 - k * 0.3, 0.9, 7).translate(0, 3.5 + k * 1.15, 0), col('#eef3f6')))
    }
    return { crown: mergeAll(parts), trunk: new CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), trunkHex }
  }
  if (kind === 'palm') {
    const parts = []
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2
      const leaf = new BoxGeometry(0.5, 0.06, 2.6).translate(0, 0, 1.2).rotateX(0.35).rotateY(a).translate(0.5, 5.8, 0)
      parts.push(tint(leaf, col(k % 2 ? '#4f8a3a' : '#5d9a42')))
    }
    return { crown: mergeAll(parts), trunk: new CylinderGeometry(0.16, 0.24, 6, 6).translate(0, 3, 0).rotateZ(-0.08), trunkHex: '#8a6a44' }
  }
  if (kind === 'dead') {
    const parts = []
    for (let k = 0; k < 4; k += 1) {
      const a = k * 1.7
      parts.push(tint(new CylinderGeometry(0.05, 0.1, 1.8, 5).translate(0, 0.9, 0).rotateZ(0.9).rotateY(a).translate(0, 3 + k * 0.35, 0), col('#5a4a3a')))
    }
    return { crown: mergeAll(parts), trunk: new CylinderGeometry(0.16, 0.3, 4.6, 6).translate(0, 2.3, 0), trunkHex: '#5a4a3a' }
  }
  if (kind === 'cactus') {
    const g = col('#4f7d3a')
    const parts = [
      tint(new CylinderGeometry(0.18, 0.18, 1.0, 6).translate(0.55, 1.6, 0), g),
      tint(new CylinderGeometry(0.18, 0.18, 0.5, 6).rotateZ(Math.PI / 2).translate(0.32, 1.2, 0), g),
      tint(new CylinderGeometry(0.16, 0.16, 0.8, 6).translate(-0.5, 2.0, 0), g),
      tint(new CylinderGeometry(0.16, 0.16, 0.4, 6).rotateZ(Math.PI / 2).translate(-0.3, 1.65, 0), g),
    ]
    return { crown: mergeAll(parts), trunk: new CylinderGeometry(0.3, 0.34, 2.8, 8).translate(0, 1.4, 0), trunkHex: '#4f7d3a' }
  }
  return { crown: pineGeometry(), trunk: new CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), trunkHex }
}

function pineGeometry() {
  const tint = (g, c) => {
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    return g
  }
  const parts = [
    tint(new ConeGeometry(1.8, 2.8, 7).translate(0, 2.8, 0), col('#3e6b34')),
    tint(new ConeGeometry(1.4, 2.4, 7).translate(0, 4.0, 0), col('#4a7a3a')),
    tint(new ConeGeometry(0.95, 2.0, 7).translate(0, 5.1, 0), col('#568845')),
  ]
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

// --- Sea ------------------------------------------------------------------------------

/** The sea's clock (one battle at a time; a number in a uniform, nothing allocated). */
const seaClock = { value: 0 }

/**
 * The sea: turquoise over the shallows, deep blue further out, lines of foam rolling in
 * to the beach and a glitter of sun on the swell. One lit material (fog and all).
 */
function seaMaterial(shoreZ) {
  const m = new MeshLambertMaterial({ color: '#2d6fc4' })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShore = { value: shoreZ }
    shader.uniforms.uTime = seaClock
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `varying vec3 vSeaPos;
void main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float uShore;
uniform float uTime;
varying vec3 vSeaPos;
void main() {`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float off = uShore - vSeaPos.z;
  vec3 water = mix(vec3(0.16, 0.62, 0.66), vec3(0.06, 0.24, 0.56), smoothstep(2.0, 48.0, off));
  float roll = smoothstep(0.9, 1.0, sin(off * 1.25 + uTime * 1.5 + sin(vSeaPos.x * 0.05) * 2.0)) * (1.0 - smoothstep(2.0, 12.0, off));
  float shore = 1.0 - smoothstep(1.3, 2.9, off);
  float foam = max(roll * 0.75, shore);
  diffuseColor.rgb = mix(water, vec3(0.93, 0.97, 1.0), foam);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float glint = sin(vSeaPos.x * 0.8 + uTime * 1.2) * sin(vSeaPos.z * 1.1 - uTime * 0.9) * sin((vSeaPos.x + vSeaPos.z) * 0.37 + uTime * 0.6);
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.88) * pow(max(0.0, glint), 18.0) * 0.6 * (1.0 - foam);`,
      )
  }
  m.customProgramCacheKey = () => 'ff-sea'
  return m
}

// --- Sky ------------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uCloudColor;
  uniform float uClouds;
  uniform float uTime;
  varying vec3 vDir;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uGround, min(1.0, -h * 4.0));
    float s = max(0.0, dot(d, uSun));
    c += vec3(1.0, 0.9, 0.7) * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.18);
    if (uClouds > 0.0 && h > 0.0) {
      // Clouds on a flat layer overhead, drifting; thinned towards the horizon.
      vec2 uv = d.xz / (h + 0.12) * 1.7 + vec2(uTime * 0.014, uTime * 0.005);
      float n = vn(uv) * 0.55 + vn(uv * 2.1 + 3.1) * 0.28 + vn(uv * 4.3 + 7.7) * 0.17;
      float edge = 1.0 - uClouds * 0.62;
      float cl = smoothstep(edge, edge + 0.2, n) * smoothstep(0.02, 0.2, h);
      vec3 cc = mix(uCloudColor * 0.78, uCloudColor, smoothstep(edge, edge + 0.35, n));
      cc += vec3(1.0, 0.92, 0.8) * pow(s, 8.0) * 0.25;
      c = mix(c, cc, cl * 0.94);
    }
    gl_FragColor = vec4(c, 1.0);
  }
`

const SUN_DIR = new Vector3(0.45, 0.78, 0.35).normalize()

function Sky({ map, radius }) {
  const ref = useRef(null)
  const wind = useQuality((s) => s.settings.wind)
  const theme = themeOf(map)
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uTop: { value: new Color(map.sky.top) },
          uHorizon: { value: new Color(map.sky.horizon) },
          uGround: { value: new Color(map.sky.ground) },
          uSun: { value: SUN_DIR.clone() },
          // No clouds on LOW (it's the priciest pixel shader on the screen).
          uClouds: { value: wind ? theme.clouds : 0 },
          uCloudColor: { value: new Color(theme.cloudColor) },
          uTime: { value: 0 },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [map, wind, theme.clouds, theme.cloudColor],
  )
  const geo = useMemo(() => new SphereGeometry(radius, 24, 12), [radius])
  useEffect(
    () => () => {
      mat.dispose()
      geo.dispose()
    },
    [mat, geo],
  )
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const sky = ref.current
        if (!sky) return
        sky.position.copy(state.camera.position)
        sky.material.uniforms.uTime.value = state.clock.elapsedTime
      }),
    [],
  )
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
}

// --- Lights ---------------------------------------------------------------------------

/** `focus()` returns { tx, tz, dist }: where the shadow box should centre and how big. */
function Lights({ focus, theme }) {
  const sun = useRef(null)
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const mapSize = useQuality((s) => s.settings.shadowMapSize)
  useEffect(
    () =>
      addFrameHook(PHASE.CAMERA, () => {
        const l = sun.current
        if (!l) return
        const v = focus()
        // Keep the shadow box centred where the camera looks.
        l.position.set(v.tx + SUN_DIR.x * 120, SUN_DIR.y * 120, v.tz + SUN_DIR.z * 120)
        l.target.position.set(v.tx, 0, v.tz)
        l.target.updateMatrixWorld()
        if (l.shadow && shadows) {
          const half = Math.min(90, Math.max(30, v.dist * 0.9))
          const cam = l.shadow.camera
          if (cam.right !== half) {
            cam.left = -half
            cam.right = half
            cam.top = half
            cam.bottom = -half
            cam.updateProjectionMatrix()
          }
        }
      }),
    [shadows, focus],
  )
  return (
    <>
      <hemisphereLight args={[theme.skyLight, theme.groundLight, theme.ambient]} />
      <directionalLight
        ref={sun}
        color={theme.sun}
        intensity={theme.sunIntensity}
        castShadow={shadows}
        shadow-mapSize-width={mapSize || 512}
        shadow-mapSize-height={mapSize || 512}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-camera-near={10}
        shadow-camera-far={260}
      />
    </>
  )
}

// --- Map ------------------------------------------------------------------------------

const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()
const up = new Vector3(0, 1, 0)

/**
 * @param {{ map: object, focus: () => { tx: number, tz: number, dist: number } }} props
 *   `focus` tells the sun where to centre its shadow box (the camera's focus).
 */
export default function MapView({ map, focus }) {
  // `terrain: false` (the lobby's Sea Fort): no ground, hills, fence or trees - just the
  // sky, the sun and the props; the scene draws its own floor.
  const terrain = map.terrain !== false
  const decor = useQuality((s) => s.settings.decorDensity)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const wind = useQuality((s) => s.settings.wind)
  const theme = themeOf(map)

  const world = useMemo(() => {
    const tex = getTextures()
    tex.grass.repeat.set(1, 1)
    const ground = terrain ? buildGround(map) : null
    // Sharper roads and mud on the presets with bigger textures.
    const groundMap = terrain ? paintGround(map, maxTexture >= 1024 ? 1024 : 512) : null
    // The map's cover plus its scenery pieces (the classic kinds through the cover
    // renderer, the rest as one merged mesh).
    const pieces = mapPieces(map)
    const cover = buildCover({ obstacles: [...map.obstacles, ...coverBoxesOf(pieces)] })
    const piecesGeo = pieces.length ? buildPiecesGeometry(pieces) : null
    const fence = terrain ? buildFence(map) : null
    const hills = terrain ? buildHills(...(map.hills || [165, 260]), map.hillScale ?? 1, themeOf(map), map.sea ? map.sea.z : null, map.fog, viewDistance) : null
    const sea = terrain && map.sea ? new PlaneGeometry(1200, 600).rotateX(-Math.PI / 2).translate(0, -0.35, map.sea.z - 300) : null
    const mats = {
      ground: groundMap ? groundMaterial(groundMap, tex.grass) : null,
      concrete: new MeshLambertMaterial({ vertexColors: true, map: tex.concrete }),
      bags: new MeshLambertMaterial({ vertexColors: true, map: tex.sandbags }),
      crates: new MeshLambertMaterial({ vertexColors: true, map: tex.crate }),
      steel: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
      wood: new MeshLambertMaterial({ vertexColors: true, map: tex.planks }),
      roof: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
      plain: new MeshLambertMaterial({ vertexColors: true }),
      // Both sides: from inside the ring the far slopes face away and would leave gaps.
      hills: new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
      sea: map.sea ? seaMaterial(map.sea.z) : null,
    }
    return { ground, groundMap, cover, piecesGeo, fence, hills, sea, mats }
  }, [map, terrain, maxTexture, viewDistance])

  // The sea rolls (MEDIUM and HIGH; on LOW it holds still).
  useEffect(() => {
    if (!map.sea || !wind) return undefined
    return addFrameHook(PHASE.DRAW, (state) => {
      seaClock.value = state.clock.elapsedTime
    })
  }, [map, wind])

  // Trees: scenery outside the fence (thinned by the preset) plus the few inside.
  const trees = useMemo(() => {
    const outside = terrain ? map.trees.filter((_, i) => (i * 0.618) % 1 < decor) : []
    const inside = map.obstacles.filter((o) => o.kind === 'tree').map((o) => ({ x: o.x, z: o.z, s: 0.9, r: 0 }))
    const all = [...outside, ...inside]
    const theme = themeOf(map)
    const treeGeo = treeGeometries(theme.tree, theme.trunk)
    const trunkGeo = treeGeo.trunk
    const crownGeo = treeGeo.crown
    const trunkMat = new MeshLambertMaterial({ color: treeGeo.trunkHex })
    const crownMat = new MeshLambertMaterial({ vertexColors: true })
    const trunks = new InstancedMesh(trunkGeo, trunkMat, all.length)
    const crowns = new InstancedMesh(crownGeo, crownMat, all.length)
    crowns.instanceColor = new InstancedBufferAttribute(new Float32Array(all.length * 3), 3)
    const c = new Color()
    all.forEach((t, i) => {
      q4.setFromAxisAngle(up, t.r)
      p3.set(t.x, 0, t.z)
      s3.set(t.s, t.s * (0.9 + hash(t.x, t.z) * 0.4), t.s)
      m4.compose(p3, q4, s3)
      trunks.setMatrixAt(i, m4)
      crowns.setMatrixAt(i, m4)
      c.setScalar(0.85 + hash(t.z, t.x) * 0.3)
      crowns.setColorAt(i, c)
    })
    trunks.instanceMatrix.setUsage(DynamicDrawUsage)
    trunks.computeBoundingSphere()
    crowns.computeBoundingSphere()
    return { trunks, crowns, trunkGeo, crownGeo, trunkMat, crownMat }
  }, [map, decor, terrain])

  useEffect(
    () => () => {
      world.ground?.dispose()
      world.groundMap?.dispose()
      for (const g of Object.values(world.cover)) g?.dispose()
      world.fence?.dispose()
      world.hills?.dispose()
      world.piecesGeo?.dispose()
      world.sea?.dispose()
      for (const m of Object.values(world.mats)) m?.dispose()
    },
    [world],
  )
  useEffect(
    () => () => {
      trees.trunkGeo.dispose()
      trees.crownGeo.dispose()
      trees.trunkMat.dispose()
      trees.crownMat.dispose()
    },
    [trees],
  )

  const { cover, mats } = world
  return (
    <group>
      <Sky map={map} radius={Math.min(600, viewDistance * 0.92)} />
      <Lights focus={focus} theme={theme} />
      {world.ground && <mesh geometry={world.ground} material={mats.ground} receiveShadow={shadows} />}
      {world.hills && <mesh geometry={world.hills} material={mats.hills} />}
      {world.sea && <mesh geometry={world.sea} material={mats.sea} />}

      {world.piecesGeo && <mesh geometry={world.piecesGeo} material={mats.plain} castShadow={shadows} receiveShadow={shadows} />}
      <mesh geometry={cover.concrete} material={mats.concrete} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.bags} material={mats.bags} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.crates} material={mats.crates} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.steel} material={mats.steel} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.wood} material={mats.wood} castShadow={shadows} receiveShadow={shadows} />
      {cover.roofs && <mesh geometry={cover.roofs} material={mats.roof} castShadow={shadows} />}
      {world.fence && <mesh geometry={world.fence} material={mats.plain} />}
      {trees.trunks.count > 0 && <primitive object={trees.trunks} castShadow={shadows} />}
      {trees.crowns.count > 0 && <primitive object={trees.crowns} castShadow={shadows} />}
      {terrain && <Scatter map={map} />}
    </group>
  )
}
