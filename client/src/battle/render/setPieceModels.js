import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BLDG, bldgLayout, rotLocal } from '../sim/setpieces'
import { BoxBatch, hash } from './coverGeometry'
import { buildVehicleGeometries } from './vehicleModels'

/**
 * The set pieces' looks (sim/setpieces.js has their collision): every one of a map's
 * sets built in code from boxes, cylinders and a few shaped pieces into three merged
 * geometries - plain (vertex colours), concrete and corrugated steel (textured) - so a
 * whole harbour or airfield is three draw calls. Each kind is drawn in its own frame
 * (x along its length, y up, front towards +z) and turned / moved into place.
 */

const tmpM = new Matrix4()
const tmpM2 = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

const CONTAINERS = ['#a8462f', '#3f6b4a', '#2f5f8f', '#c08a2e', '#7d7f84', '#8a3f5e']
const BATCH = { concrete: 'concrete', steel: 'steel', detail: 'detail', glass: 'glass', plain: 'plainBoxes', cut: 'cutBoxes' }

/** Face bits in a set's frame -> world bits after `rot` quarter turns (y faces stay). */
function worldSkip(skip, rot) {
  let out = skip & 12
  const sides = [
    [1, 1, 0],
    [2, -1, 0],
    [16, 0, 1],
    [32, 0, -1],
  ]
  for (const [bit, nx, nz] of sides) {
    if (!(skip & bit)) continue
    const [wx, wz] = rotLocal(nx, nz, rot)
    out |= wx > 0.5 ? 1 : wx < -0.5 ? 2 : wz > 0.5 ? 16 : 32
  }
  return out
}

class SetBuilder {
  constructor() {
    this.concrete = new BoxBatch()
    this.steel = new BoxBatch()
    this.plainBoxes = new BoxBatch()
    /** Small trim (frames, sills, lights, mirrors): no shadow, not drawn on LOW. */
    this.detail = new BoxBatch()
    /** Window glass: its own material, which catches the sky. */
    this.glass = new BoxBatch()
    /** Roofs over enterable buildings: their own mesh, hidden to look inside (MapView). */
    this.cutBoxes = new BoxBatch()
    this.cutExtra = []
    /** While true, geo() goes to the roof mesh. */
    this.toCut = false
    this.extra = []
    this.ox = 0
    this.oz = 0
    this.rot = 0
    this.seed = 0
    this.lite = false
  }

  begin(x, z, rot, seed) {
    this.ox = x
    this.oz = z
    this.rot = rot & 3
    this.seed = seed
  }

  /**
   * A box in the set's frame (centre lx, ly, lz; size w, h, d). `mat`: 'plain',
   * 'concrete', 'steel', 'detail' or 'glass'. `skip`: faces to leave out, in the set's
   * own frame (BoxBatch bits: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z).
   */
  box(lx, ly, lz, w, h, d, color, mat = 'plain', uv = 2, skip = 0) {
    const [rx, rz] = rotLocal(lx, lz, this.rot)
    const odd = this.rot & 1
    const batch = BATCH[mat] ? this[BATCH[mat]] : this.plainBoxes
    batch.box(this.ox + rx, ly, this.oz + rz, odd ? d : w, h, odd ? w : d, typeof color === 'string' ? tmpC.set(color).clone() : color, uv, skip && worldSkip(skip, this.rot))
  }

  /**
   * A window on a wall face: glass in a frame with a sill. `side` is the way the wall
   * faces in the set's frame ('+z', '-z', '+x', '-x'); (lx, ly, lz) is the window's
   * centre on the wall's surface. `glass` tints the pane (dark by default; warm for a lit
   * window), `frame` colours the frame and sill.
   */
  win(lx, ly, lz, w, h, side, { glass = '#26343e', frame = '#e6e1d6', sill = true } = {}) {
    const alongX = side[1] === 'z'
    const s = side[0] === '+' ? 1 : -1
    const out = (t) => (alongX ? [lx, lz + s * t] : [lx + s * t, lz])
    const back = alongX ? (s > 0 ? 32 : 16) : s > 0 ? 2 : 1
    const plate = (t, ww, hh, dd, y, color, mat) => {
      const [x, z] = out(t)
      this.box(x, y, z, alongX ? ww : dd, hh, alongX ? dd : ww, color, mat, 2, back)
    }
    plate(0.035, w + 0.16, h + 0.16, 0.07, ly, frame, 'detail')
    plate(0.075, w, h, 0.02, ly, glass, 'glass')
    // A mullion down the middle of wide windows.
    if (w > 1.3) plate(0.09, 0.06, h, 0.02, ly, frame, 'detail')
    if (sill) plate(0.08, w + 0.3, 0.07, 0.16, ly - h / 2 - 0.1, frame, 'detail')
  }

  /** Any geometry (owned) placed in the set's frame: position, Euler rotation, scale. */
  geo(g, color, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let geom = g.index ? g.toNonIndexed() : g
    if (geom !== g) g.dispose()
    if (geom.attributes.uv) geom.deleteAttribute('uv')
    if (color) {
      tmpC.set(color)
      const n = geom.attributes.position.count
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i += 1) {
        arr[i * 3] = tmpC.r
        arr[i * 3 + 1] = tmpC.g
        arr[i * 3 + 2] = tmpC.b
      }
      geom.setAttribute('color', new Float32BufferAttribute(arr, 3))
    }
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
    tmpM.compose(tmpP.set(lx, ly, lz), tmpQ, tmpS.set(sx, sy, sz))
    tmpQ.setFromEuler(tmpE.set(0, (this.rot * Math.PI) / 2, 0))
    tmpM2.compose(tmpP.set(this.ox, 0, this.oz), tmpQ, tmpS.set(1, 1, 1))
    geom.applyMatrix4(tmpM2.multiply(tmpM))
    ;(this.toCut ? this.cutExtra : this.extra).push(geom)
  }

  cyl(lx, ly, lz, rTop, rBottom, h, color, seg = 12, rx = 0, rz = 0, open = false) {
    this.geo(new CylinderGeometry(rTop, rBottom, h, seg, 1, open), color, lx, ly, lz, rx, 0, rz)
  }

  /** A thin bar from (ax, ay, az) to (bx, by, bz), local. */
  bar(ax, ay, az, bx, by, bz, t, color) {
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const len = Math.hypot(dx, dy, dz)
    const g = new BoxGeometry(t, len, t)
    // Point the box's +y along the bar.
    tmpQ.setFromUnitVectors(tmpP.set(0, 1, 0), tmpS.set(dx / len, dy / len, dz / len))
    tmpE.setFromQuaternion(tmpQ)
    this.geo(g, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, tmpE.x, tmpE.y, tmpE.z)
  }

  /** A gabled roof: a triangular prism w wide, len long, h tall, eaves at y0 (ridge along local z, or x). */
  roof(lx, y0, lz, w, len, h, color, alongX = false) {
    const sz = h / 1.5
    this.geo(new CylinderGeometry(1, 1, 1, 3, 1, false), color, lx, y0 + 0.5 * sz, lz, -Math.PI / 2, 0, alongX ? Math.PI / 2 : 0, w / 2 / 0.866, len, sz)
  }

  build() {
    const indexed = this.plainBoxes.build()
    const plainBox = indexed.toNonIndexed()
    indexed.dispose()
    plainBox.deleteAttribute('uv')
    const parts = [plainBox, ...this.extra].filter((g) => g.attributes.position.count > 0)
    const plain = parts.length ? mergeGeometries(parts) : null
    for (const g of parts) g.dispose()
    const nonEmpty = (batch) => {
      const g = batch.build()
      if (g.index?.count) return g
      g.dispose()
      return null
    }
    // The cutaway roofs, merged like the plain mesh.
    const cutIdx = this.cutBoxes.build()
    const cutBox = cutIdx.toNonIndexed()
    cutIdx.dispose()
    cutBox.deleteAttribute('uv')
    const cutParts = [cutBox, ...this.cutExtra].filter((g) => g.attributes.position.count > 0)
    const cut = cutParts.length ? mergeGeometries(cutParts) : null
    for (const g of cutParts) g.dispose()
    return { plain, concrete: this.concrete.build(), steel: this.steel.build(), detail: nonEmpty(this.detail), glass: nonEmpty(this.glass), cut }
  }
}

const v = (seed, k = 0, spread = 0.12) => 1 - spread / 2 + hash(seed * 7.1 + k, k * 3.3) * spread
const shade = (hex, f) => tmpC.set(hex).multiplyScalar(f).getHexString().replace(/^/, '#')

// --- The kinds --------------------------------------------------------------------------

/** A ship-to-shore gantry crane, its boom reaching out over the water (local -z). */
function crane(b) {
  const Y = '#d8a22c'
  const D = '#8f6a1e'
  for (const sx of [-6, 6]) {
    for (const sz of [-5, 5]) {
      b.box(sx, 13, sz, 1.0, 26, 1.0, Y)
      b.box(sx, 0.5, sz, 1.6, 1, 2.4, '#3a3d40')
    }
    b.box(sx, 24, 0, 1.2, 1.4, 11, Y)
    b.bar(sx, 3, -5, sx, 22, 5, 0.35, D)
  }
  for (const sz of [-5, 5]) {
    b.box(0, 1.4, sz, 13, 0.8, 0.8, Y)
    b.box(0, 24, sz, 13.2, 1.4, 1.2, Y)
  }
  // The boom and its back reach.
  b.box(0, 27, -11, 2.4, 1.8, 46, Y)
  b.box(0, 28.3, -11, 1.4, 0.7, 46, shade(Y, 0.85))
  b.box(0, 26.6, 5, 5, 3, 7, '#e8e6df')
  b.box(0, 25.2, -8, 2.2, 2, 2.4, '#2c3a44')
  // The A-frame and its stays.
  for (const sx of [-1.4, 1.4]) {
    b.box(sx, 32, 3, 0.6, 8, 0.6, Y)
    b.bar(sx, 36, 3, 0, 28, -32, 0.18, '#3a3d40')
    b.bar(sx, 36, 3, 0, 28, 12, 0.18, '#3a3d40')
  }
  // The spreader hanging off the trolley.
  b.box(0, 25.6, -24, 3, 1, 3, '#e8e6df')
  for (const sx of [-1, 1]) b.box(sx, 19, -24, 0.06, 12, 0.06, '#2a2c2e')
  b.box(0, 12.8, -24, 2.8, 0.6, 12.2, '#c98a20')
}

/** A cargo ship, bow towards local +x, stacked with containers. */
function ship(b, o) {
  const L = o.len || 56
  const hullTop = 7
  const half = L / 2
  const body = L - 9
  const cx = -half + body / 2
  b.box(cx, 1, 0, body, 3, 11, '#7a2e26')
  b.box(cx, 4.9, 0, body, 4.4, 11, '#2c3440')
  // The bow: the hull's two bands tapered to a raked point.
  const bowPart = (y0, y1, color) => {
    const g = new BoxGeometry(9, y1 - y0, 11)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i += 1) {
      if (p.getX(i) <= 0) continue
      const top = (p.getY(i) + (y1 - y0) / 2 + y0) / hullTop
      p.setZ(i, p.getZ(i) * (0.04 + 0.22 * top))
      p.setX(i, p.getX(i) + top * 1.6)
    }
    g.computeVertexNormals()
    b.geo(g, color, half - 4.5, (y0 + y1) / 2, 0)
  }
  bowPart(-0.5, 2.5, '#7a2e26')
  bowPart(2.5, hullTop + 0.1, '#2c3440')
  b.box(cx, hullTop + 0.05, 0, body, 0.1, 10.6, '#6b6f72')
  // Containers in bays.
  let k = 0
  for (let x = -half + 16; x < half - 12; x += 6.6) {
    const tiers = 1 + ((hash(x, o.seed || 1) * 3) | 0)
    for (let row = 0; row < 4; row += 1) {
      const h = Math.max(1, tiers - (row === 0 || row === 3 ? 1 : 0))
      for (let t = 0; t < h; t += 1) {
        b.box(x, hullTop + 1.3 + t * 2.6, -3.9 + row * 2.6, 6.1, 2.55, 2.45, CONTAINERS[(k + row * 3 + t) % CONTAINERS.length], 'steel', 1.4)
      }
    }
    k += 1
  }
  // The bridge at the stern, its funnel and a mast up front.
  const sx = -half + 6
  b.box(sx, hullTop + 4.5, 0, 8, 9, 10, '#e8e6df')
  b.box(sx + 4.03, hullTop + 7.2, 0, 0.04, 1.2, 9.2, '#22303a', 'glass', 2, 2)
  for (let y = hullTop + 1.6; y < hullTop + 6; y += 1.8) {
    for (const sz of [-1, 1]) for (let x = sx - 3; x <= sx + 3; x += 1.5) b.box(x, y, sz * 5.02, 0.6, 0.6, 0.03, '#22303a', 'glass')
    b.box(sx + 4.03, y, 0, 0.03, 0.5, 6, '#22303a', 'glass', 2, 2)
  }
  // Lifeboats in their davits, deck rails, the name on the bow.
  for (const sz of [-1, 1]) {
    b.box(sx - 1, hullTop + 3.2, sz * 5.6, 3.4, 1, 1.2, '#f07a20', 'detail')
    b.box(cx, hullTop + 0.6, sz * 5.45, body, 0.06, 0.06, '#d8d6cf', 'detail')
    b.box(half - 6, 5.5, sz * 3.2, 4, 0.6, 0.03, '#e8e6df', 'detail', 2, sz > 0 ? 32 : 16)
  }
  b.box(sx + 1, hullTop + 9.3, 0, 4, 0.4, 14, '#e8e6df')
  b.box(sx - 3, hullTop + 11, 0, 3, 4, 3.4, '#c44a2b')
  b.box(sx - 3, hullTop + 13.2, 0, 3.05, 0.6, 3.45, '#1e1f21')
  b.box(half - 12, hullTop + 4, 0, 0.4, 8, 0.4, '#e8e6df')
}

