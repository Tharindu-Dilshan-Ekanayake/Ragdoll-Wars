import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { useQuality } from '../../store/quality'
import { mapTerrain } from '../sim/ground'
import { helipadsOf, PAD_SIZE } from '../sim/helipads'
import { groundAt } from '../sim/terrain'
import { mapObstacles } from '../sim/pieces'
import { addFrameHook, PHASE } from '../state'
import { hash } from './coverGeometry'

/**
 * The little things on the ground that make a field look like a field from where you
 * stand: grass tufts, stones and bushes, and flowers - each kind one instanced mesh (3
 * draw calls in all), placed once per map in natural clumps, off the roads, the ice, the
 * mud's middle and the cover. How many follows the quality preset; on MEDIUM and HIGH
 * the grass and flowers sway in the wind (a few lines in the vertex shader).
 *
 * Every map picks a style (`map.theme.scatter`): meadow, desert, snow, beach, ruins.
 */

const STYLES = {
  meadow: {
    blades: { colors: ['#6f9440', '#7fa04a', '#8cab55', '#6a8c3c', '#93b35c'], height: [0.22, 0.44] },
    props: [
      { colors: ['#8d8d86', '#a3a29a', '#7c7b74'], scale: [0.14, 0.36], flat: 0.55, share: 0.55 },
      { colors: ['#4c7a30', '#5a8a38', '#467026'], scale: [0.45, 0.9], flat: 0.75, share: 0.45, lift: 0.25 },
    ],
    flowers: ['#ffffff', '#ffe25a', '#f6b6d0', '#c9b6ff', '#ffffff', '#ffe25a'],
  },
  desert: {
    blades: { colors: ['#c2ab6c', '#d2bc80', '#b39c5f', '#dccb92'], height: [0.2, 0.4] },
    props: [
      { colors: ['#b98f5f', '#a47a4c', '#c9a273', '#8f6c45'], scale: [0.15, 0.5], flat: 0.5, share: 0.7 },
      { colors: ['#8a8a4a', '#7d7f45', '#97955a'], scale: [0.3, 0.6], flat: 0.65, share: 0.3, lift: 0.15 },
    ],
    flowers: null,
    bladeShare: 0.45,
  },
  snow: {
    blades: { colors: ['#8a7d66', '#7c705c', '#9a8d74'], height: [0.18, 0.36] },
    props: [
      { colors: ['#f4f7f9', '#eaf0f4', '#ffffff'], scale: [0.4, 1.0], flat: 0.32, share: 0.6, lift: -0.06 },
      { colors: ['#7e858c', '#8f969c', '#6c7379'], scale: [0.15, 0.45], flat: 0.6, share: 0.4 },
    ],
    flowers: null,
    bladeShare: 0.35,
  },
  beach: {
    blades: { colors: ['#a9b86a', '#bcc479', '#98a85c', '#ccce86'], height: [0.3, 0.6] },
    props: [
      { colors: ['#fff6ea', '#f6d9cf', '#efe4d2'], scale: [0.08, 0.16], flat: 0.45, share: 0.5 },
      { colors: ['#8a6e4e', '#7a6144', '#9b7e5a'], scale: [0.2, 0.45], flat: 0.4, share: 0.25 },
      { colors: ['#6f8a48', '#7f9a52'], scale: [0.4, 0.75], flat: 0.7, share: 0.25, lift: 0.2 },
    ],
    flowers: ['#ffffff', '#f9e27c'],
    bladeShare: 0.75,
  },
  jungle: {
    blades: { colors: ['#2f6a2a', '#3a7a30', '#2a5c25', '#4a8a38', '#5a9a40'], height: [0.45, 1.05] },
    props: [
      { colors: ['#2f6428', '#3a7430', '#285a24'], scale: [0.6, 1.25], flat: 0.7, share: 0.7, lift: 0.25 },
      { colors: ['#6b6a5e', '#5a5e52'], scale: [0.25, 0.6], flat: 0.5, share: 0.3 },
    ],
    flowers: ['#ff5a3c', '#ffb02e', '#ff7ab8', '#ffffff'],
    bladeShare: 0.8,
  },
  scrap: {
    blades: { colors: ['#8a7a4e', '#7c6f46', '#9a8a58', '#6d6a44'], height: [0.22, 0.48] },
    props: [
      { colors: ['#8a4f2c', '#a0603a', '#6e3e24', '#7b5236'], scale: [0.15, 0.45], flat: 0.45, share: 0.55 },
      { colors: ['#6d6f70', '#58595a', '#7e7c76'], scale: [0.2, 0.5], flat: 0.55, share: 0.45 },
    ],
    flowers: null,
    bladeShare: 0.6,
  },
  marsh: {
    blades: { colors: ['#5a6440', '#4d5636', '#6b6a46', '#5f5a3e', '#45502f'], height: [0.35, 0.9] },
    props: [
      { colors: ['#5d605a', '#6b6d66', '#4f524c'], scale: [0.2, 0.55], flat: 0.55, share: 0.45 },
      { colors: ['#4a4636', '#3f4430', '#56503a'], scale: [0.5, 1.0], flat: 0.65, share: 0.55, lift: 0.2 },
    ],
    flowers: null,
    bladeShare: 1.1,
  },
  ruins: {
    blades: { colors: ['#7c8854', '#8a945c', '#6f7a4a'], height: [0.2, 0.4] },
    props: [
      { colors: ['#8c8a85', '#9d9a94', '#76746f'], scale: [0.15, 0.45], flat: 0.6, share: 0.6 },
      { colors: ['#8a4f3c', '#9a5d47', '#7a4535'], scale: [0.12, 0.3], flat: 0.7, share: 0.4 },
    ],
    flowers: ['#ffe25a', '#ffffff'],
    bladeShare: 0.55,
  },
}

