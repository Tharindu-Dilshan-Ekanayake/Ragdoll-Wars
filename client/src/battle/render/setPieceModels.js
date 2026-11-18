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

import { rotLocal } from '../sim/setpieces'
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

class SetBuilder {
  constructor() {
    this.concrete = new BoxBatch()
    this.steel = new BoxBatch()
    this.plainBoxes = new BoxBatch()
    this.extra = []
    this.ox = 0
    this.oz = 0
    this.rot = 0
    this.seed = 0
  }

  begin(x, z, rot, seed) {
    this.ox = x
    this.oz = z
    this.rot = rot & 3
    this.seed = seed
  }

  /** A box in the set's frame (centre lx, ly, lz; size w, h, d). */
  box(lx, ly, lz, w, h, d, color, mat = 'plain', uv = 2) {
    const [rx, rz] = rotLocal(lx, lz, this.rot)
    const odd = this.rot & 1
    const batch = mat === 'concrete' ? this.concrete : mat === 'steel' ? this.steel : this.plainBoxes
    batch.box(this.ox + rx, ly, this.oz + rz, odd ? d : w, h, odd ? w : d, typeof color === 'string' ? tmpC.set(color).clone() : color, uv)
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
    this.extra.push(geom)
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

  build() {
    const indexed = this.plainBoxes.build()
    const plainBox = indexed.toNonIndexed()
    indexed.dispose()
    plainBox.deleteAttribute('uv')
    const parts = [plainBox, ...this.extra].filter((g) => g.attributes.position.count > 0)
    const plain = parts.length ? mergeGeometries(parts) : null
    for (const g of parts) g.dispose()
    return { plain, concrete: this.concrete.build(), steel: this.steel.build() }
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
  b.box(sx + 4.05, hullTop + 7.2, 0, 0.1, 1.2, 9.2, '#2b3a44')
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
  b.box(0.8, 4.2, 0, 0.1, 0.8, 3, '#2b3a44')
  b.box(-3.4, 5.6, 0, 1.2, 1.6, 1.2, '#1f2326')
  for (const z of [-2.4, 2.4]) b.box(-1, 1.6, z, 9, 0.5, 0.25, '#1a1a1a')
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
  b.cyl(0, 15.4, 0, 2, 2, 0.3, '#3a3d40', 16)
  b.cyl(0, 16.6, 0, 1.1, 1.1, 2.1, '#ffe9a8', 12)
  b.geo(new ConeGeometry(1.4, 1.4, 12), '#c43a30', 0, 18.4, 0)
}

/** A concrete office block, windows in rows, the door on the front (+z). */
function office(b, o) {
  const w = o.w || 14
  const d = o.d || 9
  const floors = o.floors || 2
  const fh = (o.h || 7) / floors
  const h = fh * floors
  const c = o.color || '#c9c4b8'
  b.box(0, h / 2, 0, w, h, d, c, 'concrete', 2.4)
  for (let f = 0; f < floors; f += 1) {
    const y = fh * f + fh * 0.58
    for (let x = -w / 2 + 1.6; x <= w / 2 - 1.4; x += 2.6) {
      for (const sz of [-1, 1]) b.box(x, y, sz * (d / 2 + 0.04), 1.6, fh * 0.42, 0.08, '#2e3e4a')
    }
    for (let z = -d / 2 + 1.6; z <= d / 2 - 1.4; z += 2.6) for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.04), y, z, 0.08, fh * 0.42, 1.6, '#2e3e4a')
    b.box(0, fh * (f + 1) - 0.1, 0, w + 0.2, 0.2, d + 0.2, shade(c, 0.85))
  }
  b.box(0, 1.2, d / 2 + 0.06, 2.2, 2.4, 0.1, '#3a2e24')
  b.box(0, 2.7, d / 2 + 0.7, 3.2, 0.15, 1.4, shade(c, 0.8))
  // Parapet and rooftop plant.
  b.box(0, h + 0.3, -d / 2 + 0.1, w, 0.6, 0.2, c, 'concrete')
  b.box(0, h + 0.3, d / 2 - 0.1, w, 0.6, 0.2, c, 'concrete')
  b.box(-w / 2 + 0.1, h + 0.3, 0, 0.2, 0.6, d, c, 'concrete')
  b.box(w / 2 - 0.1, h + 0.3, 0, 0.2, 0.6, d, c, 'concrete')
  b.box(-w * 0.22, h + 0.6, 0, 2.2, 1.2, 1.6, '#9aa0a5')
  b.box(w * 0.25, h + 0.5, -d * 0.2, 1.4, 1, 1.4, '#9aa0a5')
}

function wheelsAt(b, xs, track, r = 0.5) {
  for (const x of xs) for (const z of [-track, track]) b.cyl(x, r, z, r, r, 0.35, '#1d1f21', 10, Math.PI / 2)
}

