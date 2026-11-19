import { BoxGeometry, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Floppy Front's utility helicopter, built in code: a smooth lofted fuselage (rounded
 * cross-sections from the nose to the end of the tail boom) with its glazing cut into it -
 * a framed windscreen and cabin windows - and both cabin doors slid open on a
 * dark cabin, so door gunners sit in the doorways. On top the engine cowling with its
 * intakes and exhausts and the rotor mast; behind, a swept fin with the tail rotor, a
 * tailplane with end plates; underneath, skids with upturned toes on curved cross tubes.
 * Navigation lights, a beacon, a landing light, aerials. The gunship adds stub wings with
 * rocket pods.
 *
 * Local space: +Z is the nose, +Y up, the skids rest on y = 0. About 11.5 m long with a
 * 10 m four-blade rotor; ~1,200 triangles in three geometries (body, main rotor, tail
 * rotor - the rotors spin about their pivots). Used by the lobby's arrival flight, the
 * battle's helicopters and the dock cards.
 */

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

/** Paints a part one colour (sRGB hex, stored linear as three expects). */
function tint(geo, hex) {
  const { r, g, b } = tmpC.set(hex)
  const n = geo.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    c[i * 3] = r
    c[i * 3 + 1] = g
    c[i * 3 + 2] = b
  }
  geo.setAttribute('color', new Float32BufferAttribute(c, 3))
  return geo
}

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz))
  return geo.applyMatrix4(tmpM)
}

/** Merges parts (any mix of indexed and not) into one non-indexed geometry. */
function merge(parts) {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p
    if (g !== p) p.dispose()
    if (g.attributes.uv) g.deleteAttribute('uv')
    return g
  })
  const g = mergeGeometries(flat)
  for (const p of flat) p.dispose()
  return g
}

/** A tube from (ax, ay, az) to (bx, by, bz). */
function tube(ax, ay, az, bx, by, bz, r, hex, seg = 8) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  const g = tint(new CylinderGeometry(r, r, len, seg), hex)
  tmpQ.setFromUnitVectors(tmpP.set(0, 1, 0), tmpS.set(dx / len, dy / len, dz / len))
  tmpM.compose(tmpP.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), tmpQ, tmpS.set(1, 1, 1))
  return g.applyMatrix4(tmpM)
}

const OLIVE = '#5f6e3c'
const OLIVE_DARK = '#4a5730'
const BELLY = '#3f4a2a'
const ORANGE = '#ff8a1f'
const GLASS = '#22323e'
const FRAME = '#2a2e26'
const STEEL = '#33373c'
const CABIN = '#262a26'

/** Where the rotors spin about, in local space. */
export const MAIN_ROTOR_PIVOT = [0, 3.78, -0.15]
export const TAIL_ROTOR_PIVOT = [0.3, 3.35, -7.3]

/**
 * The fuselage stations, nose to tail: z, half width, half height above and below the
 * centre line, and the centre line's height.
 */
const STATIONS = [
  [3.45, 0.06, 0.06, 0.05, 1.56],
  [3.3, 0.42, 0.38, 0.3, 1.6],
  [3.0, 0.75, 0.66, 0.46, 1.68],
  [2.5, 1.02, 0.92, 0.6, 1.78],
  [1.8, 1.2, 1.07, 0.68, 1.86],
  [1.0, 1.26, 1.13, 0.72, 1.9],
  [0, 1.26, 1.13, 0.72, 1.9],
  [-0.9, 1.22, 1.08, 0.68, 1.93],
  [-1.6, 0.98, 0.9, 0.52, 2.06],
  [-2.3, 0.6, 0.58, 0.34, 2.26],
  [-3.0, 0.34, 0.34, 0.26, 2.38],
  [-5.55, 0.25, 0.27, 0.21, 2.48],
  [-5.95, 0.24, 0.26, 0.2, 2.5],
  [-7.2, 0.18, 0.21, 0.16, 2.56],
  [-7.75, 0.05, 0.08, 0.05, 2.6],
]
const RADIAL = 18
/** The cabin lining sits this far in from the outer skin (a share of the section). */
const INSET = 0.93
const LINING = '#6a6f5c'
const FLOOR_IN = '#3d4236'
const GLASS_IN = '#1c2a33'
const BULKHEAD = '#5a5f4c'