function tug(b) {
  b.box(-1, 0.8, 0, 11, 2, 4.6, '#b5432f')
  b.box(-1, 2.2, 0, 11, 0.8, 4.6, '#1f2326')
  const bow = new BoxGeometry(3, 2.8, 4.6)
  const p = bow.attributes.position
  for (let i = 0; i < p.count; i += 1) if (p.getX(i) > 0) p.setZ(i, p.getZ(i) * 0.2)
  bow.computeVertexNormals()
  b.geo(bow, '#b5432f', 5.5, 1.2, 0)
  b.box(-1.5, 3.8, 0, 4.5, 2.4, 3.4, '#e8e6df')
  b.box(0.77, 4.25, 0, 0.04, 0.8, 3, '#22303a', 'glass', 2, 2)
  for (const sz of [-1, 1]) for (const x of [-2.6, -1]) b.box(x, 4.25, sz * 1.72, 0.9, 0.6, 0.03, '#22303a', 'glass')
  b.box(-1.5, 5.05, 0, 4.8, 0.1, 3.7, '#c44a2b')
  b.box(-3.4, 5.6, 0, 1.2, 1.6, 1.2, '#1f2326')
  b.box(-1.2, 5.6, 0, 0.08, 1, 0.08, '#5a5e62', 'detail')
  for (const z of [-2.4, 2.4]) b.box(-1, 1.6, z, 9, 0.5, 0.25, '#1a1a1a')
  for (const sz of [-1, 1]) b.cyl(-1, 2.6, sz * 2.35, 0.32, 0.32, 0.18, '#e8e6df', 10, Math.PI / 2)
  b.box(-1, 2.65, 0, 11, 0.06, 4.7, '#d8d6cf', 'detail', 2, 8)
}

function tank(b, o) {
  const r = o.r || 5.5
  const h = o.h || 10
  const c = o.color || '#d8d6cf'
  b.cyl(0, h / 2, 0, r, r, h, c, 24)
  b.geo(new ConeGeometry(r * 1.02, 1.2, 24), shade(c, 0.9), 0, h + 0.6, 0)
  for (const y of [h * 0.33, h * 0.66]) b.cyl(0, y, 0, r + 0.05, r + 0.05, 0.25, shade(c, 0.82), 24, 0, 0, true)
  // Stairs winding up the side, a rail round the top.
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 1.2
    b.box(Math.cos(a) * (r + 0.5), 0.6 + (k / 8) * h, Math.sin(a) * (r + 0.5), 1.2, 0.15, 0.9, '#5a5e62')
  }
  b.cyl(0, h + 1.4, 0, r * 0.95, r * 0.95, 0.08, '#5a5e62', 24, 0, 0, true)
  b.box(0, 0.25, 0, r * 2.3, 0.5, r * 2.3, '#9a968c', 'concrete')
}

function lighthouse(b) {
  b.box(0, 0.6, 0, 3.6, 1.2, 3.6, '#a19c90', 'concrete')
  const bands = ['#e9e6df', '#c43a30']
  for (let k = 0; k < 5; k += 1) {
    const r0 = 1.6 - k * 0.1
    b.cyl(0, 1.2 + k * 2.8 + 1.4, 0, r0 - 0.1, r0, 2.8, bands[k % 2], 16)
  }
  for (const y of [4.5, 8.5, 12]) b.box(0, y, 1.48, 0.4, 0.6, 0.06, '#22303a', 'glass', 2, 32)
  b.box(0, 1.9, 1.6, 0.8, 1.4, 0.08, '#3a2e24')
  b.cyl(0, 15.4, 0, 2, 2, 0.3, '#3a3d40', 16)
  b.cyl(0, 16, 0, 2, 2, 0.9, '#3a3d40', 16, 0, 0, true)
  b.cyl(0, 16.6, 0, 1.1, 1.1, 2.1, '#ffe9a8', 12)
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2
    b.box(Math.cos(a) * 1.12, 16.6, Math.sin(a) * 1.12, 0.08, 2.1, 0.08, '#2a2c2e', 'detail')
  }
  b.geo(new ConeGeometry(1.4, 1.4, 12), '#c43a30', 0, 18.4, 0)
  b.box(0, 19.4, 0, 0.06, 0.8, 0.06, '#2a2c2e', 'detail')
}

/** A concrete office block: framed glass windows in rows, a glazed entrance on the front (+z). */
function office(b, o) {
  const w = o.w || 14
  const d = o.d || 9
  const floors = o.floors || 2
  const fh = (o.h || 7) / floors
  const h = fh * floors
  const c = o.color || '#c9c4b8'
  b.box(0, h / 2, 0, w, h, d, c, 'concrete', 2.4)
  b.box(0, 0.25, 0, w + 0.3, 0.5, d + 0.3, shade(c, 0.78), 'concrete')
  for (let f = 0; f < floors; f += 1) {
    const y = fh * f + fh * 0.55
    for (let x = -w / 2 + 1.6; x <= w / 2 - 1.4; x += 2.6) {
      if (f === 0 && Math.abs(x) < 1.6) continue
      b.win(x, y, d / 2, 1.6, fh * 0.46, '+z')
      b.win(x, y, -d / 2, 1.6, fh * 0.46, '-z')
    }
    for (let z = -d / 2 + 1.6; z <= d / 2 - 1.4; z += 2.6) {
      b.win(w / 2, y, z, 1.6, fh * 0.46, '+x')
      b.win(-w / 2, y, z, 1.6, fh * 0.46, '-x')
    }
    b.box(0, fh * (f + 1) - 0.1, 0, w + 0.2, 0.2, d + 0.2, shade(c, 0.85))
  }
  // The entrance: glass doors under a canopy, steps.
  b.box(0, 1.25, d / 2 + 0.05, 2.6, 2.5, 0.1, '#5a5e62', 'detail', 2, 32)
  b.box(0, 1.2, d / 2 + 0.11, 2.3, 2.3, 0.02, '#2a3a46', 'glass', 2, 32)
  b.box(0, 1.2, d / 2 + 0.13, 0.06, 2.3, 0.02, '#5a5e62', 'detail', 2, 32)
  b.box(0, 2.75, d / 2 + 0.8, 3.6, 0.15, 1.6, shade(c, 0.8))
  b.box(0, 0.1, d / 2 + 1, 3.4, 0.2, 1.4, '#9a968c', 'concrete')
  // Parapet, rooftop plant and a mast.
  b.box(0, h + 0.3, -d / 2 + 0.1, w, 0.6, 0.2, c, 'concrete')
  b.box(0, h + 0.3, d / 2 - 0.1, w, 0.6, 0.2, c, 'concrete')
  b.box(-w / 2 + 0.1, h + 0.3, 0, 0.2, 0.6, d, c, 'concrete')
  b.box(w / 2 - 0.1, h + 0.3, 0, 0.2, 0.6, d, c, 'concrete')
  b.box(-w * 0.22, h + 0.6, 0, 2.2, 1.2, 1.6, '#9aa0a5')
  b.box(-w * 0.22, h + 1.25, 0, 2, 0.1, 1.4, '#6d7176', 'detail', 2, 8)
  b.box(w * 0.25, h + 0.5, -d * 0.2, 1.4, 1, 1.4, '#9aa0a5')
  b.cyl(w * 0.25, h + 1.05, -d * 0.2, 0.5, 0.5, 0.1, '#3a3d40', 10)
  b.box(w * 0.4, h + 2, d * 0.3, 0.08, 4, 0.08, '#5a5e62', 'detail')
  // Downpipes at the corners.
  for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.06), h / 2, d / 2 - 0.3, 0.12, h, 0.12, '#7d8186', 'detail', 2, 8)
}

function wheelsAt(b, xs, track, r = 0.5) {
  for (const x of xs) {
    for (const z of [-track, track]) {
      b.cyl(x, r, z, r, r, 0.35, '#1d1f21', 10, Math.PI / 2)
      b.box(x, r, z + Math.sign(z) * 0.18, r * 0.62, r * 0.62, 0.02, '#5d6266', 'detail', 2, z > 0 ? 32 : 16)
    }
  }
}

/** A lorry with a container on its trailer, cab towards +x. */
function truck(b, o) {
  const cab = o.color || ['#c9452f', '#e8e6df', '#3f6b9a', '#d8a22c'][(o.seed * 4) | 0]
  const box = CONTAINERS[((o.seed || 0.3) * 6) | 0]
  // Chassis and the trailer's bed.
  b.box(0, 0.85, 0, 10, 0.25, 1.1, '#1d1f21')
  b.box(-1.3, 1.12, 0, 7.6, 0.28, 2.4, '#2a2c2e')
  // The cab: body, roof, wind deflector, glass, grille, lights, bumper, mirrors, steps.
  b.box(3.75, 1.95, 0, 2.2, 2.1, 2.45, cab)
  b.box(3.55, 3.06, 0, 1.8, 0.14, 2.3, shade(cab, 0.85))
  // Roof fairing: a thin panel raked up towards the trailer.
  b.geo(new BoxGeometry(1.3, 0.06, 2.2), shade(cab, 0.9), 3.35, 3.42, 0, 0, 0, -0.5)
  for (const sz of [-1, 1]) b.geo(new BoxGeometry(1.2, 0.5, 0.05), shade(cab, 0.8), 3.3, 3.32, sz * 1.08, 0, 0, -0.25)
  b.box(4.86, 2.45, 0, 0.04, 0.85, 2.15, '#22303a', 'glass', 2, 2)
  for (const sz of [-1, 1]) b.box(4.15, 2.45, sz * 1.235, 1.05, 0.72, 0.03, '#22303a', 'glass', 2, sz > 0 ? 32 : 16)
  b.box(4.88, 1.5, 0, 0.05, 0.75, 1.5, '#2a2c2e', 'detail', 2, 2)
  for (let y = 1.2; y < 1.85; y += 0.16) b.box(4.91, y, 0, 0.02, 0.05, 1.45, '#5a5e62', 'detail', 2, 2)
  for (const sz of [-1, 1]) {
    b.box(4.89, 1.12, sz * 0.92, 0.04, 0.22, 0.36, '#f4f0dc', 'detail', 2, 2)
    b.box(4.89, 1.12, sz * 0.62, 0.04, 0.16, 0.16, '#e8a23a', 'detail', 2, 2)
    b.box(4.35, 2.55, sz * 1.5, 0.08, 0.42, 0.12, '#1d1f21', 'detail')
    b.box(4.5, 2.7, sz * 1.36, 0.3, 0.04, 0.04, '#1d1f21', 'detail')
    b.box(3.2, 0.62, sz * 1.25, 0.5, 0.06, 0.25, '#5a5e62', 'detail')
    // Mudguard over the front wheel, the fuel tank behind it.
    b.box(3.6, 1.18, sz * 1.15, 1.35, 0.12, 0.42, '#1d1f21', 'detail')
  }
  b.box(4.97, 0.82, 0, 0.22, 0.32, 2.5, '#3a3d40')
  b.cyl(2.35, 0.95, -1.05, 0.32, 0.32, 1.1, '#aab0b5', 10, 0, Math.PI / 2)
  b.box(2.5, 2.7, 1.02, 0.12, 2, 0.12, '#7d8186', 'detail')
  // The container, doors and locking bars at the back.
  b.box(-1.3, 2.5, 0, 6.1, 2.5, 2.45, box, 'steel', 1.4)
  b.box(-4.37, 2.5, 0, 0.04, 2.35, 2.3, shade(box, 0.82), 'detail', 2, 1)
  for (const sz of [-0.55, 0.55]) b.box(-4.41, 2.5, sz, 0.04, 2.3, 0.06, '#5a5e62', 'detail', 2, 1)
  b.box(-1.3, 3.76, 0, 6.1, 0.04, 2.45, shade(box, 0.9), 'detail', 2, 8)
  // Wheels (with hubs), and mudflaps behind the rear axles.
  wheelsAt(b, [3.6, -2.4, -3.6], 1.1)
  for (const sz of [-1, 1]) b.box(-4.25, 0.55, sz * 1.1, 0.04, 0.6, 0.45, '#1d1f21', 'detail')
}

