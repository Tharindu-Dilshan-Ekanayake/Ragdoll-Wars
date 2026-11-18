import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { addFrameHook, PHASE } from '../battle/state'
import { useQuality } from '../store/quality'
import { BRIDGE_WIDTH, BRIDGES, HUB, PLATFORMS, SEA_LEVEL } from './seaFort'

/**
 * The Sea Fort itself: the sea, the steel decks on their legs, catwalk bridges,
 * railings, the orange hazard trim, foam where the legs meet the water, and clouds.
 *
 * Everything static is built once and merged: one mesh for the decks (steel-plate
 * texture), one for legs + railings + trim (vertex colours). Draw calls: decks 1,
 * structure 1, sea 1, foam 1, clouds 1.
 */

const DECK_THICK = 0.5
const LEG_RADIUS = 0.42
const POST_STEP = 2.2

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

function tint(geo, hex, k = 1) {
  tmpC.set(hex).multiplyScalar(k)
  const n = geo.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    c[i * 3] = tmpC.r
    c[i * 3 + 1] = tmpC.g
    c[i * 3 + 2] = tmpC.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(c, 3))
  return geo
}

function place(geo, x, y, z, ry = 0) {
  tmpQ.setFromEuler(tmpE.set(0, ry, 0))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, 1, 1))
  return geo.applyMatrix4(tmpM)
}

/** A thin box from (x0, z0) to (x1, z1) at height y: rails, trim, beams. */
function beam(parts, x0, z0, x1, z1, y, thick, tall, hex) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 0.05) return
  const g = new BoxGeometry(thick, tall, len)
  parts.push(place(tint(g, hex), (x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)))
}

/** A railing along a line: posts every couple of metres, an orange top rail, a mid rail. */
function railing(parts, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 0.3) return
  const n = Math.max(1, Math.round(len / POST_STEP))
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    parts.push(place(tint(new BoxGeometry(0.09, 1.05, 0.09), '#39434c'), x0 + (x1 - x0) * t, 0.525, z0 + (z1 - z0) * t))
  }
  beam(parts, x0, z0, x1, z1, 1.05, 0.1, 0.1, '#f08a24')
  beam(parts, x0, z0, x1, z1, 0.55, 0.06, 0.06, '#56626d')
}

/** A railing with a gap (where a bridge joins) between distances g0..g1 along it. */
function railingWithGap(parts, x0, z0, x1, z1, g0, g1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const ux = (x1 - x0) / len
  const uz = (z1 - z0) / len
  railing(parts, x0, z0, x0 + ux * g0, z0 + uz * g0)
  railing(parts, x0 + ux * g1, z0 + uz * g1, x1, z1)
}

function leg(parts, x, z, legs) {
  const top = -DECK_THICK
  const bottom = SEA_LEVEL - 3
  const g = new CylinderGeometry(LEG_RADIUS, LEG_RADIUS * 1.1, top - bottom, 8)
  parts.push(place(tint(g, '#4a545c'), x, (top + bottom) / 2, z))
  // A hazard band just above the waterline.
  parts.push(place(tint(new CylinderGeometry(LEG_RADIUS + 0.03, LEG_RADIUS + 0.03, 0.5, 8), '#e0a020'), x, SEA_LEVEL + 0.6, z))
  legs.push([x, z])
}

/** Octagon corners (flat sides facing +-x and +-z), at radius r. */
function hubCorners(r) {
  const out = []
  for (let i = 0; i < 8; i += 1) {
    const a = Math.PI / 8 + (i * Math.PI) / 4
    out.push([HUB.x + Math.sin(a) * r, HUB.z + Math.cos(a) * r])
  }
  return out
}

