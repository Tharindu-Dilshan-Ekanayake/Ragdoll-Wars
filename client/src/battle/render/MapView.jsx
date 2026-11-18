import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
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
import { getTextures } from './textures'

/**
 * The battlefield: ground (a painted colour map of roads and mud times a grain texture), every
 * cover box merged into one static mesh per material, trees and a fence as scenery, a
 * ring of distant hills, the sky and the sun.
 *
 * Draw calls: ground 1, cover ~6, fence 1, trees 2, hills 1, sky 1 = ~12 for the whole map.
 */

// --- Small helpers ----------------------------------------------------------------------

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}
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

const col = (hex) => new Color(hex)

/** Accumulates textured, vertex-coloured boxes into one geometry. */
class BoxBatch {
  constructor() {
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = []
    this.idx = []
  }

  /**
   * Box centred at (cx, cy, cz) with size (w, h, d). `uvScale` metres per texture
   * repeat, or 0 to map each face once (crates).
   */
  box(cx, cy, cz, w, h, d, color, uvScale = 2) {
    const hw = w / 2
    const hh = h / 2
    const hd = d / 2
    // [normal, u axis, v axis, u size, v size]
    const faces = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], d, h],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], d, h],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], w, d],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], w, d],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], w, h],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], w, h],
    ]
    for (const [n, u, v, us, vs] of faces) {
      const base = this.pos.length / 3
      const ox = cx + n[0] * hw
      const oy = cy + n[1] * hh
      const oz = cz + n[2] * hd
      const uh = [u[0] * hw, u[1] * hh, u[2] * hd]
      const vh = [v[0] * hw, v[1] * hh, v[2] * hd]
      const ur = uvScale ? us / uvScale : 1
      const vr = uvScale ? vs / uvScale : 1
      const corners = [
        [-1, -1, 0, 0],
        [1, -1, ur, 0],
        [1, 1, ur, vr],
        [-1, 1, 0, vr],
      ]
      for (const [a, b, tu, tv] of corners) {
        this.pos.push(ox + uh[0] * a + vh[0] * b, oy + uh[1] * a + vh[1] * b, oz + uh[2] * a + vh[2] * b)
        this.nor.push(n[0], n[1], n[2])
        this.uv.push(tu, tv)
        // Bottom edges a touch darker: cheap contact shading.
        const k = n[1] === 0 && b < 0 ? 0.78 : 1
        this.col.push(color.r * k, color.g * k, color.b * k)
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  build() {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

const CONTAINER_TINTS = ['#a8462f', '#3f6b4a', '#2f5f8f', '#c08a2e']

/** A pitched roof over a w x d footprint, ridge along the longer side. */
function roofGeometry(cx, cy, cz, w, d, rise, color) {
  const alongX = w >= d
  const L = (alongX ? w : d) / 2 + 0.3
  const S = (alongX ? d : w) / 2 + 0.4
  // Vertices in (along, up, side) then mapped.
  const map = (a, y, s) => (alongX ? [cx + a, cy + y, cz + s] : [cx + s, cy + y, cz + a])
  const quads = [
    [map(-L, 0, -S), map(L, 0, -S), map(L, rise, 0), map(-L, rise, 0)],
    [map(L, 0, S), map(-L, 0, S), map(-L, rise, 0), map(L, rise, 0)],
  ]
  const tris = [
    [map(-L, 0, S), map(-L, 0, -S), map(-L, rise, 0)],
    [map(L, 0, -S), map(L, 0, S), map(L, rise, 0)],
  ]
  const pos = []
  const uv = []
  const c = []
  for (const q of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...q[i])
      uv.push(i === 1 || i === 2 ? (L * 2) / 1.6 : 0, i >= 2 ? 1 : 0)
      c.push(color.r, color.g, color.b)
    }
  }
  for (const t of tris) {
    for (const p of t) {
      pos.push(...p)
      uv.push(0, 0)
      c.push(color.r * 0.8, color.g * 0.8, color.b * 0.8)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new Float32BufferAttribute(c, 3))
  g.computeVertexNormals()
  return g
}

function buildCover(map) {
  const concrete = new BoxBatch()
  const bags = new BoxBatch()
  const crates = new BoxBatch()
  const steel = new BoxBatch()
  const wood = new BoxBatch()
  const roofs = []
  for (const o of map.obstacles) {
    const v = 0.92 + hash(o.x, o.z) * 0.16
    if (o.kind === 'barrier') {
      // Jersey barrier: wide foot, narrow top, a hazard band.
      const c = col('#c9c6bd').multiplyScalar(v)
      const narrowX = o.w < o.d
      concrete.box(o.x, 0.22, o.z, o.w, 0.44, o.d, c)
      concrete.box(o.x, 0.44 + (o.h - 0.44) / 2, o.z, narrowX ? o.w * 0.55 : o.w, o.h - 0.44, narrowX ? o.d : o.d * 0.55, c)
      concrete.box(o.x, o.h - 0.12, o.z, narrowX ? o.w * 0.57 : o.w + 0.02, 0.1, narrowX ? o.d + 0.02 : o.d * 0.57, col('#d9a63a'))
    } else if (o.kind === 'lowwall' || o.kind === 'wall') {
      const c = col(o.kind === 'wall' ? '#a9a59b' : '#b8b3a8').multiplyScalar(v)
      concrete.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c)
      if (o.kind === 'wall') {
        // Broken top: a few chunks.
        const along = o.w > o.d
        const len = along ? o.w : o.d
        for (let k = 0; k < 3; k += 1) {
          const t = (hash(o.x + k, o.z - k) - 0.5) * len * 0.8
          const ch = 0.15 + hash(o.z + k, o.x) * 0.3
          concrete.box(o.x + (along ? t : 0), o.h + ch / 2, o.z + (along ? 0 : t), along ? 0.6 + hash(k, o.x) : o.w, ch, along ? o.d : 0.6 + hash(k, o.z), c)
        }
      }
    } else if (o.kind === 'sandbag') {
      const c = col('#ffffff').multiplyScalar(v)
      // Texture: 2 bags (1.2 m) across, 4 rows (0.96 m) up.
      const along = o.w > o.d
      const len = along ? o.w : o.d
      const thick = along ? o.d : o.w
      const b = bags
      const start = b.uv.length
      b.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 0)
      // Rescale this box's UVs: sides by length/1.2 x height/0.96, top by length x thickness.
      for (let k = 0; k < 24; k += 1) {
        const face = Math.floor(k / 4)
        const i = start + k * 2
        const isTop = face === 2 || face === 3
        const sideAlong = along ? face >= 4 : face <= 1
        if (isTop) {
          b.uv[i] *= (along ? len : thick) / 1.2
          b.uv[i + 1] *= (along ? thick : len) / 0.6
        } else {
          b.uv[i] *= (sideAlong ? len : thick) / 1.2
          b.uv[i + 1] *= o.h / 0.96
        }
      }
    } else if (o.kind === 'crate') {
      const c = col('#ffffff').multiplyScalar(v)
      const stack = Math.max(1, Math.round(o.h / 1.25))
      for (let k = 0; k < stack; k += 1) crates.box(o.x, 0.625 + k * 1.25, o.z, o.w, 1.25, o.d, c, 0)
    } else if (o.kind === 'container') {
      const c = col(CONTAINER_TINTS[o.tint % CONTAINER_TINTS.length]).multiplyScalar(v)
      steel.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 1.4)
    } else if (o.kind === 'tent') {
      // Canvas tent: low walls and a steep roof.
      const c = col('#5f6b45').multiplyScalar(v)
      wood.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 1.6)
      const sideZ = o.z > 0 ? -1 : 1
      wood.box(o.x, 0.9, o.z + sideZ * (o.d / 2 + 0.03), Math.min(1.6, o.w * 0.3), 1.8, 0.08, col('#2a2b1f'), 0)
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, 2.1, col('#6d7a4e').multiplyScalar(v)))
    } else if (o.kind === 'post') {
      concrete.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, col(o.color || '#d9d6cf'), 0)
    } else if (o.kind === 'board') {
      // Notice board: two legs and a framed panel.
      const c = col('#8f6c48').multiplyScalar(v)
      const along = o.w >= o.d
      const half = (along ? o.w : o.d) / 2 - 0.15
      for (const sgn of [-1, 1]) wood.box(o.x + (along ? sgn * half : 0), o.h / 2, o.z + (along ? 0 : sgn * half), 0.18, o.h, 0.18, c, 0)
      wood.box(o.x, o.h - 0.85, o.z, along ? o.w : 0.12, 1.3, along ? 0.12 : o.d, c, 2)
    } else if (o.kind === 'shed') {
      const c = col('#8f6c48').multiplyScalar(v)
      wood.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 2.4)
      // Door and window on the side facing the middle of the map.
      const sideZ = o.z > 0 ? -1 : 1
      const dark = col('#2a221b')
      wood.box(o.x - o.w * 0.2, 1.05, o.z + sideZ * (o.d / 2 + 0.03), 1.1, 2.1, 0.08, dark, 0)
      wood.box(o.x + o.w * 0.22, 1.9, o.z + sideZ * (o.d / 2 + 0.03), 1.2, 0.8, 0.08, dark, 0)
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, 1.3, col('#5d6266')))
    }
  }
  const out = {
    concrete: concrete.build(),
    bags: bags.build(),
    crates: crates.build(),
    steel: steel.build(),
    wood: wood.build(),
    roofs: roofs.length ? mergeGeometries(roofs) : null,
  }
  for (const r of roofs) r.dispose()
  return out
}