function railcar(b, o) {
  if (o.type === 'tanker') {
    const c = o.color || '#2a2c2e'
    b.cyl(0, 2.4, 0, 1.4, 1.4, 12, c, 16, 0, Math.PI / 2)
    for (const x of [-6.05, 6.05]) b.geo(new SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, x, 2.4, 0, 0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2, 1, 0.25, 1)
    b.cyl(0, 3.95, 0, 0.5, 0.5, 0.4, '#3a3d40', 10)
    for (const x of [-4, 4]) b.cyl(x, 2.4, 0, 1.43, 1.43, 0.12, '#1d1f21', 16, 0, Math.PI / 2)
    // Walkway and ladder up to the dome.
    b.box(0, 3.85, 0, 2.6, 0.06, 1.2, '#5a5e62', 'detail')
    for (const sz of [-1, 1]) b.box(0, 3.25, sz * 1.48, 0.5, 1.6, 0.04, '#7d8186', 'detail')
    b.box(0, 1.6, 1.46, 3, 0.4, 0.02, '#e8e2d0', 'detail', 2, 32)
  } else {
    const c = o.color || ['#7b4a33', '#5d6b4a', '#6b3f3a'][((o.seed || 0) * 3) | 0]
    b.box(0, 2.3, 0, 13, 2.8, 3, c, 'steel', 1.4)
    b.box(0, 3.75, 0, 13.1, 0.1, 3.1, shade(c, 0.85))
    for (const sz of [-1, 1]) {
      const f = sz > 0 ? 32 : 16
      // The sliding door on its rails, side ribs, the end ladders.
      b.box(0, 2.15, sz * 1.52, 3, 2.3, 0.05, shade(c, 0.78), 'detail', 2, f)
      b.box(0, 3.35, sz * 1.55, 6.4, 0.08, 0.06, '#3a3d40', 'detail', 2, f)
      b.box(0, 0.98, sz * 1.55, 6.4, 0.08, 0.06, '#3a3d40', 'detail', 2, f)
      for (let x = -5.8; x <= 5.81; x += 1.45) if (Math.abs(x) > 1.8) b.box(x, 2.3, sz * 1.52, 0.08, 2.7, 0.04, shade(c, 0.85), 'detail', 2, f)
      for (const x of [-6.2, 6.2]) for (let y = 1.2; y < 3.6; y += 0.4) b.box(x, y, sz * 1.56, 0.4, 0.04, 0.04, '#2a2c2e', 'detail')
      b.box(-4.5, 1.5, sz * 1.53, 1.6, 0.35, 0.02, '#e8e2d0', 'detail', 2, f)
    }
  }
  b.box(0, 0.75, 0, 12.4, 0.35, 2.4, '#26282a')
  for (const x of [-6.35, 6.35]) b.box(x, 0.85, 0, 0.3, 0.25, 0.3, '#3a3d40', 'detail')
  for (const x of [-4.6, 4.6]) {
    b.box(x, 0.5, 0, 2.4, 0.5, 2.2, '#1d1f21')
    wheelsAt(b, [x - 0.7, x + 0.7], 0.75, 0.42)
  }
}

/** Two rails along local x (the ballast and sleepers are painted on the ground). */
function rail(b, o) {
  const len = o.len || 40
  for (const z of [-0.72, 0.72]) b.box(0, 0.1, z, len, 0.14, 0.12, '#7d8186')
}

/** An arched hangar, its doors (local +z) half open on a dark inside. */
function hangar(b, o) {
  const w = o.w || 30
  const d = o.d || 24
  const h = o.h || 11
  const k = h / 11
  const c = o.color || '#8f969b'
  const arch = new CylinderGeometry(1, 1, d, o.small ? 12 : 28, 1, true, -Math.PI / 2, Math.PI)
  b.geo(arch, c, 0, 0, 0, -Math.PI / 2, 0, 0, w / 2, 1, h)
  // (A cylinder lying along z: scaled so the arch is w wide and h tall.)
  for (const z of o.small ? [-d / 4, d / 4] : [-d / 2 + 1, -d / 6, d / 6, d / 2 - 1]) {
    b.geo(new CylinderGeometry(1, 1, 0.35, o.small ? 12 : 28, 1, true, -Math.PI / 2, Math.PI), shade(c, 0.8), 0, 0, z, -Math.PI / 2, 0, 0, w / 2 + 0.08, 1, h + 0.08)
  }
  const face = (z, flip) => b.geo(new CircleGeometry(1, o.small ? 12 : 28, 0, Math.PI), shade(c, 0.92), 0, 0, z, 0, flip ? Math.PI : 0, 0, w / 2, h, 1)
  face(-d / 2, true)
  face(d / 2, false)
  if (o.small) {
    // A Nissen hut: a door and two windows in the end wall, no apron.
    b.box(0, 1.05, d / 2 + 0.03, 1.2, 2.1, 0.08, '#3a2e24')
    for (const sx of [-1, 1]) b.box(sx * w * 0.27, h * 0.45, d / 2 + 0.03, 0.9, 0.7, 0.06, '#2e3e4a')
    return
  }
  b.box(0, 3.6 * k, d / 2 + 0.02, w * 0.62, 7.2 * k, 0.1, '#1b1e21')
  for (const sx of [-1, 1]) b.box(sx * w * 0.36, 3.7 * k, d / 2 + 0.25, w * 0.2, 7.4 * k, 0.3, shade(c, 0.75), 'steel', 1.2)
  b.box(0, 7.7 * k, d / 2 + 0.2, w * 0.74, 0.6 * k, 0.4, '#d4a531')
  b.box(0, 0.08, d / 2 + 4, w * 0.7, 0.16, 8, '#8d8a82', 'concrete')
}

function ctower(b) {
  b.box(0, 7, 0, 6, 14, 6, '#cfcac0', 'concrete', 2.4)
  for (let y = 2.2; y < 13; y += 2.6) b.win(0, y, 3, 1.2, 1.3, '+z')
  b.box(0, 14.3, 0, 8.6, 0.6, 8.6, '#cfcac0', 'concrete')
  // The cab: glass all round between corner posts, a gallery rail, the roof.
  b.box(0, 15.9, 0, 7.8, 2.6, 7.8, '#24323c', 'glass')
  for (const x of [-3.9, 3.9]) for (const z of [-3.9, 3.9]) b.box(x, 15.9, z, 0.25, 2.6, 0.25, '#e8e6df', 'detail')
  for (const t of [-1.3, 1.3]) {
    b.box(t, 15.9, 3.92, 0.08, 2.6, 0.06, '#e8e6df', 'detail', 2, 32)
    b.box(t, 15.9, -3.92, 0.08, 2.6, 0.06, '#e8e6df', 'detail', 2, 16)
    b.box(3.92, 15.9, t, 0.06, 2.6, 0.08, '#e8e6df', 'detail', 2, 2)
    b.box(-3.92, 15.9, t, 0.06, 2.6, 0.08, '#e8e6df', 'detail', 2, 1)
  }
  for (const sz of [-1, 1]) {
    b.box(0, 15.2, sz * 4.25, 8.5, 0.05, 0.05, '#5a5e62', 'detail')
    b.box(sz * 4.25, 15.2, 0, 0.05, 0.05, 8.5, '#5a5e62', 'detail')
  }
  b.box(0, 17.4, 0, 8.8, 0.4, 8.8, '#e8e6df')
  b.box(2.5, 19, 1.5, 0.12, 3, 0.12, '#3a3d40')
  b.box(-2.2, 18.5, -1.8, 0.8, 1.4, 0.8, '#c43a30')
  b.box(-2.2, 19.3, -1.8, 0.2, 0.2, 0.2, '#ff5a3a', 'detail')
  b.box(0, 1.4, 3.06, 2, 2.8, 0.1, '#3a2e24')
  b.box(0, 2.95, 3.4, 2.8, 0.12, 0.8, '#9a968c', 'detail')
}

/** A four-engined transport parked on the apron, nose towards local +x. */
function plane(b) {
  const g = '#9aa1a6'
  const dk = '#6f767b'
  b.cyl(0, 2.8, 0, 2.2, 2.2, 24, g, 16, 0, Math.PI / 2)
  b.geo(new SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), g, 12, 2.8, 0, 0, 0, -Math.PI / 2, 1, 1.6, 1)
  b.cyl(-15, 3.6, 0, 0.7, 2.2, 6, g, 16, 0, Math.PI / 2 + 0.12)
  // Cockpit glazing, the cabin windows down each side, a livery stripe.
  b.geo(new BoxGeometry(1.3, 0.55, 2.6), '#1f2c36', 13.2, 3.75, 0, 0, 0, -0.35)
  for (const sz of [-1, 1]) {
    for (let x = -10; x <= 9; x += 1.6) b.box(x, 3.3, sz * 2.24, 0.42, 0.42, 0.04, '#22303a', 'glass')
    b.box(0, 2.55, sz * 2.24, 21, 0.4, 0.03, '#2f5f8f', 'detail')
    b.box(6, 2.2, sz * 2.24, 0.9, 1.6, 0.03, shade(g, 0.8), 'detail')
  }
  b.box(1.5, 4.9, 0, 5, 0.35, 36, g)
  for (const z of [-11, -6, 6, 11]) {
    b.cyl(3.2, 4.1, z, 0.75, 0.75, 3.4, dk, 12, 0, Math.PI / 2)
    b.cyl(4.95, 4.1, z, 0.85, 0.85, 0.15, '#1d1f21', 12, 0, Math.PI / 2)
    b.box(5.1, 4.1, z, 0.05, 1.9, 0.12, '#3a3d40', 'detail')
    b.box(5.1, 4.1, z, 0.05, 0.12, 1.9, '#3a3d40', 'detail')
  }
  for (const sz of [-1, 1]) b.box(1.5, 5.12, sz * 17.6, 1.2, 0.1, 0.5, sz > 0 ? '#3aa14a' : '#c43a30', 'detail')
  b.box(-16.5, 8, 0, 4.8, 6, 0.45, g)
  b.box(-17, 5.4, 0, 3.4, 0.3, 12, g)
  b.box(-16.6, 9.5, 0, 2.6, 2.2, 0.5, '#3f6b9a')
  for (const z of [-2.3, 2.3]) {
    b.box(0, 0.7, z, 1.6, 1.4, 1.2, '#2a2c2e')
    b.box(0, 1.6, z * 0.95, 2.2, 0.6, 0.6, dk, 'detail')
  }
  b.box(10, 0.6, 0, 0.5, 1.2, 0.5, '#2a2c2e')
  // Chocks, a crew ladder at the door.
  b.box(6.4, 1, 2.6, 0.9, 0.06, 0.6, '#5a5e62', 'detail')
  for (const sz of [-1, 1]) b.box(6.4 + sz * 0.4, 0.75, 3, 0.06, 1.5, 0.06, '#d8a22c', 'detail')
}

let jetGeo = null
function fighter(b) {
  if (!jetGeo) {
    const all = buildVehicleGeometries()
    jetGeo = all.jet
    for (const [k, gg] of Object.entries(all)) {
      if (k === 'jet') continue
      for (const part of [gg.body, gg.top, gg.trim]) part?.dispose()
    }
  }
  b.geo(jetGeo.clone(), null, 0, 1.5, 0, 0, Math.PI / 2, 0)
  for (const x of [2.5, -1.5]) b.box(x, 0.55, 0, 0.3, 1.1, 0.3, '#2a2c2e')
}

function radar(b) {
  b.box(0, 1.2, 0, 3, 2.4, 3, '#cfcac0', 'concrete')
  b.box(0, 6, 0, 0.8, 8, 0.8, '#5a5e62')
  for (let y = 3; y < 10; y += 1.6) b.box(0, y, 0, 1.2, 0.12, 1.2, '#5a5e62')
  b.geo(new SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), '#e8e6df', 0, 10.4, 0.6, -1.0, 0, 0)
  b.box(0, 10.4, 1.4, 0.15, 0.15, 2.4, '#3a3d40')
}