function buildFort() {
  const deck = []
  const structure = []
  const legs = []
  const half = BRIDGE_WIDTH / 2

  // --- Hub ---------------------------------------------------------------------------
  deck.push(place(tint(new CylinderGeometry(HUB.radius, HUB.radius, DECK_THICK, 8, 1, false, Math.PI / 8), '#ffffff'), HUB.x, -DECK_THICK / 2, HUB.z))
  const corners = hubCorners(HUB.radius)
  const railCorners = hubCorners(HUB.radius - 0.2)
  for (let i = 0; i < 8; i += 1) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 8]
    // Orange trim round the deck's edge.
    beam(structure, ax, az, bx, bz, -0.12, 0.12, 0.26, '#f08a24')
    const [rax, raz] = railCorners[i]
    const [rbx, rbz] = railCorners[(i + 1) % 8]
    const side = Math.hypot(rbx - rax, rbz - raz)
    // Odd sides face a bridge: leave the catwalk's width open in the middle.
    if (i % 2 === 1) railingWithGap(structure, rax, raz, rbx, rbz, side / 2 - half, side / 2 + half)
    else railing(structure, rax, raz, rbx, rbz)
    leg(structure, HUB.x + (ax - HUB.x) * 0.93, HUB.z + (az - HUB.z) * 0.93, legs)
    // Beams between the legs, under the deck.
    beam(structure, ax * 0.93, az * 0.93, bx * 0.93, bz * 0.93, -1.6, 0.25, 0.3, '#3d464e')
  }
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    leg(structure, HUB.x + Math.sin(a) * 5.5, HUB.z + Math.cos(a) * 5.5, legs)
  }

  // --- Platforms -----------------------------------------------------------------------
  for (const p of PLATFORMS) {
    deck.push(place(tint(new BoxGeometry(p.w, DECK_THICK, p.d), '#ffffff', 0.94), p.x, -DECK_THICK / 2, p.z))
    const x0 = p.x - p.w / 2
    const x1 = p.x + p.w / 2
    const z0 = p.z - p.d / 2
    const z1 = p.z + p.d / 2
    beam(structure, x0, z0 - 0.06, x1, z0 - 0.06, -0.12, 0.12, 0.26, '#f08a24')
    beam(structure, x0, z1 + 0.06, x1, z1 + 0.06, -0.12, 0.12, 0.26, '#f08a24')
    beam(structure, x0 - 0.06, z0, x0 - 0.06, z1, -0.12, 0.12, 0.26, '#f08a24')
    beam(structure, x1 + 0.06, z0, x1 + 0.06, z1, -0.12, 0.12, 0.26, '#f08a24')
    const i = 0.2
    // The side facing the hub gets an opening for the bridge.
    const facesHub = (side) =>
      (side === 'e' && p.x < -1) || (side === 'w' && p.x > 1) || (side === 's' && p.z < -1) || (side === 'n' && p.z > 1)
    const sides = [
      ['n', x0 + i, z0 + i, x1 - i, z0 + i],
      ['s', x0 + i, z1 - i, x1 - i, z1 - i],
      ['w', x0 + i, z0 + i, x0 + i, z1 - i],
      ['e', x1 - i, z0 + i, x1 - i, z1 - i],
    ]
    for (const [side, ax, az, bx, bz] of sides) {
      if (!facesHub(side)) {
        railing(structure, ax, az, bx, bz)
        continue
      }
      const len = Math.hypot(bx - ax, bz - az)
      // The bridge meets this side on the hub's axis (x = 0 or z = 0).
      const at = side === 'n' || side === 's' ? HUB.x - ax : HUB.z - az
      railingWithGap(structure, ax, az, bx, bz, Math.max(0, at - half), Math.min(len, at + half))
    }
    const inset = 0.8
    for (const [lx, lz] of [
      [x0 + inset, z0 + inset],
      [x1 - inset, z0 + inset],
      [x0 + inset, z1 - inset],
      [x1 - inset, z1 - inset],
    ])
      leg(structure, lx, lz, legs)
    if (p.w > 15) {
      leg(structure, p.x, z0 + inset, legs)
      leg(structure, p.x, z1 - inset, legs)
    }
    beam(structure, x0 + inset, z0 + inset, x1 - inset, z0 + inset, -1.6, 0.25, 0.3, '#3d464e')
    beam(structure, x0 + inset, z1 - inset, x1 - inset, z1 - inset, -1.6, 0.25, 0.3, '#3d464e')
    beam(structure, x0 + inset, z0 + inset, x0 + inset, z1 - inset, -1.6, 0.25, 0.3, '#3d464e')
    beam(structure, x1 - inset, z0 + inset, x1 - inset, z1 - inset, -1.6, 0.25, 0.3, '#3d464e')
  }

  // --- Bridges -------------------------------------------------------------------------
  for (const b of BRIDGES) {
    const w = b.x1 - b.x0
    const d = b.z1 - b.z0
    const alongX = w > d
    // Catwalk: a thinner, darker deck, stretched under its ends so there's no seam.
    deck.push(place(tint(new BoxGeometry(alongX ? w + 0.6 : w, 0.3, alongX ? d : d + 0.6), '#ffffff', 0.7), (b.x0 + b.x1) / 2, -0.15, (b.z0 + b.z1) / 2))
    if (alongX) {
      railing(structure, b.x0, b.z0 + 0.15, b.x1, b.z0 + 0.15)
      railing(structure, b.x0, b.z1 - 0.15, b.x1, b.z1 - 0.15)
      beam(structure, b.x0, b.z0 - 0.06, b.x1, b.z0 - 0.06, -0.12, 0.12, 0.26, '#f08a24')
      beam(structure, b.x0, b.z1 + 0.06, b.x1, b.z1 + 0.06, -0.12, 0.12, 0.26, '#f08a24')
      const mx = (b.x0 + b.x1) / 2
      leg(structure, mx, b.z0 + 0.4, legs)
      leg(structure, mx, b.z1 - 0.4, legs)
    } else {
      railing(structure, b.x0 + 0.15, b.z0, b.x0 + 0.15, b.z1)
      railing(structure, b.x1 - 0.15, b.z0, b.x1 - 0.15, b.z1)
      beam(structure, b.x0 - 0.06, b.z0, b.x0 - 0.06, b.z1, -0.12, 0.12, 0.26, '#f08a24')
      beam(structure, b.x1 + 0.06, b.z0, b.x1 + 0.06, b.z1, -0.12, 0.12, 0.26, '#f08a24')
      const mz = (b.z0 + b.z1) / 2
      leg(structure, b.x0 + 0.4, mz, legs)
      leg(structure, b.x1 - 0.4, mz, legs)
    }
  }

  const deckGeo = mergeGeometries(deck)
  // World-planar UVs on the decks so the plates line up everywhere (4 m per tile).
  const pos = deckGeo.attributes.position
  const uv = deckGeo.attributes.uv
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4)
  uv.needsUpdate = true
  const structureGeo = mergeGeometries(structure)
  for (const g of deck) g.dispose()
  for (const g of structure) g.dispose()
  return { deckGeo, structureGeo, legs }
}