/** A lorry with a container on its trailer, cab towards +x. */
function truck(b, o) {
  const cab = o.color || ['#c9452f', '#e8e6df', '#3f6b9a', '#d8a22c'][(o.seed * 4) | 0]
  b.box(3.6, 1.8, 0, 2.4, 2.4, 2.5, cab)
  b.box(4.85, 2.2, 0, 0.1, 1, 2.2, '#2b3a44')
  b.box(-1.2, 1.1, 0, 7.4, 0.3, 2.3, '#2a2c2e')
  b.box(-1.2, 2.5, 0, 6.1, 2.5, 2.45, CONTAINERS[((o.seed || 0.3) * 6) | 0], 'steel', 1.4)
  wheelsAt(b, [3.6, -2.4, -3.6], 1.1)
}

function railcar(b, o) {
  if (o.type === 'tanker') {
    b.cyl(0, 2.4, 0, 1.4, 1.4, 12, o.color || '#2a2c2e', 16, 0, Math.PI / 2)
    b.cyl(0, 3.95, 0, 0.5, 0.5, 0.4, '#3a3d40', 10)
  } else {
    const c = o.color || ['#7b4a33', '#5d6b4a', '#6b3f3a'][((o.seed || 0) * 3) | 0]
    b.box(0, 2.3, 0, 13, 2.8, 3, c, 'steel', 1.4)
    b.box(0, 2.1, 1.52, 3, 2.2, 0.06, shade(c, 0.75))
    b.box(0, 3.75, 0, 13.1, 0.1, 3.1, shade(c, 0.85))
  }
  b.box(0, 0.75, 0, 12.4, 0.35, 2.4, '#26282a')
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
  const h = 11
  const c = o.color || '#8f969b'
  const arch = new CylinderGeometry(1, 1, d, 28, 1, true, -Math.PI / 2, Math.PI)
  b.geo(arch, c, 0, 0, 0, -Math.PI / 2, 0, 0, w / 2, 1, h)
  // (A cylinder lying along z: scaled so the arch is w wide and h tall.)
  for (const z of [-d / 2 + 1, -d / 6, d / 6, d / 2 - 1]) {
    b.geo(new CylinderGeometry(1, 1, 0.35, 28, 1, true, -Math.PI / 2, Math.PI), shade(c, 0.8), 0, 0, z, -Math.PI / 2, 0, 0, w / 2 + 0.08, 1, h + 0.08)
  }
  const face = (z, flip) => b.geo(new CircleGeometry(1, 28, 0, Math.PI), shade(c, 0.92), 0, 0, z, 0, flip ? Math.PI : 0, 0, w / 2, h, 1)
  face(-d / 2, true)
  face(d / 2, false)
  b.box(0, 3.6, d / 2 + 0.02, w * 0.62, 7.2, 0.1, '#1b1e21')
  for (const sx of [-1, 1]) b.box(sx * w * 0.36, 3.7, d / 2 + 0.25, w * 0.2, 7.4, 0.3, shade(c, 0.75), 'steel', 1.2)
  b.box(0, 7.7, d / 2 + 0.2, w * 0.74, 0.6, 0.4, '#d4a531')
  b.box(0, 0.08, d / 2 + 4, w * 0.7, 0.16, 8, '#8d8a82', 'concrete')
}

function ctower(b) {
  b.box(0, 7, 0, 6, 14, 6, '#cfcac0', 'concrete', 2.4)
  for (let y = 2; y < 13; y += 2.6) b.box(0, y, 3.04, 1.2, 1.4, 0.08, '#2e3e4a')
  b.box(0, 14.3, 0, 8.6, 0.6, 8.6, '#cfcac0', 'concrete')
  b.box(0, 15.9, 0, 8, 2.6, 8, '#3b5566')
  b.box(0, 17.4, 0, 8.8, 0.4, 8.8, '#e8e6df')
  b.box(2.5, 19, 1.5, 0.12, 3, 0.12, '#3a3d40')
  b.box(-2.2, 18.5, -1.8, 0.8, 1.4, 0.8, '#c43a30')
  b.box(0, 1.4, 3.06, 2, 2.8, 0.1, '#3a2e24')
}