/** A U of hesco walls round a parked aircraft (open towards local +z). */
function revetment(b) {
  const sand = '#b9a57a'
  const cube = (x, z) => b.box(x, 1.6, z, 1.2, 3.2, 1.2, shade(sand, v(x + z, 1, 0.16)))
  for (let x = -7.4; x <= 7.41; x += 1.233) cube(x, -7)
  for (let z = -5.8; z <= 7; z += 1.233) {
    cube(-7.4, z)
    cube(7.4, z)
  }
}

function windsock(b) {
  b.box(0, 3, 0, 0.12, 6, 0.12, '#cfcac0')
  b.geo(new CylinderGeometry(0.15, 0.4, 2.2, 10, 1, true), '#ff7a2e', 1.1, 5.7, 0, 0, 0, Math.PI / 2 - 0.15)
}

/** A flat-roofed adobe house: parapet, beam ends, framed windows and shutters, a door on the front (+z). */
function house(b, o) {
  const w = o.w || 8
  const d = o.d || 8
  const fh = o.h || 3.6
  const floors = o.floors || 1
  const c = o.color || ['#c9a77c', '#d2b48a', '#bf9a6e', '#d8c09a'][((o.seed || 0) * 4) | 0]
  const shutter = ['#3f6f99', '#5a7a4a', '#7a4a32', '#2f5f6f'][((o.seed || 0) * 7) % 4 | 0]
  const wood = '#6b4a2e'
  for (let f = 0; f < floors; f += 1) {
    const s = 1 - f * 0.22
    const fw = w * s
    const fd = d * s
    const x = f ? -w * 0.11 : 0
    const y0 = fh * f
    b.box(x, y0 + fh / 2, 0, fw, fh, fd, c, 'plain')
    for (const [px, pz, pw, pd] of [
      [x, -fd / 2 + 0.12, fw, 0.24],
      [x, fd / 2 - 0.12, fw, 0.24],
      [x - fw / 2 + 0.12, 0, 0.24, fd],
      [x + fw / 2 - 0.12, 0, 0.24, fd],
    ])
      b.box(px, y0 + fh + 0.25, pz, pw, 0.5, pd, shade(c, 0.95))
    for (let bx = -fw / 2 + 0.8; bx < fw / 2 - 0.4; bx += 1.3) b.box(x + bx, y0 + fh - 0.45, fd / 2 + 0.2, 0.18, 0.18, 0.4, '#5a4632', 'detail')
    // Windows: dark glass in a wooden frame, a shutter folded back beside each.
    const y = y0 + fh * 0.6
    for (const wx of [-fw * 0.28, fw * 0.28]) {
      if (f === 0 && Math.abs(x + wx - 0.6) < 0.9) continue
      b.win(x + wx, y, fd / 2, 0.75, 0.85, '+z', { glass: '#1f2a30', frame: wood })
      b.box(x + wx - 0.62, y, fd / 2 + 0.04, 0.42, 0.95, 0.05, shutter, 'detail', 2, 32)
    }
    for (const wz of [-fd * 0.2, fd * 0.2]) {
      b.win(x + fw / 2, y, wz, 0.75, 0.85, '+x', { glass: '#1f2a30', frame: wood })
      b.win(x - fw / 2, y, wz, 0.75, 0.85, '-x', { glass: '#1f2a30', frame: wood })
    }
    // A rain spout off the roof.
    b.box(x + fw / 2 - 0.5, y0 + fh - 0.1, fd / 2 + 0.3, 0.14, 0.14, 0.6, '#8a6a46', 'detail')
  }
  // The door in its frame, a step, a lamp over it.
  b.box(0.6, 1.1, d / 2 + 0.02, 1.3, 2.25, 0.04, shade(c, 0.85), 'detail', 2, 32)
  b.box(0.6, 1.05, d / 2 + 0.06, 1.1, 2.1, 0.08, wood)
  b.box(0.6, 2.25, d / 2 + 0.06, 1.4, 0.18, 0.12, '#5a4632')
  b.box(0.6, 0.08, d / 2 + 0.45, 1.6, 0.16, 0.7, shade(c, 0.85), 'detail')
  b.box(0.6, 2.6, d / 2 + 0.14, 0.18, 0.22, 0.16, '#fff0c8', 'detail')
  if (o.awning) {
    b.box(-w * 0.25, 2.4, d / 2 + 0.9, w * 0.4, 0.08, 1.8, o.awning)
    for (const ax of [-w * 0.43, -w * 0.07]) b.box(ax, 1.2, d / 2 + 1.7, 0.08, 2.4, 0.08, '#5a4632')
  }
  // Roof clutter: a water tank, a satellite dish, an AC unit on the wall (by seed).
  const top = fh * floors
  const rx = floors > 1 ? -w * 0.11 : 0
  const pick = ((o.seed || 0) * 13) % 3 | 0
  if (pick === 0) b.cyl(rx + w * 0.18, top + 0.55, -d * 0.15, 0.55, 0.55, 1.1, '#3a4a5a', 10)
  if (pick !== 2) {
    b.geo(new SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.35), '#e8e6df', rx - w * 0.2, top + 0.65, d * 0.1, -0.9, 0, 0)
    b.box(rx - w * 0.2, top + 0.3, d * 0.1, 0.06, 0.6, 0.06, '#5a5e62', 'detail')
  }
  b.box(w / 2 + 0.22, fh * 0.75, -d * 0.25, 0.42, 0.55, 0.8, '#d8d6cf', 'detail', 2, 2)
  b.box(w / 2 + 0.44, fh * 0.75, -d * 0.25, 0.02, 0.4, 0.4, '#5a5e62', 'detail', 2, 2)
  // Two-storey houses: an outside stair to the upper floor.
  if (floors > 1) for (let k = 0; k < 6; k += 1) b.box(w / 2 + 0.55, 0.3 + k * 0.6, d / 2 - 0.6 - k * 0.5, 0.9, 0.12, 0.5, shade(c, 0.85))
}

function domehouse(b, o) {
  house(b, { ...o, w: o.w || 9, d: o.d || 9, h: 4.5 })
  b.box(0, 4.75, 0, 4.4, 0.5, 4.4, shade(o.color || '#d9cfb8', 0.95))
  b.geo(new SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), o.dome || '#e3d9c2', 0, 5, 0)
}

/** A market stall: a cloth awning on four poles over a table of goods. */
function stall(b, o) {
  const cloth = o.color || ['#c43a30', '#e0b23a', '#3f7aa8', '#5c8a3a', '#e8e6df'][((o.seed || 0) * 5) | 0]
  for (const x of [-1.4, 1.4]) for (const z of [-0.8, 1.6]) b.box(x, 1.2, z, 0.08, 2.4 + (z < 0 ? 0.3 : 0), 0.08, '#5a4632')
  b.geo(new BoxGeometry(3.2, 0.06, 2.8), cloth, 0, 2.55, 0.4, 0.12, 0, 0)
  b.box(0, 0.45, 0.6, 3, 0.9, 1.2, '#7a5c3c')
  for (let k = 0; k < 4; k += 1) b.box(-1.05 + k * 0.7, 1.05, 0.6, 0.55, 0.3, 0.8, ['#e07a2e', '#c43a30', '#e0c03a', '#6a9a3a'][(k + ((o.seed || 0) * 7) | 0) % 4])
}

function watertower(b) {
  for (const x of [-1.8, 1.8]) for (const z of [-1.8, 1.8]) b.box(x, 5.5, z, 0.3, 11, 0.3, '#6b6f72')
  for (const y of [3.5, 7.5]) {
    b.bar(-1.8, y - 2, -1.8, 1.8, y + 2, -1.8, 0.1, '#6b6f72')
    b.bar(-1.8, y - 2, 1.8, 1.8, y + 2, 1.8, 0.1, '#6b6f72')
  }
  b.cyl(0, 12.6, 0, 2.7, 2.7, 3.2, '#9aa0a5', 18)
  b.geo(new ConeGeometry(2.8, 1, 18), '#7d8186', 0, 14.7, 0)
  b.box(2.75, 7, 0, 0.1, 14, 0.5, '#4a4e52')
}

function well(b) {
  b.cyl(0, 0.45, 0, 1.1, 1.1, 0.9, '#a3967e', 14)
  b.cyl(0, 0.9, 0, 0.85, 0.85, 0.05, '#1e2a30', 14)
  for (const x of [-1, 1]) b.box(x, 1.4, 0, 0.12, 1.9, 0.12, '#5a4632')
  b.box(0, 2.35, 0, 2.3, 0.12, 0.12, '#5a4632')
}

function loaddock(b, o) {
  const w = o.w || 20
  b.box(0, 0.6, 0, w, 1.2, 4, '#9e9a90', 'concrete')
  b.box(0, 1.21, 1.95, w, 0.02, 0.12, '#e0b23a')
  for (let x = -w / 2 + 2; x < w / 2; x += 4.2) b.box(x, 0.7, 2.06, 0.6, 0.5, 0.14, '#1d1f21')
  b.box(-w / 2 - 0.9, 0.3, 1, 1.8, 0.6, 1.2, '#9e9a90', 'concrete')
}

function pallets(b, o) {
  b.box(0, 0.08, 0, 1.4, 0.16, 1.2, '#8a6a46')
  const n = 1 + (((o.seed || 0.5) * 3) | 0)
  for (let k = 0; k < n; k += 1) b.box(0, 0.16 + 0.32 * k + 0.16, 0, 1.25, 0.32, 1.05, k % 2 ? '#b08a5a' : '#a37c4e')
}

function fence(b, o) {
  const len = o.len || 20
  const c = '#7d8186'
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 3) b.box(x, 1.2, 0, 0.08, 2.4, 0.08, c)
  for (const y of [0.15, 1.2, 2.35]) b.box(0, y, 0, len, 0.04, 0.04, c)
  b.box(0, 1.25, 0, len, 2.2, 0.01, '#6d7176')
}

function lamp(b) {
  b.box(0, 3.7, 0, 0.18, 7.4, 0.18, '#5a5e62')
  b.box(0.9, 7.35, 0, 1.8, 0.12, 0.12, '#5a5e62')
  b.box(1.7, 7.2, 0, 0.6, 0.18, 0.35, '#fff2c8')
}

// --- Jungle -----------------------------------------------------------------------------

const WOOD = '#6b4e34'
const WOOD_DARK = '#4a3626'

/** A plank bridge over a river gap, length along local x; `rope` makes it a footbridge. */
function bridge(b, o) {
  const len = o.len || 16
  const w = o.w || 6
  b.box(0, 0.09, 0, len, 0.12, w, WOOD)
  for (let x = -len / 2 + 0.45; x < len / 2; x += 0.9) b.box(x, 0.155, 0, 0.06, 0.012, w - 0.1, WOOD_DARK)
  for (const z of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(0, -0.12, z, len, 0.3, 0.3, WOOD_DARK)
  for (const x of [-2.6, 2.6]) for (const z of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(x, -0.4, z, 0.35, 0.8, 0.35, WOOD_DARK)
  const rc = o.rope ? '#a08a5a' : WOOD
  const t = o.rope ? 0.05 : 0.1
  for (const z of [-w / 2 + 0.06, w / 2 - 0.06]) {
    for (let x = -len / 2 + 0.1; x <= len / 2; x += 2) b.box(x, 0.7, z, 0.12, 1.1, 0.12, WOOD_DARK)
    b.box(0, 1.22, z, len, t, t, rc)
    b.box(0, 0.75, z, len, t, t, rc)
  }
}

/** A hut on stilts: plank walls, a veranda and ladder at the front (+z), a thatched roof. */
function stilthut(b, o) {
  const w = o.w || 6
  const d = o.d || 5
  const fy = 1.8
  const wall = o.color || ['#8a6a44', '#7d6040', '#94744c'][((o.seed || 0) * 3) | 0]
  for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 + 1.5]) b.box(x, fy / 2, z, 0.25, fy, 0.25, WOOD_DARK)
  b.box(0, fy + 0.1, 0.8, w + 0.4, 0.2, d + 2, '#5e4630')
  b.box(0, fy + 1.4, 0, w, 2.4, d, wall)
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.75) b.box(x, fy + 1.4, d / 2 + 0.02, 0.07, 2.4, 0.04, shade(wall, 0.72))
  b.box(0.8, fy + 1.15, d / 2 + 0.05, 1, 1.9, 0.06, '#3a2a1c')
  b.box(-w * 0.28, fy + 1.6, d / 2 + 0.05, 1, 0.7, 0.06, '#2a1e14')
  for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.03), fy + 1.6, 0, 0.06, 0.7, 1.1, '#2a1e14')
  b.box(0, fy + 0.75, d / 2 + 1.75, w, 0.08, 0.08, WOOD)
  for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.05), fy + 1.4, d / 2 + 1.7, 0.15, 2.6, 0.15, WOOD_DARK)
  const roof = new ConeGeometry(1, 1, 4)
  roof.rotateY(Math.PI / 4)
  b.geo(roof, o.roof || '#b39a5a', 0, fy + 3.6, 0.8, 0, 0, 0, (w / 2 + 0.9) / 0.7071, 2.1, ((d + 2) / 2 + 0.6) / 0.7071)
  const lx = w / 2 - 1.3
  for (const dx of [0, 0.6]) b.bar(lx + dx, 0, d / 2 + 3, lx + dx, fy + 0.2, d / 2 + 1.8, 0.07, WOOD_DARK)
  for (let k = 1; k < 4; k += 1) b.box(lx + 0.3, (fy * k) / 4, d / 2 + 3 - (1.2 * k) / 4, 0.6, 0.06, 0.06, WOOD_DARK)
}