// --- Textures ---------------------------------------------------------------------------

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function repeating(c, repeat) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}

/** Blue-grey steel deck plates (2 x 2 per tile) with seams and rivets. */
function paintPlates() {
  const S = 256
  const [c, g] = canvas(S, S)
  const r = rng(21)
  for (let py = 0; py < 2; py += 1)
    for (let px = 0; px < 2; px += 1) {
      const v = 112 + r() * 18
      g.fillStyle = `rgb(${v - 8},${v + 4},${v + 16})`
      g.fillRect(px * 128, py * 128, 128, 128)
    }
  for (let i = 0; i < 2600; i += 1) {
    const v = (90 + r() * 70) | 0
    g.fillStyle = `rgba(${v},${v + 6},${v + 14},0.22)`
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2)
  }
  // Rust and wear streaks.
  for (let i = 0; i < 12; i += 1) {
    g.fillStyle = `rgba(${120 + r() * 40},${80 + r() * 20},50,0.08)`
    g.beginPath()
    g.ellipse(r() * S, r() * S, 8 + r() * 26, 3 + r() * 8, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(30,36,42,0.75)'
  g.lineWidth = 2
  for (const k of [0, 128, 256]) {
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k, S)
    g.moveTo(0, k)
    g.lineTo(S, k)
    g.stroke()
  }
  g.fillStyle = 'rgba(40,46,52,0.6)'
  for (let py = 0; py < 2; py += 1)
    for (let px = 0; px < 2; px += 1)
      for (const [ox, oy] of [
        [8, 8],
        [120, 8],
        [8, 120],
        [120, 120],
        [64, 8],
        [64, 120],
        [8, 64],
        [120, 64],
      ]) {
        g.beginPath()
        g.arc(px * 128 + ox, py * 128 + oy, 2.2, 0, Math.PI * 2)
        g.fill()
      }
  return repeating(c, 1)
}

/** Stylised sea: deep blue with light, wavy streaks (tiles seamlessly). */
function paintSea() {
  const S = 256
  const [c, g] = canvas(S, S)
  g.fillStyle = '#1f6fd6'
  g.fillRect(0, 0, S, S)
  const r = rng(9)
  for (let i = 0; i < 26; i += 1) {
    g.fillStyle = `rgba(10,50,140,${0.12 + r() * 0.12})`
    const x = r() * S
    const y = r() * S
    const rx = 20 + r() * 40
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath()
        g.ellipse(x + ox, y + oy, rx, rx * 0.4, 0, 0, Math.PI * 2)
        g.fill()
      }
  }
  g.lineCap = 'round'
  for (let i = 0; i < 70; i += 1) {
    const x = r() * S
    const y = r() * S
    const len = 10 + r() * 26
    g.strokeStyle = `rgba(200,235,255,${0.25 + r() * 0.35})`
    g.lineWidth = 1.5 + r() * 2
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath()
        g.moveTo(x + ox, y + oy)
        g.quadraticCurveTo(x + ox + len / 2, y + oy - 4, x + ox + len, y + oy)
        g.stroke()
      }
  }
  return repeating(c, 1)
}

/** A soft white ring of foam. */
function paintFoam() {
  const S = 64
  const [c, g] = canvas(S, S)
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return new CanvasTexture(c)
}