/** What colour a fuselage face is (its centre: z, angle round the hull), or null for an opening. */
function hullFace(z, t) {
  const c = Math.cos(t)
  const s = Math.sin(t)
  // The open cabin doors.
  if (z > -0.45 && z < 0.9 && Math.abs(c) > 0.6 && s > -0.3 && s < 0.55) return null
  // Windscreen (a centre post up the middle). No chin windows: facing down, unlit, they
  // read as a hole in the nose.
  if (z > 1.55 && z < 3.2 && s > 0.12) return Math.abs(c) < 0.12 || (z > 1.55 && z < 1.85) ? FRAME : GLASS
  // Cabin windows behind the doors.
  if (z > -1.15 && z < -0.65 && Math.abs(c) > 0.55 && s > 0.15 && s < 0.6) return GLASS
  // Orange band round the tail boom, darker belly, olive above.
  if (z < -5.5 && z > -6) return ORANGE
  return s < -0.35 ? BELLY : OLIVE
}

function fuselage() {
  const pos = []
  const ring = (st, k) => {
    const [z, w, ht, hb, yc] = st
    const t = (k / RADIAL) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    // Rounded-square sections, flatter underneath.
    const ex = 0.75
    const x = w * Math.sign(c) * Math.abs(c) ** ex
    const y = yc + (s >= 0 ? ht * Math.abs(s) ** ex : -hb * Math.abs(s) ** 0.55)
    return [x, y, z]
  }
  const idx = []
  for (let i = 0; i < STATIONS.length; i += 1) for (let k = 0; k < RADIAL; k += 1) pos.push(...ring(STATIONS[i], k))
  // Faces between stations, and which colour each is.
  const faceColor = []
  for (let i = 0; i < STATIONS.length - 1; i += 1) {
    for (let k = 0; k < RADIAL; k += 1) {
      const a = i * RADIAL + k
      const b = i * RADIAL + ((k + 1) % RADIAL)
      const c = (i + 1) * RADIAL + k
      const d = (i + 1) * RADIAL + ((k + 1) % RADIAL)
      const col = hullFace((STATIONS[i][0] + STATIONS[i + 1][0]) / 2, ((k + 0.5) / RADIAL) * Math.PI * 2)
      if (!col) continue
      // Counter-clockwise seen from outside (ring angle runs anticlockwise from +z, the
      // stations run towards -z).
      idx.push(a, c, b, b, c, d)
      faceColor.push(col, col)
    }
  }
  // The cabin and cockpit from inside: an inset copy of the hull's skin there, facing in
  // (lining, a darker floor, glass seen from inside), and a bulkhead at the back of the
  // cabin so nobody can see down the tail boom.
  const first = STATIONS.findIndex((st) => st[0] <= 3.0)
  const last = STATIONS.findIndex((st) => st[0] <= -0.9)
  const base = pos.length / 3
  for (let i = first; i <= last; i += 1) {
    const yc = STATIONS[i][4]
    for (let k = 0; k < RADIAL; k += 1) {
      const [x, y, z] = ring(STATIONS[i], k)
      pos.push(x * INSET, yc + (y - yc) * INSET, z)
    }
  }
  for (let i = 0; i < last - first; i += 1) {
    for (let k = 0; k < RADIAL; k += 1) {
      const a = base + i * RADIAL + k
      const b = base + i * RADIAL + ((k + 1) % RADIAL)
      const c = base + (i + 1) * RADIAL + k
      const d = base + (i + 1) * RADIAL + ((k + 1) % RADIAL)
      const z = (STATIONS[first + i][0] + STATIONS[first + i + 1][0]) / 2
      const t = ((k + 0.5) / RADIAL) * Math.PI * 2
      const out = hullFace(z, t)
      const col = out === GLASS ? GLASS_IN : Math.sin(t) < -0.45 ? FLOOR_IN : LINING
      idx.push(a, b, c, b, d, c)
      faceColor.push(col, col)
    }
  }
  const back = base + (last - first) * RADIAL
  const centre = pos.length / 3
  pos.push(0, STATIONS[last][4], STATIONS[last][0])
  for (let k = 0; k < RADIAL; k += 1) {
    idx.push(centre, back + k, back + ((k + 1) % RADIAL))
    faceColor.push(BULKHEAD)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Flat colours per face (crisp window edges) on smooth normals.
  const flat = g.toNonIndexed()
  g.dispose()
  const n = flat.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let f = 0; f < n / 3; f += 1) {
    tmpC.set(faceColor[f])
    for (let v = 0; v < 3; v += 1) {
      col[(f * 3 + v) * 3] = tmpC.r
      col[(f * 3 + v) * 3 + 1] = tmpC.g
      col[(f * 3 + v) * 3 + 2] = tmpC.b
    }
  }
  flat.setAttribute('color', new Float32BufferAttribute(col, 3))
  return flat
}

/** A swept fin: a box whose top is slid back and narrowed. */
function fin() {
  const g = new BoxGeometry(0.14, 1.5, 1.2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    if (p.getY(i) > 0) {
      p.setZ(i, p.getZ(i) * 0.6 - 0.55)
      p.setX(i, p.getX(i) * 0.6)
    }
  }
  g.computeVertexNormals()
  return place(tint(g, OLIVE), 0, 3.25, -7.25)
}