const GROUND_W = 340
const GROUND_D = 260

/**
 * Paints the ground colours (grass, dry patches, roads, mud) into a 512 px canvas
 * texture. Cheap to make: the grass noise is computed at 128 px and scaled up, roads
 * and mud are drawn as soft canvas strokes. A tiling grain texture is multiplied on
 * top in the shader for close-up detail.
 */
function paintGround(map) {
  const S = 512
  const N = 128
  const small = document.createElement('canvas')
  small.width = N
  small.height = N
  const sctx = small.getContext('2d')
  const img = sctx.createImageData(N, N)
  const grassA = col('#6c8c43')
  const grassB = col('#8aa04f')
  const dry = col('#a19c5e')
  const outside = col('#5c7a3a')
  const tmp = new Color()
  const hx = map.width / 2
  const hz = map.depth / 2
  for (let py = 0; py < N; py += 1) {
    for (let px = 0; px < N; px += 1) {
      const x = ((px + 0.5) / N - 0.5) * GROUND_W
      const z = ((py + 0.5) / N - 0.5) * GROUND_D
      tmp.copy(grassA).lerp(grassB, fbm(x * 0.06, z * 0.06))
      if (fbm(x * 0.02 + 9, z * 0.02) > 0.62) tmp.lerp(dry, 0.5)
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
    g.addColorStop(0, 'rgba(92,72,50,0.6)')
    g.addColorStop(0.65, 'rgba(98,78,54,0.35)')
    g.addColorStop(1, 'rgba(98,78,54,0)')
    ctx.fillStyle = g
    ctx.fillRect(toX(mx - mr), toY(mz - mr), mr * 2 * kx, mr * 2 * kz)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const r of map.roads) {
    for (const [w, a] of [
      [r.width * 2 + 3, 0.35],
      [r.width * 2, 0.85],
    ]) {
      ctx.strokeStyle = `rgba(140,111,74,${a})`
      ctx.lineWidth = w * kx
      ctx.beginPath()
      r.points.forEach(([x, z], i) => (i ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z))))
      ctx.stroke()
    }
    // Wheel ruts.
    ctx.strokeStyle = 'rgba(95,72,46,0.35)'
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
  const c = col('#7a5a3a')
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

function buildHills(radius0, radius1, scale = 1) {
  const seg = 72
  const rings = 4
  const pos = []
  const colors = []
  const idx = []
  const near = col('#56703a')
  const far = col('#7f9a88')
  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings
    const rad = radius0 + (radius1 - radius0) * t
    for (let s = 0; s <= seg; s += 1) {
      const a = (s / seg) * Math.PI * 2
      const x = Math.cos(a) * rad
      const z = Math.sin(a) * rad * 0.8
      const h = r === 0 ? 0 : (fbm(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + r) * 26 + 6) * Math.sin(t * Math.PI * 0.85) * scale
      pos.push(x, h - 2, z)
      const c = near.clone().lerp(far, t)
      colors.push(c.r, c.g, c.b)
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < seg; s += 1) {
      const a = r * (seg + 1) + s
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
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uGround, min(1.0, -h * 4.0));
    float s = max(0.0, dot(normalize(vDir), uSun));
    c += vec3(1.0, 0.9, 0.7) * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.18);
    gl_FragColor = vec4(c, 1.0);
  }