/** A big puffy cartoon cloud: one soft white silhouette, shaded along its underside. */
function paintCloud() {
  const W = 256
  const H = 128
  const [c, g] = canvas(W, H)
  const r = rng(4)
  const puff = (x, y, rad) => {
    const grad = g.createRadialGradient(x, y, rad * 0.55, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8
    puff(40 + t * 176, 80 - Math.sin(t * Math.PI) * 24 + r() * 6, 22 + Math.sin(t * Math.PI) * 22 + r() * 8)
  }
  for (let i = 0; i < 7; i += 1) puff(46 + r() * 164, 90 + r() * 8, 16 + r() * 10)
  // Blue-grey underside, only where the cloud already is.
  g.globalCompositeOperation = 'source-atop'
  const shade = g.createLinearGradient(0, 40, 0, H)
  shade.addColorStop(0, 'rgba(255,255,255,0)')
  shade.addColorStop(0.6, 'rgba(206,222,245,0.55)')
  shade.addColorStop(1, 'rgba(180,200,235,0.85)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// --- Clouds -----------------------------------------------------------------------------

const CLOUDS = 12

export default function FortDecks() {
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const seaRef = useRef(null)
  const cloudRef = useRef(null)

  const parts = useMemo(() => {
    const fort = buildFort()
    const plates = paintPlates()
    const sea = paintSea()
    sea.repeat.set(140, 140)
    const foam = paintFoam()
    const cloud = paintCloud()
    const deckMat = new MeshLambertMaterial({ vertexColors: true, map: plates })
    const structureMat = new MeshLambertMaterial({ vertexColors: true })
    const seaGeo = new PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2)
    const seaMat = new MeshLambertMaterial({ map: sea })
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const foamMat = new MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0.8 })
    const foamMesh = new InstancedMesh(flat, foamMat, fort.legs.length)
    fort.legs.forEach(([x, z], i) => {
      tmpQ.setFromEuler(tmpE.set(0, i * 1.3, 0))
      tmpM.compose(tmpP.set(x, SEA_LEVEL + 0.03, z), tmpQ, tmpS.set(2.4, 1, 2.4))
      foamMesh.setMatrixAt(i, tmpM)
    })
    foamMesh.computeBoundingSphere()
    foamMesh.renderOrder = 1
    // Clouds: upright quads on a ring round the camera, facing in.
    const cloudGeo = new PlaneGeometry(1, 0.5)
    const cloudMat = new MeshBasicMaterial({ map: cloud, transparent: true, depthWrite: false, fog: false })
    const clouds = new InstancedMesh(cloudGeo, cloudMat, CLOUDS)
    const r = rng(17)
    for (let i = 0; i < CLOUDS; i += 1) {
      const a = (i / CLOUDS) * Math.PI * 2 + r() * 0.4
      const dist = 150 + r() * 35
      const size = 55 + r() * 55
      tmpQ.setFromEuler(tmpE.set(0, a + Math.PI, 0))
      tmpM.compose(tmpP.set(Math.sin(a) * dist, 28 + r() * 38, Math.cos(a) * dist), tmpQ, tmpS.set(size, size, 1))
      clouds.setMatrixAt(i, tmpM)
    }
    clouds.instanceMatrix.setUsage(DynamicDrawUsage)
    clouds.frustumCulled = false
    return { ...fort, plates, sea, foam, cloud, deckMat, structureMat, seaGeo, seaMat, flat, foamMat, foamMesh, cloudGeo, cloudMat, clouds }
  }, [])

  useEffect(
    () => () => {
      for (const k of ['deckGeo', 'structureGeo', 'plates', 'sea', 'foam', 'cloud', 'deckMat', 'structureMat', 'seaGeo', 'seaMat', 'flat', 'foamMat', 'cloudGeo', 'cloudMat']) parts[k].dispose()
    },
    [parts],
  )

  // Drift the sea's texture, and keep the cloud ring centred on the camera.
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state, rawDelta) => {
        const d = Math.min(rawDelta, 0.05)
        const sea = seaRef.current
        if (sea) {
          const map = sea.material.map
          map.offset.x = (map.offset.x + d * 0.012) % 1
          map.offset.y = (map.offset.y + d * 0.006) % 1
        }
        const clouds = cloudRef.current
        if (clouds) clouds.position.set(state.camera.position.x, 0, state.camera.position.z)
      }),
    [],
  )

  return (
    <>
      <mesh ref={seaRef} geometry={parts.seaGeo} material={parts.seaMat} position={[0, SEA_LEVEL, 0]} />
      <primitive object={parts.foamMesh} />
      <mesh geometry={parts.deckGeo} material={parts.deckMat} receiveShadow={shadows} />
      <mesh geometry={parts.structureGeo} material={parts.structureMat} castShadow={shadows} />
      <primitive ref={cloudRef} object={parts.clouds} />
    </>
  )
}