/** A four-engined transport parked on the apron, nose towards local +x. */
function plane(b) {
  const g = '#9aa1a6'
  const dk = '#6f767b'
  b.cyl(0, 2.8, 0, 2.2, 2.2, 24, g, 16, 0, Math.PI / 2)
  b.geo(new SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), g, 12, 2.8, 0, 0, 0, -Math.PI / 2, 1, 1.6, 1)
  b.cyl(-15, 3.6, 0, 0.7, 2.2, 6, g, 16, 0, Math.PI / 2 + 0.12)
  b.box(13.3, 3.6, 0, 1.2, 0.6, 3.2, '#2b3a44')
  b.box(1.5, 4.9, 0, 5, 0.35, 36, g)
  for (const z of [-11, -6, 6, 11]) {
    b.cyl(3.2, 4.1, z, 0.75, 0.75, 3.4, dk, 12, 0, Math.PI / 2)
    b.cyl(4.95, 4.1, z, 0.85, 0.85, 0.15, '#1d1f21', 12, 0, Math.PI / 2)
  }
  b.box(-16.5, 8, 0, 4.8, 6, 0.45, g)
  b.box(-17, 5.4, 0, 3.4, 0.3, 12, g)
  b.box(-16.6, 9.5, 0, 2.6, 2.2, 0.5, '#3f6b9a')
  for (const z of [-2.3, 2.3]) b.box(0, 0.7, z, 1.6, 1.4, 1.2, '#2a2c2e')
  b.box(10, 0.6, 0, 0.5, 1.2, 0.5, '#2a2c2e')
  b.box(0, 2.6, 2.21, 18, 0.5, 0.04, '#2b3a44')
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

/** A flat-roofed adobe house: parapet, beam ends, a door on the front (+z), small windows. */
function house(b, o) {
  const w = o.w || 8
  const d = o.d || 8
  const fh = o.h || 3.6
  const floors = o.floors || 1
  const c = o.color || ['#c9a77c', '#d2b48a', '#bf9a6e', '#d8c09a'][((o.seed || 0) * 4) | 0]
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
    for (let bx = -fw / 2 + 0.8; bx < fw / 2 - 0.4; bx += 1.3) b.box(x + bx, y0 + fh - 0.45, fd / 2 + 0.2, 0.18, 0.18, 0.4, '#5a4632')
    for (const wx of [-fw * 0.28, fw * 0.28]) b.box(x + wx, y0 + fh * 0.6, fd / 2 + 0.03, 0.7, 0.8, 0.06, '#2a241e')
    for (const wz of [-fd * 0.2, fd * 0.2]) for (const sx of [-1, 1]) b.box(x + sx * (fw / 2 + 0.03), y0 + fh * 0.6, wz, 0.06, 0.8, 0.7, '#2a241e')
  }
  b.box(0.6, 1.05, d / 2 + 0.04, 1.1, 2.1, 0.08, '#6b4a2e')
  b.box(0.6, 2.25, d / 2 + 0.06, 1.4, 0.18, 0.12, '#5a4632')
  if (o.awning) {
    b.box(-w * 0.25, 2.4, d / 2 + 0.9, w * 0.4, 0.08, 1.8, o.awning)
    for (const ax of [-w * 0.43, -w * 0.07]) b.box(ax, 1.2, d / 2 + 1.7, 0.08, 2.4, 0.08, '#5a4632')
  }
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
  b.box(0.82, 1.6, 0, 0.04, 0.45, 1.7, '#1e2a30')
  b.box(-3.1, 1.95, 0, 2.4, 0.08, 2.4, '#3f4f3a')
  for (const x of [-4.1, -2.1]) for (const z of [-1.1, 1.1]) b.box(x, 1.4, z, 0.08, 1.1, 0.08, '#2a2c2e')
  b.cyl(2.5, 1.05, 0, 0.25, 0.3, 0.45, '#2a2c2e', 8)
  b.bar(2.5, 1.35, 0, 3.8, 1.5, 0, 0.1, '#1d1f21')
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
  b.box(3.6, 4.1, 1.82, 1.3, 0.6, 0.04, '#1e2a30')
  b.geo(new BoxGeometry(6, 0.12, 2.6), shade(Y, 0.8), -1, 3.4, -2.4, 0.9, 0, 0)
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
  for (const x of [-1.8, 0.2]) b.box(x, 1.9, 1.27, 1.3, 0.8, 0.05, '#2e3e4a')
  b.box(2, 1.4, 1.27, 0.9, 2, 0.05, '#4a4e52')
  b.box(2, 0.3, 1.75, 1.1, 0.6, 0.9, '#8d8a82', 'concrete')
}

/** Four stacks of old tyres. */
function tyres(b, o) {
  const s = (o.seed || 0.5) * 30
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.65, 0.65]) {
      const n = 2 + ((hash(s + x, z) * 3) | 0)
      for (let k = 0; k < n; k += 1) b.cyl(x, 0.14 + k * 0.29, z, 0.44, 0.44, 0.28, '#1d1f21', 8)
    }
  }
}

const DRAW = {
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
export function buildSetGeometries(map) {
  if (!map.sets?.length) return null
  const b = new SetBuilder()
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
