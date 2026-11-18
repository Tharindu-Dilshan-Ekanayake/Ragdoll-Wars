import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BUILD_TYPES } from '../sim/structures'

/**
 * Geometry for build mode's own pieces (the ones the battlefield's cover renderer
 * doesn't know): trench, gabions, pipes, tank traps, dragon's teeth, barbed wire,
 * bunker, watchtower, helipad, camo net, floodlight, radio mast, ammo crates, drums,
 * fuel barrels, hay, fences, trees, bushes and rocks. Vertex colours only; every placed
 * piece goes into one merged mesh (rebuilt when something is built or destroyed).
 */

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

function tint(geo, hex, k = 1) {
  tmpC.set(hex).multiplyScalar(k)
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    c[i * 3] = tmpC.r
    c[i * 3 + 1] = tmpC.g
    c[i * 3 + 2] = tmpC.b
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3))
  if (g.attributes.uv) g.deleteAttribute('uv')
  return g
}

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz))
  return geo.applyMatrix4(tmpM)
}

const box = (w, h, d, hex, k) => tint(new BoxGeometry(w, h, d), hex, k)
const cyl = (r0, r1, h, seg, hex, k) => tint(new CylinderGeometry(r0, r1, h, seg), hex, k)

/** Parts for one piece in its own frame (long side along X), pushed into `out`. */
function pieceParts(key, seed, out) {
  const v = 0.9 + seed * 0.2
  switch (key) {
    case 'trench': {
      out.push(place(box(6, 0.04, 1.4, '#3b2e22', v), 0, 0.02, 0))
      for (const z of [-1.0, 1.0]) {
        out.push(place(box(6.2, 0.6, 0.8, '#6b5538', v), 0, 0.3, z))
        out.push(place(box(6.0, 0.25, 0.5, '#7c6444', v), 0, 0.68, z))
      }
      for (let k = -2; k <= 2; k += 1) out.push(place(box(0.12, 0.7, 0.12, '#5a4128'), k * 1.4, 0.35, -0.62))
      break
    }
    case 'sandwall':
      for (const x of [-0.62, 0.62]) {
        out.push(place(box(1.2, 1.4, 1.2, '#b9a278', v), x, 0.7, 0))
        out.push(place(box(1.24, 0.05, 1.24, '#6b6455'), x, 1.39, 0))
        for (const y of [0.25, 0.7, 1.15]) out.push(place(box(1.25, 0.04, 1.25, '#7d7462'), x, y, 0))
      }
      break
    case 'pipes':
      for (const [x, y] of [
        [-0.65, 0.45],
        [0.65, 0.45],
        [0, 1.05],
      ]) {
        out.push(place(cyl(0.45, 0.45, 1.6, 12, '#a7a39a', v), x, y, 0, Math.PI / 2))
        out.push(place(cyl(0.3, 0.3, 1.62, 10, '#4e4b46'), x, y, 0, Math.PI / 2))
      }
      break
    case 'tanktrap':
      for (const [rx, rz] of [
        [0.6, 0],
        [-0.6, 0],
        [0, 0.9],
      ])
        out.push(place(box(0.14, 1.5, 0.14, '#5b5f63', v), 0, 0.55, 0, rx, rz * 0, rz))
      break
    case 'teeth':
      for (const x of [-1.8, 0, 1.8]) out.push(place(tint(new ConeGeometry(0.62, 0.95, 4), '#b4afa5', v), x, 0.47, 0, 0, Math.PI / 4))
      break
    case 'wire': {
      for (const x of [-1.9, 0, 1.9]) out.push(place(box(0.08, 1.0, 0.08, '#5a4128'), x, 0.5, 0))
      for (let k = 0; k < 5; k += 1) out.push(place(tint(new TorusGeometry(0.42, 0.018, 4, 14), '#8c9094'), -1.6 + k * 0.8, 0.45, 0, 0, Math.PI / 2 + 0.25, 0))
      out.push(place(box(4, 0.02, 0.02, '#8c9094'), 0, 0.85, 0))
      break
    }
    case 'bunker':
      out.push(place(box(5, 2.2, 4, '#a6a197', v), 0, 1.1, 0))
      out.push(place(box(5.3, 0.3, 4.3, '#8f8a80', v), 0, 2.3, 0))
      out.push(place(box(3, 0.28, 0.08, '#1a1a1a'), 0, 1.5, 2.01))
      out.push(place(box(3, 0.28, 0.08, '#1a1a1a'), 0, 1.5, -2.01))
      out.push(place(box(0.9, 1.6, 0.08, '#2a2622'), 1.6, 0.8, -2.02))
      break
    case 'tower':
      out.push(place(box(2.9, 0.15, 2.9, '#8a6a46', v), 0, 3.8, 0))
      for (const z of [-1.4, 1.4]) out.push(place(box(2.9, 0.9, 0.08, '#7a5a3a', v), 0, 4.3, z))
      for (const x of [-1.4, 1.4]) out.push(place(box(0.08, 0.9, 2.9, '#7a5a3a', v), x, 4.3, 0))
      out.push(place(tint(new ConeGeometry(2.3, 1.1, 4), '#5f6266'), 0, 5.6, 0, 0, Math.PI / 4))
      for (const x of [-1.1, 1.1]) out.push(place(box(0.06, 0.06, 3.4, '#6b4e30'), x, 1.8, 0, 0.75))
      break
    case 'helipad':
      out.push(place(box(8, 0.06, 8, '#7d7b75', v), 0, 0.03, 0))
      out.push(place(tint(new RingGeometry(2.6, 3.1, 32).rotateX(-Math.PI / 2), '#ff8a1f'), 0, 0.07, 0))
      out.push(place(box(0.5, 0.02, 2.6, '#f2eee4'), -0.75, 0.07, 0))
      out.push(place(box(0.5, 0.02, 2.6, '#f2eee4'), 0.75, 0.07, 0))
      out.push(place(box(1.0, 0.02, 0.45, '#f2eee4'), 0, 0.075, 0))
      break
    case 'camonet':
      out.push(place(tint(new PlaneGeometry(5.4, 4.4, 6, 5).rotateX(-Math.PI / 2), '#4f5a34', v), 0, 2.55, 0))
      out.push(place(tint(new PlaneGeometry(5.0, 4.0, 4, 4).rotateX(-Math.PI / 2), '#6b6a3e', v), 0.3, 2.5, -0.2, 0, 0.4))
      break
    case 'floodlight':
      out.push(place(box(0.9, 0.5, 0.35, '#3a3d40'), 0, 5.1, 0.1))
      out.push(place(box(0.8, 0.4, 0.05, '#fff6c8'), 0, 5.1, 0.29))
      out.push(place(box(0.7, 0.1, 0.7, '#4a4d50'), 0, 0.05, 0))
      break
    case 'radiomast':
      for (let k = 1; k <= 3; k += 1) out.push(place(box(1.4 - k * 0.3, 0.06, 0.06, '#8a8f94'), 0, k * 3.5, 0))
      out.push(place(tint(new IcosahedronGeometry(0.12, 0), '#ff3b30'), 0, 12.1, 0))
      break
    case 'ammocrate':
      out.push(place(box(1.4, 0.75, 0.9, '#55603a', v), 0, 0.375, 0))
      out.push(place(box(1.42, 0.1, 0.92, '#3e4529'), 0, 0.6, 0))
      out.push(place(box(0.3, 0.12, 0.02, '#d9b03a'), 0, 0.4, 0.46))
      break
    case 'drum':
      out.push(place(cyl(0.4, 0.4, 1.1, 12, '#4f5a3a', v), 0, 0.55, 0))
      for (const y of [0.3, 0.8]) out.push(place(cyl(0.41, 0.41, 0.05, 12, '#3a4229'), 0, y, 0))
      break
    case 'fuel':
      out.push(place(cyl(0.4, 0.4, 1.1, 12, '#b2342b', v), 0, 0.55, 0))
      out.push(place(cyl(0.41, 0.41, 0.12, 12, '#e8c23a'), 0, 0.7, 0))
      out.push(place(cyl(0.06, 0.06, 0.1, 6, '#2a2a2a'), 0.2, 1.13, 0))
      break
    case 'hay':
      out.push(place(cyl(0.6, 0.6, 1.6, 12, '#d9b65e', v), 0, 0.6, 0, 0, 0, Math.PI / 2))
      for (const x of [-0.4, 0.4]) out.push(place(cyl(0.61, 0.61, 0.05, 12, '#9c7f3a'), x, 0.6, 0, 0, 0, Math.PI / 2))
      break
    case 'fence':
      for (const x of [-1.9, 0, 1.9]) out.push(place(box(0.12, 1.1, 0.12, '#6e5032', v), x, 0.55, 0))
      for (const y of [0.45, 0.9]) out.push(place(box(4, 0.1, 0.05, '#7d5c3a', v), 0, y, 0))
      break
    case 'tree':
      out.push(place(cyl(0.22, 0.32, 2.4, 6, '#5a3f28'), 0, 1.2, 0))
      for (let k = 0; k < 3; k += 1) out.push(place(tint(new ConeGeometry(1.7 - k * 0.42, 1.9, 7), '#2f6b35', v * (0.9 + k * 0.06)), 0, 2.4 + k * 1.15, 0, 0, seed * 6))
      break
    case 'bush':
      out.push(place(tint(new IcosahedronGeometry(0.75, 1), '#3f7a3a', v), 0, 0.55, 0, 0, 0, 0, 1, 0.8, 1))
      out.push(place(tint(new IcosahedronGeometry(0.5, 0), '#4f8c44', v), 0.45, 0.45, 0.2))
      break
    case 'rock':
      out.push(place(tint(new DodecahedronGeometry(0.9, 0), '#8d8a84', v), 0, 0.5, 0, seed, seed * 3, 0, 1.05, 0.75, 0.95))
      out.push(place(tint(new DodecahedronGeometry(0.45, 0), '#7c7973', v), 0.75, 0.25, 0.4, seed * 2))
      break
    default:
      break
  }
}