// --- Geometry ----------------------------------------------------------------------------

/**
 * A tuft: three leaning blades, light at the tip and a little darker at the root. Each
 * blade is wound both ways with its normals straight up, so it's lit like the ground
 * from either side (a double-sided material would flip the back face's normal and turn
 * half the grass black).
 */
function tuftGeometry() {
  const pos = []
  const colors = []
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + 0.5
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    const px = -cz * 0.075
    const pz = cx * 0.075
    const lean = 0.16 + (k % 2) * 0.12
    const A = [cx * 0.03 - px, 0, cz * 0.03 - pz]
    const B = [cx * 0.03 + px, 0, cz * 0.03 + pz]
    const T = [cx * lean, 1, cz * lean]
    pos.push(...A, ...B, ...T, ...B, ...A, ...T)
    for (let f = 0; f < 2; f += 1) colors.push(0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1.12, 1.12, 1.12)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setAttribute('normal', new Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3))
  return g
}

/** A stone (or bush, or snow lump, or shell): a low-poly ball, shaded darker underneath. */
function propGeometry() {
  const g = new IcosahedronGeometry(0.5, 0)
  g.deleteAttribute('uv')
  const p = g.attributes.position
  const colors = []
  for (let i = 0; i < p.count; i += 1) {
    const s = 0.72 + (p.getY(i) + 0.5) * 0.4
    colors.push(s, s, s)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** A flower: a green stem and a little head on top (the head takes the instance colour). */
function flowerGeometry() {
  const stem = new BufferGeometry()
  // Both windings, normals up (see tuftGeometry).
  stem.setAttribute('position', new Float32BufferAttribute([-0.015, 0, 0, 0.015, 0, 0, 0, 0.8, 0, 0.015, 0, 0, -0.015, 0, 0, 0, 0.8, 0], 3))
  stem.setAttribute('normal', new Float32BufferAttribute(new Array(6).fill([0, 1, 0]).flat(), 3))
  stem.setAttribute('color', new Float32BufferAttribute(new Array(6).fill([0.32, 0.56, 0.26]).flat(), 3))
  const head = new OctahedronGeometry(0.11, 0).scale(1, 0.55, 1).translate(0, 0.82, 0)
  head.deleteAttribute('uv')
  head.setAttribute('color', new Float32BufferAttribute(new Array(head.attributes.position.count * 3).fill(1), 3))
  const g = mergeGeometries([stem, head])
  stem.dispose()
  head.dispose()
  return g
}

/** Sway in the wind: tips move, roots stay (geometry y runs 0 at the root to 1 at the tip). */
function windy(material, wind, clock) {
  if (!wind) return material
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = clock
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float uWind;\nvoid main() {').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
  #else
    float ph = 0.0;
  #endif
  float sway = sin(uWind * 1.6 + ph) * 0.6 + sin(uWind * 2.7 + ph * 1.9) * 0.3;
  float bend = position.y * position.y;
  transformed.x += sway * 0.16 * bend;
  transformed.z += sway * 0.07 * bend;`,
    )
  }
  material.customProgramCacheKey = () => 'ff-wind'
  return material
}

// --- Placement ---------------------------------------------------------------------------

function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function clumpNoise(x, z) {
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

function distToPolyline(x, z, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2))
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t)
    if (d < best) best = d
  }
  return best
}

/** A test for "can something small grow at (x, z)?" for this map. */
function groundTest(map) {
  const boxes = mapObstacles(map).filter((o) => o.kind !== 'tree')
  // The helipads stay bare.
  for (const p of helipadsOf(map)) boxes.push({ x: p.x, z: p.z, w: PAD_SIZE, d: PAD_SIZE })
  // Nothing grows on the floors of enterable buildings.
  for (const [kind, x, z, rot = 0, o = {}] of map.sets || []) {
    if (kind !== 'bldg') continue
    const w = o.w || 12
    const d = o.d || 8
    boxes.push({ x, z, w: rot & 1 ? d : w, d: rot & 1 ? w : d })
  }
  const roads = map.roads || []
  const trenches = map.terrain?.trenches || []
  const ice = map.ice || []
  const mud = map.mud || []
  const seaZ = map.sea ? map.sea.z + 1.5 : -Infinity
  return (x, z, pad, r) => {
    if (z < seaZ) return false
    for (const o of boxes) if (Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad) return false
    for (const road of roads) if (distToPolyline(x, z, road.points) < road.width + 0.6) return false
    for (const tr of trenches) if (distToPolyline(x, z, tr.points) < tr.w / 2 + 0.6) return false
    for (const c of ice) if (distToPolyline(x, z, c.points) < c.width + 0.8) return false
    // Trampled mud: bare in the middle, thinning in.
    for (const [mx, mz, mr] of mud) {
      const d = Math.hypot(x - mx, z - mz) / mr
      if (d < 1 && r() > d * d) return false
    }
    return true
  }
}

/**
 * Scatters `count` things: clumped by noise (offset by `salt` so each kind clumps on
 * its own), inside the fence and a few metres past it (where the ground is still flat).
 */
function scatterPoints(map, count, salt, canGrow, pad) {
  const r = rng(Math.floor(hash(map.width + salt, map.depth - salt) * 1e9) + salt)
  const hx = map.width / 2 + 6
  const hz = map.depth / 2 + 6
  const out = []
  let guard = 0
  while (out.length < count && guard < count * 12) {
    guard += 1
    const x = (r() * 2 - 1) * hx
    const z = (r() * 2 - 1) * hz
    const n = clumpNoise(x * 0.09 + salt, z * 0.09 - salt) * 0.7 + clumpNoise(x * 0.3, z * 0.3 + salt) * 0.3
    if (r() > Math.max(0.04, (n - 0.28) * 2.2)) continue
    if (!canGrow(x, z, pad, r)) continue
    out.push([x, z, r(), r(), r()])
  }
  return out
}

const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()
const e3 = new Vector3()
const tint = new Color()

/** `terrain`: the ground the scatter stands on (sim/terrain.js), or null. */
function instanced(terrain, geometry, material, points, place) {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, points.length))
  mesh.count = points.length
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, points.length) * 3), 3)
  points.forEach((pt, i) => {
    place(pt)
    if (terrain) p3.y += groundAt(terrain, p3.x, p3.z)
    m4.compose(p3, q4, s3)
    mesh.setMatrixAt(i, m4)
    mesh.setColorAt(i, tint)
  })
  mesh.computeBoundingSphere()
  mesh.matrixAutoUpdate = false
  return mesh
}

/** The wind's clock, shared by every swaying material (one battle at a time). */
const windClock = { value: 0 }

const pick = (list, t) => list[Math.min(list.length - 1, Math.floor(t * list.length))]

/** The scatter for `map` at this preset's counts. */
export default function Scatter({ map }) {
  const counts = useQuality((s) => s.settings.scatter)
  const wind = useQuality((s) => s.settings.wind)

  const set = useMemo(() => {
    const style = STYLES[map.theme?.scatter] || STYLES.meadow
    const terrain = mapTerrain(map)
    const canGrow = groundTest(map)
    // Denser on bigger maps, except on LOW (its counts are a whole-map budget).
    const area = Math.min(counts.maxArea ?? Infinity, ((map.width + 12) * (map.depth + 12)) / (182 * 122))
    const n = (k) => Math.round(k * area)

    const bladesPts = scatterPoints(map, n(counts.blades * (style.bladeShare ?? 1)), 11, canGrow, 0.25)
    const bladeGeo = tuftGeometry()
    const bladeMat = windy(new MeshLambertMaterial({ vertexColors: true }), wind, windClock)
    const blades = instanced(terrain, bladeGeo, bladeMat, bladesPts, ([x, z, a, b, c]) => {
      const [h0, h1] = style.blades.height
      const h = h0 + (h1 - h0) * a
      p3.set(x, 0, z)
      q4.setFromAxisAngle(e3.set(0, 1, 0), b * Math.PI * 2)
      s3.set(h * (0.9 + c * 0.6), h, h * (0.9 + c * 0.6))
      tint.set(pick(style.blades.colors, c))
    })

    const propPts = scatterPoints(map, n(counts.props), 23, canGrow, 0.35)
    const propGeo = propGeometry()
    const propMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true })
    const totalShare = style.props.reduce((s, k) => s + k.share, 0)
    const props = instanced(terrain, propGeo, propMat, propPts, ([x, z, a, b, c]) => {
      let t = a * totalShare
      let kind = style.props[0]
      for (const k of style.props) {
        if (t < k.share) {
          kind = k
          break
        }
        t -= k.share
      }
      const s = kind.scale[0] + (kind.scale[1] - kind.scale[0]) * b
      p3.set(x, s * kind.flat * 0.3 + (kind.lift || 0) * s, z)
      q4.setFromAxisAngle(e3.set(0, 1, 0), c * Math.PI * 2)
      s3.set(s * (0.9 + c * 0.4), s * kind.flat, s * (1.1 - c * 0.3))
      tint.set(pick(kind.colors, c))
    })

    let flowers = null
    let flowerGeo = null
    let flowerMat = null
    if (style.flowers) {
      const flowerPts = scatterPoints(map, n(counts.flowers), 37, canGrow, 0.3)
      flowerGeo = flowerGeometry()
      flowerMat = windy(new MeshLambertMaterial({ vertexColors: true }), wind, windClock)
      flowers = instanced(terrain, flowerGeo, flowerMat, flowerPts, ([x, z, a, b, c]) => {
        const h = 0.28 + a * 0.22
        p3.set(x, 0, z)
        q4.setFromAxisAngle(e3.set(0, 1, 0), b * Math.PI * 2)
        s3.set(h, h, h)
        tint.set(pick(style.flowers, c))
      })
    }
    return { blades, props, flowers, bladeGeo, bladeMat, propGeo, propMat, flowerGeo, flowerMat }
  }, [map, counts, wind])

  useEffect(
    () => () => {
      for (const k of ['bladeGeo', 'bladeMat', 'propGeo', 'propMat', 'flowerGeo', 'flowerMat']) set[k]?.dispose()
      set.blades.dispose()
      set.props.dispose()
      set.flowers?.dispose()
    },
    [set],
  )

  // The wind's clock (a number in a uniform: nothing allocated per frame).
  useEffect(() => {
    if (!wind) return undefined
    return addFrameHook(PHASE.DRAW, (state) => {
      windClock.value = state.clock.elapsedTime
    })
  }, [wind])

  return (
    <group>
      {set.blades.count > 0 && <primitive object={set.blades} />}
      {set.props.count > 0 && <primitive object={set.props} />}
      {set.flowers && set.flowers.count > 0 && <primitive object={set.flowers} />}
    </group>
  )
}