`

const SUN_DIR = new Vector3(0.45, 0.78, 0.35).normalize()

function Sky({ map, radius }) {
  const ref = useRef(null)
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
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [map],
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
        if (ref.current) ref.current.position.copy(state.camera.position)
      }),
    [],
  )
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
}

// --- Lights ---------------------------------------------------------------------------

/** `focus()` returns { tx, tz, dist }: where the shadow box should centre and how big. */
function Lights({ focus }) {
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
      <hemisphereLight args={['#dfeeff', '#6a6040', 1.25]} />
      <directionalLight
        ref={sun}
        color="#fff3dc"
        intensity={2.1}
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

  const world = useMemo(() => {
    const tex = getTextures()
    tex.grass.repeat.set(1, 1)
    const ground = terrain ? buildGround(map) : null
    const groundMap = terrain ? paintGround(map) : null
    const cover = buildCover(map)
    const fence = terrain ? buildFence(map) : null
    const hills = terrain ? buildHills(...(map.hills || [165, 260]), map.hillScale ?? 1) : null
    const mats = {
      ground: groundMap ? groundMaterial(groundMap, tex.grass) : null,
      concrete: new MeshLambertMaterial({ vertexColors: true, map: tex.concrete }),
      bags: new MeshLambertMaterial({ vertexColors: true, map: tex.sandbags }),
      crates: new MeshLambertMaterial({ vertexColors: true, map: tex.crate }),
      steel: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
      wood: new MeshLambertMaterial({ vertexColors: true, map: tex.planks }),
      roof: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
      plain: new MeshLambertMaterial({ vertexColors: true }),
    }
    return { ground, groundMap, cover, fence, hills, mats }
  }, [map, terrain])

  // Trees: scenery outside the fence (thinned by the preset) plus the few inside.
  const trees = useMemo(() => {
    const outside = terrain ? map.trees.filter((_, i) => (i * 0.618) % 1 < decor) : []
    const inside = map.obstacles.filter((o) => o.kind === 'tree').map((o) => ({ x: o.x, z: o.z, s: 0.9, r: 0 }))
    const all = [...outside, ...inside]
    const trunkGeo = new CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0)
    const crownGeo = pineGeometry()
    const trunkMat = new MeshLambertMaterial({ color: '#5a3f28' })
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
      <Lights focus={focus} />
      {world.ground && <mesh geometry={world.ground} material={mats.ground} receiveShadow={shadows} />}
      {world.hills && <mesh geometry={world.hills} material={mats.plain} />}
      <mesh geometry={cover.concrete} material={mats.concrete} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.bags} material={mats.bags} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.crates} material={mats.crates} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.steel} material={mats.steel} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={cover.wood} material={mats.wood} castShadow={shadows} receiveShadow={shadows} />
      {cover.roofs && <mesh geometry={cover.roofs} material={mats.roof} castShadow={shadows} />}
      {world.fence && <mesh geometry={world.fence} material={mats.plain} />}
      {trees.trunks.count > 0 && <primitive object={trees.trunks} castShadow={shadows} />}
      {trees.crowns.count > 0 && <primitive object={trees.crowns} castShadow={shadows} />}
    </group>
  )
}