/** A palisade of sharpened logs along local x, two rails behind. */
function palisade(b, o) {
  const len = o.len || 10
  let k = 0
  for (let x = -len / 2 + 0.2; x <= len / 2 - 0.15; x += 0.42) {
    const h = 2.6 + hash(x + (o.seed || 0) * 9, k) * 0.4
    const c = shade('#6b5038', 0.85 + hash(k, x) * 0.3)
    // Three-sided open logs and tips: 9 triangles a log (palisades run for metres).
    b.geo(new CylinderGeometry(0.23, 0.23, h, 3, 1, true), c, x, h / 2, 0, 0, k * 1.3, 0)
    b.geo(new ConeGeometry(0.23, 0.45, 3, 1, true), '#5a4430', x, h + 0.22, 0, 0, k * 1.3, 0)
    k += 1
  }
  for (const y of [0.8, 2]) b.box(0, y, -0.27, len, 0.15, 0.12, WOOD_DARK)
}

/** An overgrown temple ruin on its stone plinth: broken pillars, walls, a fallen column. */
function ruins(b) {
  const S = '#8f8a7a'
  const M = '#5f6e46'
  b.box(0, 0.12, 0, 12, 0.24, 12, '#8a8474', 'concrete')
  b.box(0, 0.06, 6.5, 4, 0.12, 1, '#8a8474', 'concrete')
  for (const [x, z, h] of [[-4.5, -4.5, 3.8], [4.5, -4.5, 2], [-4.5, 4.5, 1.2], [4.5, 4.5, 3.4]]) {
    b.box(x, h / 2, z, 1.2, h, 1.2, S, 'concrete')
    b.box(x, h + 0.04, z, 1.25, 0.08, 1.25, M)
  }
  b.box(-4.5, 4, -4.5, 1.6, 0.4, 1.6, S, 'concrete')
  b.box(-1.5, 1.3, -5.2, 3, 2.6, 0.9, S, 'concrete')
  b.box(1.5, 0.9, -5.2, 3, 1.8, 0.9, S, 'concrete')
  b.box(-5.2, 0.8, 0.5, 0.9, 1.6, 5, S, 'concrete')
  for (const [x, y, z, w, h, d] of [[-1.5, 2.64, -5.2, 3, 0.08, 0.95], [1.5, 1.84, -5.2, 3, 0.08, 0.95], [-5.2, 1.64, 0.5, 0.95, 0.08, 5]]) b.box(x, y, z, w, h, d, M)
  b.cyl(1.5, 0.5, 1.5, 0.5, 0.5, 3, S, 8, 0, Math.PI / 2)
  for (const [x, z, h] of [[-2.4, -4.72, 1.8], [-0.6, -4.72, 1.2], [2.2, -4.72, 1.1], [-4.72, -0.8, 1.2], [-4.72, 2, 0.9]]) {
    const top = z < -4 ? (x < 0 ? 2.6 : 1.8) : 1.6
    b.box(x, top - h / 2, z, z < -4 ? 0.3 : 0.06, h, z < -4 ? 0.06 : 0.3, '#4e6e38')
  }
}

/** A river patrol boat, bow towards +x. */
function boat(b) {
  const H = '#4a5a48'
  b.box(-0.6, 0.35, 0, 7.8, 0.9, 2.8, H)
  b.geo(new BoxGeometry(1.98, 0.9, 1.98), H, 3.3, 0.35, 0, 0, Math.PI / 4, 0)
  b.box(-0.4, 0.82, 0, 8, 0.05, 2.6, '#6b6f64')
  b.box(-0.5, 1.4, 0, 2.6, 1.2, 2, '#5a6a56')
  b.box(0.82, 1.6, 0, 0.04, 0.45, 1.7, '#1e2a30', 'glass', 2, 2)
  for (const sz of [-1, 1]) b.box(-0.5, 1.6, sz * 1.02, 2, 0.4, 0.03, '#1e2a30', 'glass')
  b.box(-3.1, 1.95, 0, 2.4, 0.08, 2.4, '#3f4f3a')
  for (const x of [-4.1, -2.1]) for (const z of [-1.1, 1.1]) b.box(x, 1.4, z, 0.08, 1.1, 0.08, '#2a2c2e')
  b.cyl(2.5, 1.05, 0, 0.25, 0.3, 0.45, '#2a2c2e', 8)
  b.bar(2.5, 1.35, 0, 3.8, 1.5, 0, 0.1, '#1d1f21')
  for (const sz of [-1, 1]) b.box(-0.6, 0.95, sz * 1.42, 7.6, 0.12, 0.06, '#2a2c2e', 'detail')
  b.box(-0.5, 2.35, 0, 0.06, 0.8, 0.06, '#5a5e62', 'detail')
}

// --- Scrapyard --------------------------------------------------------------------------

const RUSTS = ['#8a5a3c', '#7a4a2e', '#946646', '#6e5240', '#7d6448']
const SCRAP = ['#7a4a2e', '#8a5a3c', '#5e4636', '#6d6a64', '#9a7a4a', '#5d7a8a', '#8a3f30', '#4e4a44']

/** Corrugated sheet panels on posts along local x, each panel rusted its own shade. */
function sheetwall(b, o) {
  const len = o.len || 12
  const n = Math.max(1, Math.round(len / 3))
  const pw = len / n
  for (let i = 0; i < n; i += 1) {
    const x = -len / 2 + pw * (i + 0.5)
    const c = RUSTS[(hash(x + (o.seed || 0) * 5, i) * RUSTS.length) | 0]
    b.box(x, 1.4 + (i % 2) * 0.06, 0, pw - 0.05, 2.8, 0.1, c, 'steel', 1.2)
  }
  for (let i = 0; i <= n; i += 1) b.box(-len / 2 + pw * i, 1.45, -0.12, 0.14, 2.9, 0.14, '#4a3a2e')
}

/** A heap of scrap: a dirt-and-rust mound with plates, beams and pipes sticking out. */
function scrapheap(b, o) {
  const r = o.r || 4
  const s = (o.seed || 0.3) * 100
  const hh = r * 0.8
  b.geo(new ConeGeometry(r, hh, 8), '#5a4434', 0, hh / 2, 0)
  for (let k = 0; k < 22; k += 1) {
    const a = hash(s, k) * Math.PI * 2
    const t = Math.sqrt(hash(s + 1, k)) * r * 0.85
    const y = hh * (1 - t / r) + 0.1
    const c = SCRAP[(hash(s + 2, k) * SCRAP.length) | 0]
    const rx = (hash(s + 3, k) - 0.5) * 1.6
    const ry = hash(s + 4, k) * Math.PI
    const rz = (hash(s + 5, k) - 0.5) * 1.6
    if (k % 4 === 3) b.geo(new CylinderGeometry(0.18, 0.18, 1.6 + hash(s + 6, k) * 1.6, 6), c, Math.cos(a) * t, y, Math.sin(a) * t, rx + 1.2, ry, rz)
    else b.geo(new BoxGeometry(1 + hash(s + 6, k) * 1.4, 0.15 + hash(s + 7, k) * 0.35, 0.7 + hash(s + 8, k) * 1), c, Math.cos(a) * t, y, Math.sin(a) * t, rx, ry, rz)
  }
}

/** Crushed cars stacked `n` high. */
function carstack(b, o) {
  const n = o.n || 3
  const s = (o.seed || 0.5) * 50
  const paints = ['#7a3a30', '#3f5a6e', '#8a8a82', '#5a6a3a', '#a8842e', '#4a4a4e', '#8a5a3c']
  for (let k = 0; k < n; k += 1) {
    const c = paints[(hash(s, k) * paints.length) | 0]
    const y = 0.36 + k * 0.72
    const ox = (hash(s + 1, k) - 0.5) * 0.4
    const ry = (hash(s + 2, k) - 0.5) * 0.12
    b.geo(new BoxGeometry(4, 0.7, 1.85), c, ox, y, 0, 0, ry, 0)
    b.geo(new BoxGeometry(2.6, 0.16, 1.88), '#26292c', ox + 0.2, y + 0.12, 0, 0, ry, 0)
  }
}

/** A car crusher: a steel chamber with a crushed car in it, the ram housing and its cab. */
function crusher(b) {
  const Y = '#c49a32'
  b.box(0, 0.3, 0, 9, 0.6, 3.6, '#3a3d40')
  for (const z of [-1.5, 1.5]) b.box(-1, 1.8, z, 6, 2.4, 0.6, Y, 'steel', 1.2)
  b.box(-4.1, 1.8, 0, 0.6, 2.4, 3.6, Y, 'steel', 1.2)
  b.box(3, 1.9, 0, 3, 2.6, 3.4, shade(Y, 0.9), 'steel', 1.2)
  for (const z of [-0.9, 0.9]) b.cyl(1, 2.2, z, 0.25, 0.25, 2.4, '#9aa0a5', 8, 0, Math.PI / 2)
  b.box(-1.2, 1.05, 0, 3.6, 0.9, 2.2, '#7a3a30')
  b.box(3.6, 3.95, 1.1, 1.6, 1.5, 1.4, '#c9c4b8')
  b.box(3.6, 4.1, 1.82, 1.3, 0.6, 0.04, '#22303a', 'glass', 2, 32)
  b.box(4.42, 4.1, 1.1, 0.04, 0.6, 1, '#22303a', 'glass', 2, 2)
  b.geo(new BoxGeometry(6, 0.12, 2.6), shade(Y, 0.8), -1, 3.4, -2.4, 0.9, 0, 0)
  // Hazard stripes, a warning light, the hydraulic hoses.
  for (let x = -3.6; x < 1.6; x += 0.8) b.box(x, 3.05, 1.82, 0.4, 0.12, 0.02, '#1d1f21', 'detail', 2, 32)
  b.box(4.2, 4.82, 1.1, 0.2, 0.25, 0.2, '#f0a020', 'detail')
  b.bar(2, 1.4, 1.75, 0.5, 2.6, 1.8, 0.06, '#1d1f21')
}

/** A crawler crane with a lattice boom swinging a scrap magnet out along local +x. */
function magnet(b) {
  const Y = '#c4952e'
  for (const z of [-1.4, 1.4]) b.box(0, 0.5, z, 5, 1, 0.9, '#2a2c2e')
  b.box(-0.3, 1.9, 0, 4.2, 1.8, 3.2, Y, 'steel', 1.2)
  b.box(-2.4, 1.9, 0, 1, 1.6, 3, '#3a3d40')
  b.box(1.2, 3.4, 1, 1.6, 1.6, 1.2, Y)
  b.box(2.02, 3.55, 1, 0.04, 0.8, 1, '#1e2a30')
  const tip = [12, 15]
  for (const z of [-0.6, 0.6]) b.bar(1.4, 2.8, z, tip[0], tip[1], z * 0.4, 0.22, Y)
  for (let k = 1; k < 7; k += 1) {
    const f0 = (k - 1) / 7
    const f1 = k / 7
    const p = (f) => [1.4 + (tip[0] - 1.4) * f, 2.8 + (tip[1] - 2.8) * f, 0.6 - 0.36 * f]
    const [x0, y0, z0] = p(f0)
    const [x1, y1, z1] = p(f1)
    b.bar(x0, y0, z0, x1, y1, -z1, 0.08, Y)
  }
  for (const z of [-1, 1]) b.bar(-1.5, 2.8, z, -0.5, 6, 0, 0.12, '#3a3d40')
  b.bar(-0.5, 6, 0, tip[0], tip[1], 0, 0.06, '#2a2c2e')
  b.bar(tip[0], tip[1], 0, tip[0], 6.6, 0, 0.05, '#2a2c2e')
  b.cyl(tip[0], 6.3, 0, 1.1, 1.1, 0.6, '#2a2c2e', 12)
}