function doorGun(side) {
  const sx = side
  return [
    // Swing arm from the door frame, the gun, its ammo can.
    tube(sx * 1.18, 1.62, 0.95, sx * 1.42, 1.62, 0.55, 0.035, STEEL, 6),
    place(tint(new BoxGeometry(0.42, 0.14, 0.12), '#2a2c2e'), sx * 1.55, 1.72, 0.45),
    place(tint(new CylinderGeometry(0.03, 0.03, 0.75, 6), '#1d1f21'), sx * 2.1, 1.74, 0.45, 0, 0, Math.PI / 2),
    place(tint(new BoxGeometry(0.16, 0.18, 0.2), '#4a5430'), sx * 1.5, 1.56, 0.62),
  ]
}

export function buildHelicopterGeometry({ armed = false } = {}) {
  const parts = [
    fuselage(),
    // Inside, through the open doors: a flat cabin floor, a troop bench and its backs along
    // the rear bulkhead, the two pilot seats, the instrument panel under its glare shield.
    place(tint(new BoxGeometry(1.6, 0.06, 3.3), FLOOR_IN), 0, 1.5, 0.75),
    place(tint(new BoxGeometry(1.7, 0.12, 0.5), '#7a5a3a'), 0, 1.92, -0.6),
    place(tint(new BoxGeometry(1.7, 0.55, 0.08), '#7a5a3a'), 0, 2.25, -0.84),
    ...[-0.55, 0, 0.55].map((x) => place(tint(new BoxGeometry(0.06, 0.4, 0.45), CABIN), x, 1.72, -0.6)),
    ...[-0.42, 0.42].flatMap((x) => [
      place(tint(new BoxGeometry(0.5, 0.1, 0.5), '#2c302a'), x, 1.85, 1.65),
      place(tint(new BoxGeometry(0.5, 0.75, 0.1), '#2c302a'), x, 2.2, 1.4, -0.12),
      place(tint(new BoxGeometry(0.08, 0.32, 0.4), CABIN), x, 1.7, 1.65),
    ]),
    // (Narrow enough to stay inside the nose as it tapers.)
    place(tint(new BoxGeometry(1.2, 0.42, 0.1), CABIN), 0, 2.12, 2.3, 0.5),
    place(tint(new BoxGeometry(1.15, 0.05, 0.3), '#1f2226'), 0, 2.36, 2.24),
    place(tint(new BoxGeometry(0.25, 0.4, 0.6), CABIN), 0, 1.75, 1.95),
    // Doors slid back along the outside of the cabin.
    place(tint(new BoxGeometry(0.06, 1.05, 1.3), OLIVE_DARK), 1.3, 2.0, -1.1),
    place(tint(new BoxGeometry(0.06, 1.05, 1.3), OLIVE_DARK), -1.3, 2.0, -1.1),
    place(tint(new BoxGeometry(0.05, 0.05, 2.4), STEEL), 1.33, 2.55, -0.4),
    place(tint(new BoxGeometry(0.05, 0.05, 2.4), STEEL), -1.33, 2.55, -0.4),
    // Engine cowling, intakes, exhausts, the mast, a red beacon.
    place(tint(new CapsuleGeometry(0.55, 1.7, 4, 12), OLIVE_DARK), 0, 3.02, -0.55, Math.PI / 2, 0, 0, 1.15, 1, 0.62),
    place(tint(new BoxGeometry(0.06, 0.32, 0.5), '#1d1f21'), 0.62, 3.05, 0.25),
    place(tint(new BoxGeometry(0.06, 0.32, 0.5), '#1d1f21'), -0.62, 3.05, 0.25),
    tube(0.35, 3.1, -1.5, 0.55, 3.0, -2.05, 0.13, '#2a2c2e', 8),
    tube(-0.35, 3.1, -1.5, -0.55, 3.0, -2.05, 0.13, '#2a2c2e', 8),
    place(tint(new CylinderGeometry(0.13, 0.17, 0.5, 10), STEEL), 0, 3.5, -0.15),
    place(tint(new CylinderGeometry(0.06, 0.06, 0.12, 6), '#ff3020'), 0, 3.38, -1.6),
    // Tail: fin, tail-rotor gearbox, tailplane with end plates, a stinger under the fin.
    fin(),
    place(tint(new BoxGeometry(0.22, 0.26, 0.4), OLIVE_DARK), 0.16, 3.35, -7.3),
    place(tint(new BoxGeometry(2.6, 0.07, 0.6), OLIVE), 0, 2.55, -6.4),
    place(tint(new BoxGeometry(0.06, 0.5, 0.55), OLIVE_DARK), 1.3, 2.62, -6.45),
    place(tint(new BoxGeometry(0.06, 0.5, 0.55), OLIVE_DARK), -1.3, 2.62, -6.45),
    tube(0, 2.4, -7.0, 0, 2.05, -7.55, 0.04, STEEL, 6),
    // Navigation lights (red port, green starboard), landing light, aerials.
    place(tint(new BoxGeometry(0.08, 0.1, 0.1), '#ff3020'), 1.34, 2.62, -6.2),
    place(tint(new BoxGeometry(0.08, 0.1, 0.1), '#30ff60'), -1.34, 2.62, -6.2),
    place(tint(new CylinderGeometry(0.12, 0.12, 0.05, 10), '#f4f0dc'), 0, 1.13, 2.4),
    tube(0, 2.7, -3.4, 0, 3.15, -3.75, 0.015, '#1d1f21', 4),
    place(tint(new BoxGeometry(0.03, 0.28, 0.3), '#1d1f21'), 0, 1.1, -0.8),
    ...doorGun(1),
    ...doorGun(-1),
  ]
  // Skids: runners with upturned toes on curved cross tubes, a step each side.
  for (const sx of [-1, 1]) {
    parts.push(tube(sx * 1.12, 0.07, -1.6, sx * 1.12, 0.07, 1.75, 0.07, STEEL))
    parts.push(tube(sx * 1.12, 0.07, 1.75, sx * 1.12, 0.42, 2.25, 0.07, STEEL))
    for (const z of [1.15, -0.95]) {
      parts.push(tube(sx * 1.12, 0.07, z, sx * 1.02, 0.75, z, 0.06, STEEL))
      parts.push(tube(sx * 1.02, 0.75, z, sx * 0.72, 1.2, z, 0.06, STEEL))
    }
    parts.push(place(tint(new BoxGeometry(0.3, 0.04, 0.5), STEEL), sx * 1.16, 0.62, 0.3))
  }
  if (armed) {
    // Stub wings behind the doors with a rocket pod under each tip.
    for (const sx of [-1, 1]) {
      parts.push(place(tint(new BoxGeometry(1.3, 0.1, 0.6), OLIVE_DARK), sx * 1.75, 1.55, -1.3, 0, 0, sx * -0.08))
      parts.push(place(tint(new CylinderGeometry(0.22, 0.22, 1.5, 10), '#3a3f2e'), sx * 2.2, 1.32, -1.25, Math.PI / 2, 0, 0))
      parts.push(place(tint(new CylinderGeometry(0.2, 0.2, 0.04, 10), '#1d1f21'), sx * 2.2, 1.32, -0.49, Math.PI / 2, 0, 0))
    }
  }
  const body = merge(parts)

  // Main rotor about its pivot: hub, swashplate and pitch links, four tapered blades with
  // orange tips.
  const rotor = [
    tint(new CylinderGeometry(0.3, 0.3, 0.16, 12), STEEL),
    place(tint(new CylinderGeometry(0.24, 0.24, 0.06, 12), '#4a4e52'), 0, -0.22, 0),
    place(tint(new CylinderGeometry(0.08, 0.08, 0.3, 8), STEEL), 0, 0.18, 0),
  ]
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2
    const blade = new BoxGeometry(0.36, 0.05, 4.7)
    const p = blade.attributes.position
    for (let v = 0; v < p.count; v += 1) if (p.getZ(v) > 0) p.setX(v, p.getX(v) * 0.75)
    blade.computeVertexNormals()
    rotor.push(place(tint(blade, '#2a2d31'), Math.sin(a) * 2.75, 0.04, Math.cos(a) * 2.75, 0, a, 0))
    rotor.push(place(tint(new BoxGeometry(0.28, 0.06, 0.38), ORANGE), Math.sin(a) * 4.9, 0.04, Math.cos(a) * 4.9, 0, a, 0))
    rotor.push(place(tube(0, -0.2, 0, 0, 0.0, 0, 0.02, '#5a5e62', 4), Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32))
  }
  const mainRotor = merge(rotor)
  const tailRotor = merge([
    place(tint(new BoxGeometry(0.05, 1.7, 0.2), '#2a2d31'), 0.05, 0, 0),
    place(tint(new BoxGeometry(0.06, 0.25, 0.21), ORANGE), 0.05, 0.75, 0),
    place(tint(new BoxGeometry(0.06, 0.25, 0.21), ORANGE), 0.05, -0.75, 0),
    tint(new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateZ(Math.PI / 2), STEEL),
    place(tint(new SphereGeometry(0.07, 6, 4), STEEL), 0.09, 0, 0),
  ])
  return { body, mainRotor, tailRotor }
}