/** Kinds drawn here (the rest go through the cover renderer). */
export const OWN_PIECES = new Set(['trench', 'sandwall', 'pipes', 'tanktrap', 'teeth', 'wire', 'bunker', 'tower', 'helipad', 'camonet', 'floodlight', 'radiomast', 'ammocrate', 'drum', 'fuel', 'hay', 'fence', 'tree', 'bush', 'rock'])

/** Extra trim on pieces whose boxes the cover renderer draws (e.g. tower legs, net poles). */
const ALSO_OWN = new Set(['tower', 'camonet', 'floodlight', 'radiomast'])

/** One merged geometry for every placed piece of an "own" kind, or null. */
export function buildPiecesGeometry(list) {
  const parts = []
  for (const st of list) {
    if (!OWN_PIECES.has(st.key)) continue
    const local = []
    pieceParts(st.key, st.seed, local)
    // Same quarter turn as the collision boxes (sim/structures.js pieceBoxes).
    const rot = st.rot ? Math.PI / 2 : 0
    for (const g of local) {
      place(g, st.x, 0, st.z, 0, rot, 0)
      parts.push(g)
    }
  }
  if (!parts.length) return null
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  g.computeVertexNormals()
  return g
}

/** Which placed pieces' boxes the cover renderer should draw (sandbags, walls, legs...). */
export function coverBoxesOf(list) {
  const out = []
  for (const st of list) {
    if (OWN_PIECES.has(st.key) && !ALSO_OWN.has(st.key)) continue
    for (const o of st.boxes) out.push(o)
  }
  return out
}

export const pieceSize = (key) => BUILD_TYPES[key].size