/** A portacabin site office raised on blocks, door and steps on the front (+z). */
function cabin(b, o) {
  const c = o.color || ['#d6d2c4', '#8fa8b8', '#b8a88a'][((o.seed || 0) * 3) | 0]
  for (const x of [-2.6, 2.6]) for (const z of [-1, 1]) b.box(x, 0.15, z, 0.5, 0.3, 0.5, '#8d8a82', 'concrete')
  b.box(0, 1.6, 0, 6, 2.6, 2.5, c, 'steel', 1.4)
  b.box(0, 2.95, 0, 6.2, 0.1, 2.7, shade(c, 0.8))
  for (const x of [-1.8, 0.2]) b.win(x, 1.9, 1.25, 1.3, 0.8, '+z', { frame: '#e8e6df', sill: false })
  b.win(-3, 1.9, 0, 0.9, 0.7, '-x', { frame: '#e8e6df', sill: false })
  b.box(2, 1.4, 1.27, 0.9, 2, 0.05, '#4a4e52')
  b.box(2.3, 1.4, 1.31, 0.06, 0.06, 0.06, '#c9c4b8', 'detail')
  b.box(2, 0.3, 1.75, 1.1, 0.6, 0.9, '#8d8a82', 'concrete')
  b.box(2.6, 0.9, 1.9, 0.05, 0.9, 0.05, '#5a5e62', 'detail')
  b.box(-2.4, 2.4, -1.4, 0.7, 0.5, 0.3, '#d8d6cf', 'detail', 2, 16)
}

/** Four stacks of old tyres. */
function tyres(b, o) {
  const s = (o.seed || 0.5) * 30
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.65, 0.65]) {
      const n = 2 + ((hash(s + x, z) * 3) | 0)
      for (let k = 0; k < n; k += 1) b.cyl(x, 0.14 + k * 0.29, z, 0.44, 0.44, 0.28, '#1d1f21', 6)
    }
  }
}

// --- Army base --------------------------------------------------------------------------

/** A long barracks block, ridge along local x, framed windows and a door on the front (+z). */
function barracks(b, o) {
  const w = o.w || 16
  const d = o.d || 7
  const c = o.color || '#c9c0a4'
  b.box(0, 0.2, 0, w + 0.3, 0.4, d + 0.3, '#8d8a82', 'concrete')
  b.box(0, 1.8, 0, w, 2.8, d, c)
  b.roof(0, 3.2, 0, d + 1.2, w + 0.8, 1.8, o.roof || '#5d6650', true)
  for (let x = -w / 2 + 1.6; x < w / 2 - 1; x += 2.4) {
    if (Math.abs(x) < 1.2) continue
    b.win(x, 2.1, d / 2, 1.1, 0.95, '+z')
    b.win(x, 2.1, -d / 2, 1.1, 0.95, '-z')
  }
  for (const sx of [-1, 1]) b.win(sx * (w / 2), 2.1, 0, 1, 0.9, sx > 0 ? '+x' : '-x')
  b.box(0, 1.5, d / 2 + 0.02, 1.4, 2.25, 0.04, '#e6e1d6', 'detail', 2, 32)
  b.box(0, 1.45, d / 2 + 0.06, 1.2, 2.1, 0.08, '#4a3a2a')
  b.box(0, 0.25, d / 2 + 0.6, 2, 0.5, 1, '#8d8a82', 'concrete')
  b.box(0, 2.85, d / 2 + 0.75, 2.2, 0.08, 1.2, '#5d6650', 'detail')
  b.box(0, 2.6, d / 2 + 0.2, 0.2, 0.2, 0.15, '#fff0c8', 'detail')
  // Gutters along the eaves, downpipes, vent pipes through the roof, a sign by the door.
  for (const sz of [-1, 1]) {
    b.box(0, 3.15, sz * (d / 2 + 0.62), w + 0.8, 0.12, 0.14, '#6d7176', 'detail')
    for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.25), 1.6, sz * (d / 2 + 0.62), 0.1, 3.1, 0.1, '#6d7176', 'detail')
  }
  for (const x of [-w * 0.3, w * 0.15]) b.box(x, 4.3, -d * 0.18, 0.18, 1, 0.18, '#3a3d40', 'detail')
  b.box(1.6, 2.2, d / 2 + 0.04, 1, 0.5, 0.04, '#2f4a2f', 'detail', 2, 32)
}

function flagpole(b, o) {
  b.box(0, 0.25, 0, 1.6, 0.5, 1.6, '#8d8a82', 'concrete')
  b.cyl(0, 5.2, 0, 0.06, 0.1, 9.6, '#cfcac0', 6)
  b.geo(new BoxGeometry(2.2, 1.3, 0.04), o.color || '#3f6fb0', 1.15, 9.2, 0, 0, 0, -0.06)
}

/** An assault-course wall: planks between two posts, a rope over the top. */
function climbwall(b) {
  b.box(0, 1.5, 0, 4, 3, 0.25, '#7a5c3c')
  for (let y = 0.4; y < 3; y += 0.5) b.box(0, y, 0.13, 4, 0.04, 0.02, WOOD_DARK)
  for (const x of [-2.1, 2.1]) b.box(x, 1.7, 0, 0.25, 3.4, 0.3, WOOD_DARK)
  b.bar(0.6, 3, 0.14, 0.8, 0.3, 0.9, 0.05, '#c8b48a')
}

function hurdle(b) {
  for (const x of [-1.4, 1.4]) b.box(x, 0.5, 0, 0.15, 1, 0.15, WOOD_DARK)
  b.cyl(0, 0.85, 0, 0.12, 0.12, 3, '#8a6a44', 6, 0, Math.PI / 2)
}

/** A rifle range: an earth berm behind a row of targets on posts (targets towards +z). */
function range(b, o) {
  const len = o.len || 20
  b.geo(new BoxGeometry(len, 2.5, 3), '#6b5a3c', 0, 1.25, 0)
  b.geo(new BoxGeometry(len, 0.4, 2.2), '#5d6b3a', 0, 2.6, 0)
  for (let x = -len / 2 + 2; x < len / 2 - 1; x += 3) {
    b.box(x, 0.6, 2.2, 0.08, 1.2, 0.08, WOOD_DARK)
    b.box(x, 1.5, 2.2, 1, 1.2, 0.05, '#e8e2d0')
    b.box(x, 1.55, 2.23, 0.45, 0.45, 0.02, '#b8352c')
  }
}

/** An open shelter: a flat steel roof on posts (a motor pool or firing point). */
function shelter(b, o) {
  const w = o.w || 12
  const d = o.d || 6
  for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) b.box(x, 2, z, 0.2, 4, 0.2, '#5a5e62')
  b.geo(new BoxGeometry(w + 0.6, 0.12, d + 0.6), o.color || '#6f7a66', 0, 4.05, 0, 0.05, 0, 0)
  b.box(0, 3.8, 0, w, 0.18, 0.18, '#5a5e62')
}

// --- Desert -----------------------------------------------------------------------------

/** An old mud-brick fort: crenellated walls with a gate in each, round towers at the corners. */
function fort(b, o) {
  const L = (o.s || 26) / 2
  const g = 2
  const C = o.color || '#b8956a'
  const seg = (L - g) / 2 + g
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      b.box(t * seg, 2.5, s * L, L - g, 5, 1.2, C, 'concrete', 3)
      b.box(s * L, 2.5, t * seg, 1.2, 5, L - g, C, 'concrete', 3)
      for (let k = 0.5; k < L - g; k += 1.6) {
        b.box(t * (g + k), 5.3, s * L, 0.8, 0.6, 1.2, shade(C, 0.95))
        b.box(s * L, 5.3, t * (g + k), 1.2, 0.6, 0.8, shade(C, 0.95))
      }
    }
    b.box(0, 4.6, s * (L + 0.1), g * 2 + 0.6, 0.8, 1.4, shade(C, 0.9))
    b.box(s * (L + 0.1), 4.6, 0, 1.4, 0.8, g * 2 + 0.6, shade(C, 0.9))
  }
  for (const x of [-L, L]) {
    for (const z of [-L, L]) {
      b.cyl(x, 3.5, z, 2.1, 2.3, 7, C, 10)
      b.cyl(x, 7.2, z, 2.3, 2.3, 0.5, shade(C, 0.92), 10)
      b.box(x + (x < 0 ? 2.3 : -2.3), 5.2, z, 0.06, 0.8, 0.4, '#3a2c1e')
    }
  }
}

/** A big canvas tent: a low ridge roof on poles, sides rolled up. */
function bigtent(b, o) {
  const w = o.w || 9
  const d = o.d || 6
  const c = o.color || '#8a7a5a'
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) b.box(x, 0.9, z, 0.1, 1.8, 0.1, WOOD_DARK)
  b.roof(0, 1.8, 0, d + 0.6, w + 0.4, 1.4, c, true)
  b.box(0, 0.25, -d / 2, w, 0.5, 0.05, shade(c, 0.8))
}

// --- Snow -------------------------------------------------------------------------------

/** A log cabin under a snow-laden roof, a stone chimney, lit windows; door on the front (+z). */
function logcabin(b, o) {
  const w = o.w || 8
  const d = o.d || 6
  const c = o.color || '#6e4e34'
  b.box(0, 1.5, 0, w, 3, d, c)
  for (let y = 0.3; y < 3; y += 0.38) {
    for (const sz of [-1, 1]) b.box(0, y, sz * (d / 2 + 0.02), w + 0.3, 0.06, 0.04, shade(c, 0.7), 'detail', 2, sz > 0 ? 32 : 16)
    for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.02), y, 0, 0.04, 0.06, d + 0.3, shade(c, 0.7), 'detail', 2, sx > 0 ? 2 : 1)
  }
  // Log ends crossing at the corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 + 0.1), 1.5, sz * (d / 2 + 0.1), 0.3, 3, 0.3, shade(c, 0.85))
  b.roof(0, 2.9, 0, w + 1.2, d + 1, 1.9, '#4a3a2c')
  b.roof(0, 3.05, 0, w + 1.1, d + 0.9, 1.85, '#f2f5f7')
  b.box(0, 2.95, d / 2 + 0.52, w + 1.1, 0.1, 0.06, '#e8f0f6', 'detail')
  b.box(w * 0.28, 4.1, -d * 0.18, 0.9, 2.6, 0.9, '#7d7a76')
  b.box(w * 0.28, 5.45, -d * 0.18, 1, 0.12, 1, '#f2f5f7')
  // Door, lit windows in frames, a porch with its posts, firewood stacked by the wall.
  b.box(-w * 0.18, 1.15, d / 2 + 0.02, 1.2, 2.15, 0.04, '#4a3424', 'detail', 2, 32)
  b.box(-w * 0.18, 1.1, d / 2 + 0.07, 1, 2, 0.08, '#3a2a1c')
  for (const x of [w * 0.15, w * 0.36]) b.win(x, 1.7, d / 2, 0.9, 0.8, '+z', { glass: '#ffcf7a', frame: '#4a3424' })
  for (const sx of [-1, 1]) b.win(sx * (w / 2), 1.7, 0, 0.8, 0.7, sx > 0 ? '+x' : '-x', { glass: '#ffcf7a', frame: '#4a3424' })
  b.box(0, 0.08, d / 2 + 0.9, w * 0.5, 0.16, 1.4, '#5e4630')
  for (const sx of [-1, 1]) b.box(sx * w * 0.24, 1.25, d / 2 + 1.5, 0.15, 2.5, 0.15, '#4a3424', 'detail')
  b.box(0, 2.5, d / 2 + 0.95, w * 0.55, 0.1, 1.3, '#f2f5f7')
  for (let k = 0; k < 3; k += 1) b.cyl(-w / 2 - 0.4, 0.2 + k * 0.32, -d * 0.2, 0.16, 0.16, 1.6, k % 2 ? '#8a6a44' : '#7a5a3a', 6, Math.PI / 2)
}

/** A radar dome on its equipment building. */
function radome(b) {
  b.box(0, 1.5, 0, 6, 3, 6, '#c9c4b8', 'concrete')
  b.box(0, 1.1, 3.03, 1.2, 2.2, 0.06, '#4a4e52')
  b.geo(new SphereGeometry(3.4, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), '#eef0f2', 0, 4.4, 0)
  b.box(0, 3.08, 0, 6.2, 0.16, 6.2, '#f2f5f7')
}

/** A snowcat: twin tracks, a red cab with glass all round, a plough blade on the front (+x). */
function snowcat(b) {
  for (const z of [-1.05, 1.05]) {
    b.box(0, 0.45, z, 4.4, 0.9, 0.7, '#26282a')
    for (let x = -1.8; x <= 1.8; x += 0.9) b.cyl(x, 0.45, z, 0.32, 0.32, 0.72, '#3a3d40', 6, Math.PI / 2)
  }
  b.box(-0.3, 1.25, 0, 3.6, 0.7, 2, '#c43a30')
  b.box(0.3, 2.1, 0, 2.2, 1.1, 1.9, '#c43a30')
  b.box(1.42, 2.15, 0, 0.04, 0.7, 1.6, '#22303a', 'glass', 2, 2)
  for (const sz of [-1, 1]) b.box(0.3, 2.15, sz * 0.97, 1.8, 0.6, 0.04, '#22303a', 'glass')
  b.box(1.43, 1.4, 0, 0.04, 0.2, 1.4, '#f4f0dc', 'detail', 2, 2)
  b.box(0.3, 2.72, 0, 1.4, 0.12, 0.6, '#f0a020', 'detail', 2, 8)
  b.box(2.6, 0.55, 0, 0.2, 1, 2.8, '#d8a22c')
  b.box(-1.9, 1.85, 0, 0.6, 0.12, 1.6, '#3a3d40')
  b.box(-0.6, 2.75, 0, 1.2, 0.08, 1.7, '#5a5e62', 'detail')
}

// --- Coast ------------------------------------------------------------------------------

/** A concrete gun casemate: firing slit and gun barrel on the front (+z), a thick roof. */
function casemate(b) {
  const C = '#a9a598'
  b.box(0, 1.4, 0, 8, 2.8, 6, C, 'concrete', 2.5)
  b.box(0, 2.95, 0.4, 9, 0.5, 7, shade(C, 0.95), 'concrete', 2.5)
  b.box(0, 1.6, 3.02, 4.6, 0.7, 0.06, '#15181a')
  b.cyl(0, 1.6, 4.4, 0.16, 0.2, 3, '#3a3d40', 8, Math.PI / 2)
  b.box(-2.8, 1, -3.02, 1, 2, 0.06, '#3a3d40')
  for (const [x, z, w, d] of [[-2, -1, 2.6, 1.8], [2.2, 1.4, 2, 1.6]]) b.box(x, 3.22, z, w, 0.04, d, '#7f8a62')
}

/** A landing craft beached with its ramp down at the bow (+x); walk in up the ramp. */
function landingcraft(b) {
  const H = '#5d6b5a'
  b.box(0, 0.12, 0, 12, 0.24, 4.6, shade(H, 0.8))
  for (const z of [-2.1, 2.1]) b.box(0, 1, z, 12, 2, 0.4, H, 'steel', 1.2)
  b.box(-5.8, 1.6, 0, 0.4, 3.2, 4.6, H, 'steel', 1.2)
  b.box(-5, 3.6, 0, 2, 1.6, 2.4, shade(H, 1.1))
  b.box(-3.98, 3.8, 0, 0.04, 0.5, 2, '#1e2a30', 'glass', 2, 2)
  b.geo(new BoxGeometry(2.4, 0.15, 4), shade(H, 0.9), 7.1, 0.55, 0, 0, 0, -0.42)
  for (const z of [-1.9, 1.9]) b.box(-5.9, 2.4, z, 0.1, 1.2, 0.1, '#2a2c2e')
  // Hull number, cleats along the gunwales, a mast with a light.
  for (const sz of [-1, 1]) {
    b.box(-2, 1.3, sz * 2.31, 1.4, 0.6, 0.02, '#e8e6df', 'detail', 2, sz > 0 ? 32 : 16)
    for (const x of [-3.5, 0, 3.5]) b.box(x, 2.06, sz * 2.1, 0.4, 0.12, 0.2, '#2a2c2e', 'detail')
  }
  b.box(-5, 5.1, 0, 0.08, 1.4, 0.08, '#3a3d40', 'detail')
  b.box(-5, 5.85, 0, 0.16, 0.16, 0.16, '#ffd98a', 'detail')
}

/** Barbed wire: posts every 2.5 m with crossed coils between. */
function wire(b, o) {
  const len = o.len || 10
  const n = Math.max(1, Math.round(len / 2.5))
  const step = len / n
  for (let i = 0; i <= n; i += 1) b.box(-len / 2 + i * step, 0.55, 0, 0.08, 1.1, 0.08, '#4a3a2e')
  for (let i = 0; i < n; i += 1) {
    const x0 = -len / 2 + i * step
    b.bar(x0, 0.1, -0.3, x0 + step, 1, 0.3, 0.03, '#5a5e62')
    b.bar(x0, 1, -0.3, x0 + step, 0.1, 0.3, 0.03, '#5a5e62')
    b.bar(x0, 0.55, 0.3, x0 + step, 0.55, -0.3, 0.03, '#5a5e62')
  }
}

// --- Town ruins -------------------------------------------------------------------------

/** A shelled apartment block: broken walls round a gutted inside, rebar, a rubble spill. */
function ruinblock(b, o) {
  const w = o.w || 10
  const d = o.d || 8
  const h = o.h || 7
  const c = o.color || ['#b9b2a2', '#a8a294', '#c4b8a0', '#9c9a92'][((o.seed || 0) * 4) | 0]
  const fw = w / 2 - 1.3
  const walls = [
    [0, -d / 2, w, 0.4, h],
    [-w / 2, 0, 0.4, d, h * 0.8],
    [w / 2, 0, 0.4, d, h * 0.5],
    [-(fw / 2 + 1.3), d / 2, fw, 0.4, h * 0.7],
    [fw / 2 + 1.3, d / 2, fw, 0.4, h * 0.4],
  ]
  for (const [x, z, ww, dd, hh] of walls) {
    b.box(x, hh / 2, z, ww, hh, dd, c, 'concrete', 2.6)
    // Windows: dark holes on the outer face, one per bay and floor.
    const along = ww > dd
    const span = along ? ww : dd
    for (let y = 1.7; y < hh - 0.6; y += 3) {
      for (let t = -span / 2 + 1.4; t < span / 2 - 0.8; t += 2.6) {
        const nx = along ? x + t : x + Math.sign(x || 1) * 0.22
        const nz = along ? z + Math.sign(z || 1) * 0.22 : z + t
        b.box(nx, y, nz, along ? 1.1 : 0.04, 1.2, along ? 0.04 : 1.1, '#1d1f21')
      }
    }
  }
  // What's left of the first floor and the roof slab: a corner each.
  b.box(-w * 0.2, 3.1, -d * 0.2, w * 0.6, 0.25, d * 0.6, shade(c, 0.85), 'concrete')
  b.box(-w * 0.3, h - 0.1, -d * 0.3, w * 0.4, 0.25, d * 0.4, shade(c, 0.85), 'concrete')
  for (const [x, z] of [[w * 0.1, -d * 0.1], [-w * 0.42, d * 0.05], [w * 0.47, -d * 0.3]]) b.bar(x, 3.2, z, x + 0.3, 4.2, z + 0.2, 0.05, '#6b4a34')
  const s = (o.seed || 0.4) * 60
  for (let k = 0; k < 7; k += 1) {
    const x = w * 0.15 + hash(s, k) * w * 0.4
    const z = d / 2 + 0.6 + hash(s + 1, k) * 1.4
    b.geo(new BoxGeometry(0.6 + hash(s + 2, k) * 0.9, 0.3 + hash(s + 3, k) * 0.4, 0.5 + hash(s + 4, k) * 0.7), shade(c, 0.8 + hash(s + 5, k) * 0.2), x, 0.2, z, hash(s + 6, k), hash(s + 7, k) * 3, 0)
  }
}

/** A shelled church: the nave under a part-fallen roof, stained glass, the tower broken off at the top. */
function church(b) {
  const C = '#b8ad98'
  const STAINED = ['#2f4f8f', '#8f2f3a', '#b8902f', '#2f6f4f']
  b.box(0, 3.5, -2, 10, 7, 16, C, 'concrete', 3)
  b.roof(0, 7, -5, 10.8, 10, 3.6, '#6e5a4a')
  b.box(0, 7, 3, 10, 0.3, 0.4, shade(C, 0.8))
  let k = 0
  for (let z = -8; z < 5; z += 3.2) {
    for (const sx of [-1, 1]) {
      b.win(sx * 5, 3.6, z, 1, 2.4, sx > 0 ? '+x' : '-x', { glass: STAINED[k % 4], frame: shade(C, 0.8), sill: true })
      b.box(sx * 5.06, 5, z, 0.06, 0.5, 0.7, shade(C, 0.8), 'detail', 2, sx > 0 ? 1 : 2)
      k += 1
    }
  }
  // Buttresses along the nave.
  for (let z = -9.6; z < 6; z += 3.2) for (const sx of [-1, 1]) b.box(sx * 5.3, 2.2, z, 0.6, 4.4, 0.7, shade(C, 0.9), 'concrete')
  b.box(0, 7, 8, 4.4, 14, 4.4, C, 'concrete', 3)
  b.box(0, 14.3, 8, 4.8, 0.5, 4.8, shade(C, 0.9))
  for (const sx of [-1, 1]) b.box(sx * 2.22, 11.5, 8, 0.06, 2, 1, '#1d1f21')
  b.box(0, 11.5, 10.22, 1, 2, 0.06, '#1d1f21')
  // The rose window over the door, the door in a pointed frame.
  b.cyl(0, 7.5, 10.22, 0.9, 0.9, 0.04, '#7a3a5a', 12, Math.PI / 2)
  b.cyl(0, 7.5, 10.26, 0.55, 0.55, 0.04, '#b8902f', 8, Math.PI / 2)
  b.box(0, 1.7, 10.22, 2, 3.5, 0.04, shade(C, 0.8), 'detail', 2, 32)
  b.box(0, 1.6, 10.27, 1.6, 3.2, 0.1, '#4a3a2a')
  b.geo(new BoxGeometry(3, 1.2, 2.5), shade(C, 0.85), 2.5, 0.5, 4.6, 0.3, 0.6, 0.2)
}

/** A burnt-out bus, front towards +x: blackened shell, empty window frames, rims on the ground. */
function bus(b, o) {
  const c = o.color || '#5a4a3e'
  b.box(0, 1.65, 0, 11, 2.3, 2.5, c)
  b.box(0, 2.2, 0, 10.4, 0.8, 2.54, '#141516')
  b.box(5.52, 2, 0, 0.04, 1.2, 2.2, '#141516')
  b.box(0, 2.85, 0, 10.6, 0.1, 2.3, '#2a2420')
  for (const sz of [-1, 1]) {
    // Window pillars, scorch and rust down the sides.
    for (let x = -4.8; x <= 4.81; x += 1.2) b.box(x, 2.2, sz * 1.275, 0.12, 0.8, 0.03, shade(c, 0.6), 'detail', 2, sz > 0 ? 32 : 16)
    b.box(-1, 1.55, sz * 1.27, 5, 0.9, 0.02, '#3a2a20', 'detail', 2, sz > 0 ? 32 : 16)
    b.box(3, 1, sz * 1.27, 2.2, 0.5, 0.02, '#7a4a2e', 'detail', 2, sz > 0 ? 32 : 16)
  }
  b.box(4.3, 1.55, 1.27, 0.9, 1.9, 0.03, '#141516', 'detail', 2, 32)
  b.box(5.6, 0.75, 0, 0.2, 0.3, 2.4, '#2a2c2e')
  for (const sz of [-1, 1]) b.box(5.55, 1.1, sz * 0.95, 0.04, 0.2, 0.3, '#3a3a36', 'detail', 2, 2)
  for (const x of [3.6, -3.4]) for (const sz of [-1, 1]) b.cyl(x, 0.32, sz * 1.05, 0.32, 0.32, 0.28, '#3a3532', 10, Math.PI / 2)
}

// --- Warehouse interior -----------------------------------------------------------------

/**
 * A warehouse's wall from inside (interior face +z): corrugated panels on a concrete
 * kerb, blue steel columns every 6 m, a strip of high windows, roller doors at `doors`.
 */
function shedwall(b, o) {
  const len = o.len || 20
  const h = o.h || 8
  const panel = o.color || '#9aa3a8'
  b.box(0, h / 2, 0, len, h, 0.3, panel, 'steel', 1.2)
  b.box(0, 0.5, 0.2, len, 1, 0.5, '#8d8a82', 'concrete')
  const doors = o.doors || []
  for (let x = -len / 2 + 3; x <= len / 2 - 2.9; x += 6) {
    b.box(x, h / 2, 0.3, 0.36, h, 0.3, '#2f5a8f')
    b.box(x, h / 2, 0.47, 0.5, h, 0.04, '#3a6aa0', 'detail', 2, 32)
  }
  for (let x = -len / 2 + 6; x < len / 2 - 1; x += 6) {
    if (doors.some((d) => Math.abs(d - x) < 3)) continue
    b.box(x, h - 1.4, 0.17, 4.6, 1.1, 0.04, '#2a3a46', 'glass', 2, 32)
    b.box(x, h - 2.02, 0.22, 4.8, 0.08, 0.14, '#cfd3d6', 'detail')
  }
  // Roller doors: shutter, guide rails, the motor box, hazard stripes on the posts.
  for (const x of doors) {
    b.box(x, 2.4, 0.2, 4.4, 4.8, 0.08, '#c8c4b8', 'steel', 0.6)
    b.box(x, 5.05, 0.32, 4.8, 0.5, 0.5, '#7d8186')
    for (const sx of [-1, 1]) {
      b.box(x + sx * 2.3, 2.5, 0.28, 0.14, 5, 0.14, '#5a5e62', 'detail')
      for (let y = 0.3; y < 1.6; y += 0.4) b.box(x + sx * 2.55, y, 0.36, 0.3, 0.2, 0.06, y % 0.8 < 0.4 ? '#e0b23a' : '#1d1f21', 'detail', 2, 32)
    }
  }
}

/** A steel roof truss spanning along local x at height `h` (no roof on it: the camera looks in from above). */
function truss(b, o) {
  const len = o.len || 40
  const h = o.h || 8
  const rise = 2.2
  const c = '#4a6a8a'
  b.bar(-len / 2, h, 0, len / 2, h, 0, 0.22, c)
  b.bar(-len / 2, h, 0, 0, h + rise, 0, 0.2, c)
  b.bar(0, h + rise, 0, len / 2, h, 0, 0.2, c)
  const n = b.lite ? 4 : 8
  for (let k = 1; k < n; k += 1) {
    const x = -len / 2 + (len * k) / n
    const top = h + rise * (1 - Math.abs(x) / (len / 2))
    b.bar(x, h, 0, x, top, 0, 0.1, c)
    if (k < n - 1) {
      const x2 = -len / 2 + (len * (k + 1)) / n
      const top2 = h + rise * (1 - Math.abs(x2) / (len / 2))
      b.bar(x, h, 0, x2, top2, 0, 0.08, c)
    }
  }
  // A row of hanging lights under it.
  for (let x = -len / 2 + len / 8; x < len / 2; x += len / 4) {
    b.box(x, h - 0.6, 0, 0.04, 1.2, 0.04, '#2a2c2e', 'detail')
    b.box(x, h - 1.25, 0, 1.4, 0.12, 0.35, '#e8e6df', 'detail')
    b.box(x, h - 1.33, 0, 1.3, 0.04, 0.28, '#fff6d8', 'detail')
  }
}

const GOODS = ['#b08a5a', '#a37c4e', '#c9b48e', '#e8e6df', '#3f6f99', '#8a3f30', '#5d7a4a']

/** Pallet racking along local x: blue uprights, orange beams, three levels of loaded pallets. */
function rack(b, o) {
  const len = o.len || 12
  const s = (o.seed || 0.4) * 80
  const bays = Math.max(1, Math.round(len / 2.8))
  const bw = len / bays
  for (let i = 0; i <= bays; i += 1) {
    const x = -len / 2 + i * bw
    for (const z of [-0.5, 0.5]) b.box(x, 2.3, z, 0.09, 4.6, 0.09, '#2f5a8f')
    if (!b.lite) b.bar(x, 0.4, -0.5, x, 4.2, 0.5, 0.04, '#2f5a8f')
  }
  for (const y of [0.15, 1.6, 3.05]) {
    for (const z of [-0.5, 0.5]) b.box(0, y, z, len, 0.12, 0.08, '#e07a20')
    b.box(0, y + 0.07, 0, len, 0.02, 1, '#7d8186', 'detail', 2, 8)
    for (let i = 0; i < bays; i += 1) {
      const k = hash(s + i, y * 3)
      if (k < 0.12) continue
      const x = -len / 2 + (i + 0.5) * bw
      const gh = y > 3 ? 0.9 : 1.15
      const c = GOODS[(k * GOODS.length * 7) % GOODS.length | 0]
      if (k > 0.85) {
        for (const dx of [-0.35, 0.35]) for (const dz of [-0.22, 0.22]) b.cyl(x + dx * bw * 0.6, y + 0.2 + 0.45, dz, 0.22, 0.22, 0.9, '#2f5f8f', 8)
      } else b.box(x, y + 0.2 + gh / 2, 0, bw * 0.76, gh, 0.9, c)
    }
  }
}

/** A counterbalance forklift, forks towards +x. */
function forklift(b, o) {
  const Y = o.color || '#e0b23a'
  b.box(-0.2, 0.75, 0, 1.9, 0.8, 1.15, Y)
  b.box(-1.0, 0.95, 0, 0.5, 1.1, 1.15, '#3a3d40')
  b.box(-0.35, 1.25, 0, 0.6, 0.15, 0.6, '#1d1f21')
  b.box(-0.55, 1.6, 0, 0.12, 0.6, 0.55, '#1d1f21')
  for (const x of [-0.95, 0.45]) for (const z of [-0.5, 0.5]) b.box(x, 1.7, z, 0.07, 1.9, 0.07, '#2a2c2e')
  b.box(-0.25, 2.65, 0, 1.55, 0.06, 1.1, '#2a2c2e')
  for (const z of [-0.35, 0.35]) b.box(0.85, 1.6, z, 0.1, 3.2, 0.1, '#3a3d40')
  b.box(0.92, 0.55, 0, 0.08, 0.9, 0.95, '#3a3d40')
  for (const z of [-0.3, 0.3]) b.box(1.45, 0.08, z, 1.1, 0.06, 0.12, '#2a2c2e')
  b.box(0.2, 1.05, 0.59, 0.5, 0.3, 0.02, '#1d1f21', 'detail', 2, 32)
  b.box(-0.55, 2.75, 0, 0.18, 0.12, 0.18, '#f0a020', 'detail')
  wheelsAt(b, [-0.75, 0.55], 0.5, 0.3)
}

/**
 * An enterable building (sim/setpieces.js bldgLayout): rendered walls with lintels over
 * the doorways and windows (open, no glass: you shoot through them), a floor, the
 * partition, furniture, and a flat roof with a parapet on the cutaway roof mesh.
 */
function bldg(b, o) {
  const L = bldgLayout(o)
  const { t, doorH, winTop } = BLDG
  const c = o.color || ['#d6cfc0', '#cfc6b2', '#c9c2b6', '#d8d2c6'][((o.seed || 0) * 4) | 0]
  const trim = shade(c, 0.78)
  const h = L.h
  // Floor inside, a plinth round the outside.
  b.box(0, 0.035, 0, L.w - 2 * t, 0.07, L.d - 2 * t, o.floor || '#8b7d66', 'plain', 2, 8)
  for (const [x, z, w, d] of [
    [0, -L.d / 2 - 0.12, L.w + 0.48, 0.24],
    [0, L.d / 2 + 0.12, L.w + 0.48, 0.24],
    [-L.w / 2 - 0.12, 0, 0.24, L.d],
    [L.w / 2 + 0.12, 0, 0.24, L.d],
  ])
    b.box(x, 0.12, z, w, 0.24, d, trim, 'concrete', 2, 8)
  for (const wl of L.walls) b.box(wl.x, wl.h / 2, wl.z, wl.w, wl.h, wl.d, c, 'plain', 2, 8)
  for (const op of L.openings) {
    const alongX = op.side === 'n' || op.side === 's'
    const top = op.kind === 'door' ? doorH : winTop
    const lw = alongX ? op.along : t
    const ld = alongX ? t : op.along
    // The wall over the opening.
    b.box(op.x, (top + h) / 2, op.z, lw, h - top, ld, c, 'plain', 2, 0)
    // Frame: a head and two jambs, proud of the wall.
    const fw = alongX ? op.along + 0.16 : t + 0.08
    const fd = alongX ? t + 0.08 : op.along + 0.16
    b.box(op.x, top + 0.06, op.z, fw, 0.12, fd, trim, 'detail')
    for (const s of [-1, 1]) {
      const jx = alongX ? op.x + s * (op.along / 2 + 0.04) : op.x
      const jz = alongX ? op.z : op.z + s * (op.along / 2 + 0.04)
      const base = op.kind === 'door' ? 0 : BLDG.sill
      b.box(jx, (base + top) / 2, jz, alongX ? 0.08 : t + 0.08, top - base, alongX ? t + 0.08 : 0.08, trim, 'detail')
    }
    if (op.kind === 'win') b.box(op.x, BLDG.sill + 0.03, op.z, alongX ? op.along + 0.2 : t + 0.16, 0.06, alongX ? t + 0.16 : op.along + 0.2, trim, 'detail')
  }
  // Furniture.
  for (const f of L.furniture) {
    if (f.kind === 'table') {
      b.box(f.x, f.h - 0.04, f.z, f.w, 0.08, f.d, '#6b4a2e')
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(f.x + sx * (f.w / 2 - 0.08), (f.h - 0.08) / 2, f.z + sz * (f.d / 2 - 0.08), 0.08, f.h - 0.08, 0.08, '#5a3e26', 'detail')
    } else if (f.kind === 'shelf') {
      for (const sx of [-1, 1]) b.box(f.x + sx * (f.w / 2 - 0.03), f.h / 2, f.z, 0.06, f.h, f.d, '#5a5e62')
      for (let k = 0; k < 4; k += 1) b.box(f.x, 0.2 + k * 0.55, f.z, f.w, 0.04, f.d, '#7d8186')
      for (let k = 0; k < 3; k += 1) b.box(f.x - 0.4 + k * 0.4, 0.42 + k * 0.55, f.z, 0.3, 0.3, f.d * 0.8, ['#8a6a46', '#3f6b4a', '#a8462f'][k], 'detail')
    } else {
      b.box(f.x, f.h / 2, f.z, f.w, f.h, f.d, '#9a7a4e')
    }
  }
  // The roof: a slab with a parapet (the cutaway mesh).
  const rc = o.roof || shade(c, 0.88)
  b.box(0, h + 0.1, 0, L.w + 0.2, 0.2, L.d + 0.2, rc, 'cut', 2, 0)
  for (const [x, z, w, d] of [
    [0, -L.d / 2, L.w + 0.2, 0.2],
    [0, L.d / 2, L.w + 0.2, 0.2],
    [-L.w / 2, 0, 0.2, L.d],
    [L.w / 2, 0, 0.2, L.d],
  ])
    b.box(x, h + 0.45, z, w, 0.5, d, c, 'cut', 2, 0)
}

const DRAW = {
  bldg,
  shedwall,
  truss,
  rack,
  forklift,
  barracks,
  flagpole,
  climbwall,
  hurdle,
  range,
  shelter,
  fort,
  bigtent,
  logcabin,
  radome,
  snowcat,
  casemate,
  landingcraft,
  wire,
  ruinblock,
  church,
  bus,
  crane,
  ship,
  tug,
  tank,
  lighthouse,
  office,
  truck,
  railcar,
  rail,
  hangar,
  ctower,
  plane,
  fighter,
  radar,
  revetment,
  windsock,
  house,
  domehouse,
  stall,
  watertower,
  well,
  loaddock,
  pallets,
  fence,
  lamp,
  bridge,
  stilthut,
  palisade,
  ruins,
  boat,
  sheetwall,
  scrapheap,
  carstack,
  crusher,
  magnet,
  cabin,
  tyres,
}

/** Every set of `map` as three geometries ({ plain, concrete, steel }), or null if none. */
export function buildSetGeometries(map, { lite = false } = {}) {
  if (!map.sets?.length) return null
  const b = new SetBuilder()
  // LOW: the busiest kinds leave out their finest structure.
  b.lite = lite
  map.sets.forEach(([kind, x, z, rot = 0, opts = {}], i) => {
    const draw = DRAW[kind]
    if (!draw) return
    const seed = hash(x * 0.37 + i, z * 0.53 - i)
    b.begin(x, z, rot, seed)
    draw(b, { seed, ...opts })
  })
  if (jetGeo) {
    jetGeo.dispose()
    jetGeo = null
  }
  return b.build()
}
