import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * The vehicle models, built from primitives in code (no model files): jeep, APC, tank
 * and the strike jet - with their real working parts (tracks and road wheels, hatches,
 * periscopes, smoke dischargers, grilles, stowage...). Each vehicle is split into the parts that move separately -
 * `body`, `top` (the turret or gun, turning about `pivot`) - plus `trim`, the bits
 * painted in the team's colour. +Z is forward, the wheels or tracks stand on y = 0.
 * About 1,000-1,600 triangles each.
 */

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

function tint(geo, hex) {
  tmpC.set(hex)
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

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, 1, 1))
  return geo.applyMatrix4(tmpM)
}

function merge(parts) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
  for (const p of parts) p.dispose()
  return g
}

const box = (w, h, d, hex) => tint(new BoxGeometry(w, h, d), hex)
const cyl = (r0, r1, h, seg, hex) => tint(new CylinderGeometry(r0, r1, h, seg), hex)

const OLIVE = '#5f6b3d'
const OLIVE_DARK = '#4a5430'
const STEEL = '#3b3f44'
const GLASS = '#3e5566'
const TRIM = '#ffffff'

/** A box whose top / bottom / front faces are narrowed (sloped armour, a V hull). */
function wedge(w, h, d, hex, { top = 1, bottom = 1, front = 1, topD = 1 } = {}) {
  const g = new BoxGeometry(w, h, d)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    let x = p.getX(i)
    let z = p.getZ(i)
    if (p.getY(i) > 0) {
      x *= top
      z *= topD
    } else x *= bottom
    if (p.getZ(i) > 0) x *= front
    p.setX(i, x)
    p.setZ(i, z)
  }
  g.computeVertexNormals()
  return tint(g, hex)
}

/** A tube from (ax, ay, az) to (bx, by, bz). */
function tube(ax, ay, az, bx, by, bz, r, hex, seg = 6) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  const g = tint(new CylinderGeometry(r, r, len, seg), hex)
  tmpQ.setFromUnitVectors(tmpP.set(0, 1, 0), tmpS.set(dx / len, dy / len, dz / len))
  tmpM.compose(tmpP.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), tmpQ, tmpS.set(1, 1, 1))
  return g.applyMatrix4(tmpM)
}

/** A road wheel: tyre and rim (and a hub cap when `hub`), its axle along x. */
function roadWheel(r, w, x, y, z, tyre = '#202224', rim = '#4a5032', hub = true, seg = 8) {
  const out = [place(cyl(r, r, w, seg, tyre), x, y, z, 0, 0, Math.PI / 2), place(cyl(r * 0.62, r * 0.62, w + 0.02, seg, rim), x, y, z, 0, 0, Math.PI / 2)]
  if (hub) out.push(place(cyl(r * 0.2, r * 0.2, w + 0.06, 6, '#2a2c2e'), x, y, z, 0, 0, Math.PI / 2))
  return out
}

const CANVAS = '#3a3628'
const LIGHT = '#e8e4cc'

function jeep() {
  const body = [
    // Chassis, the open tub, the engine bay and its sloping hood.
    place(box(1.4, 0.18, 3.7, '#2a2c2e'), 0, 0.56, 0),
    place(box(1.78, 0.5, 2.55, OLIVE), 0, 0.9, -0.35),
    place(box(1.5, 0.42, 1.3, OLIVE), 0, 0.93, 1.35),
    place(box(1.56, 0.1, 1.34, OLIVE), 0, 1.19, 1.35, 0.04),
    // Grille with its slots, round headlights, bumper and tow hooks.
    place(box(1.3, 0.42, 0.06, '#1e2022'), 0, 0.98, 2.02),
    ...[-0.45, -0.22, 0, 0.22, 0.45].map((x) => place(box(0.08, 0.38, 0.03, OLIVE_DARK), x, 0.98, 2.06)),
    ...[-0.58, 0.58].flatMap((x) => [place(cyl(0.11, 0.11, 0.08, 10, LIGHT), x, 1.07, 2.05, Math.PI / 2), place(cyl(0.13, 0.13, 0.05, 10, STEEL), x, 1.07, 2.02, Math.PI / 2)]),
    place(box(1.95, 0.16, 0.18, STEEL), 0, 0.62, 2.12),
    ...[-0.5, 0.5].map((x) => place(box(0.1, 0.12, 0.14, '#1e1f22'), x, 0.58, 2.24)),
    // Fenders over the wheels, a step each side.
    ...[-1, 1].flatMap((s) => [
      place(box(0.4, 0.06, 1.05, OLIVE), s * 0.92, 0.94, 1.35),
      place(box(0.34, 0.06, 0.95, OLIVE), s * 0.93, 0.94, -1.35),
      place(box(0.2, 0.04, 0.6, STEEL), s * 0.98, 0.66, 0.05),
    ]),
    // Windscreen: frame and two panes, raked back.
    place(box(1.62, 0.06, 0.06, OLIVE_DARK), 0, 1.86, 0.44),
    ...[-0.8, 0, 0.8].map((x) => place(box(0.06, 0.62, 0.06, OLIVE_DARK), x, 1.56, 0.5, -0.2)),
    place(box(1.52, 0.52, 0.03, GLASS), 0, 1.56, 0.5, -0.2),
    // Dashboard, steering wheel, the two front seats.
    place(box(1.5, 0.2, 0.25, '#2a2c2e'), 0, 1.28, 0.32),
    place(cyl(0.17, 0.17, 0.035, 12, '#1e1f22'), 0.42, 1.45, 0.25, -1.1),
    ...[-0.42, 0.42].flatMap((x) => [place(box(0.5, 0.12, 0.5, CANVAS), x, 1.1, 0), place(box(0.5, 0.55, 0.1, CANVAS), x, 1.4, -0.24, 0.12)]),
    // The open bed behind: floor, side walls, tailgate; the roll bar; the MG post.
    place(box(1.6, 0.05, 1.45, '#3a3f2a'), 0, 1.12, -0.95),
    ...[-0.86, 0.86].map((x) => place(box(0.06, 0.38, 1.5, OLIVE), x, 1.32, -0.95)),
    place(box(1.78, 0.38, 0.06, OLIVE), 0, 1.32, -1.68),
    tube(0.8, 1.15, -0.32, 0.8, 2.0, -0.36, 0.04, STEEL),
    tube(-0.8, 1.15, -0.32, -0.8, 2.0, -0.36, 0.04, STEEL),
    tube(-0.8, 2.0, -0.36, 0.8, 2.0, -0.36, 0.04, STEEL),
    tube(0, 1.12, -0.6, 0, 1.9, -0.6, 0.05, STEEL),
    // Spare wheel, jerrycans, tail lights, mirrors, an aerial.
    place(cyl(0.36, 0.36, 0.22, 12, '#202224'), 0, 1.2, -1.82, Math.PI / 2),
    place(box(0.18, 0.36, 0.3, '#4a5430'), 0.62, 1.3, -1.8),
    place(box(0.18, 0.36, 0.3, '#4a5430'), -0.62, 1.3, -1.8),
    ...[-0.78, 0.78].map((x) => place(box(0.12, 0.08, 0.04, '#b0302a'), x, 1.0, -1.66)),
    ...[-0.9, 0.9].map((x) => place(box(0.06, 0.14, 0.18, '#1e1f22'), x, 1.62, 0.6)),
    tube(-0.82, 1.1, -1.55, -0.86, 2.6, -1.62, 0.012, '#1e1f22', 4),
  ]
  for (const sx of [-0.98, 0.98]) for (const sz of [-1.35, 1.35]) body.push(...roadWheel(0.42, 0.32, sx, 0.42, sz, '#202224', '#4a5032'))
  // The machine gun on its pintle: cradle, receiver, cooling jacket and barrel, ammo can,
  // spade grips.
  const top = [
    place(box(0.1, 0.22, 0.1, STEEL), 0, -0.13, 0.1),
    place(box(0.16, 0.17, 0.55, '#2a2c2e'), 0, 0, 0.22),
    place(cyl(0.05, 0.05, 0.5, 8, '#26282a'), 0, 0.02, 0.72, Math.PI / 2),
    place(cyl(0.025, 0.025, 0.5, 6, '#1e1f22'), 0, 0.02, 1.2, Math.PI / 2),
    place(cyl(0.04, 0.04, 0.08, 6, '#1e1f22'), 0, 0.02, 1.46, Math.PI / 2),
    place(box(0.14, 0.17, 0.26, '#4a5430'), 0.16, -0.02, 0.18),
    place(box(0.2, 0.05, 0.06, '#1e1f22'), 0, 0.02, -0.08),
  ]
  const trim = [place(box(0.5, 0.02, 1.25, TRIM), 0, 1.26, 1.35), place(box(0.03, 0.2, 1.7, TRIM), 0.9, 0.88, -0.4), place(box(0.03, 0.2, 1.7, TRIM), -0.9, 0.88, -0.4)]
  return { body: merge(body), top: merge(top), trim: merge(trim), pivot: [0, 2.0, -0.6] }
}

function apc() {
  const body = [
    // V-shaped lower hull, sloped upper hull, the glacis and the nose plate.
    place(wedge(2.45, 0.9, 5.9, OLIVE, { bottom: 0.72 }), 0, 1.05, 0),
    place(wedge(2.75, 0.72, 4.9, OLIVE, { top: 0.82 }), 0, 1.86, -0.35),
    place(box(2.55, 0.12, 1.55, OLIVE), 0, 1.78, 2.5, 0.52),
    place(box(2.35, 0.55, 0.12, OLIVE_DARK), 0, 1.0, 2.98, -0.55),
    // Fenders along the wheels, mud flaps.
    ...[-1, 1].flatMap((s) => [place(box(0.36, 0.08, 5.6, OLIVE_DARK), s * 1.45, 1.6, 0), place(box(0.36, 0.4, 0.04, '#1e1f22'), s * 1.45, 1.38, -2.75)]),
    // Driver's hatch (open) and periscopes, headlights in guards, tow hooks.
    place(cyl(0.3, 0.3, 0.06, 10, OLIVE_DARK), 0.75, 2.23, 1.4),
    place(box(0.55, 0.06, 0.55, OLIVE_DARK), 0.75, 2.45, 0.95, -1.2),
    ...[0.55, 0.75, 0.95].map((x) => place(box(0.12, 0.08, 0.1, '#1e2a30'), x, 2.25, 1.78)),
    ...[-0.95, 0.95].flatMap((x) => [place(cyl(0.1, 0.1, 0.08, 8, LIGHT), x, 1.62, 2.98, Math.PI / 2), place(box(0.28, 0.24, 0.04, STEEL), x, 1.62, 3.05)]),
    ...[-0.7, 0.7].map((x) => place(box(0.14, 0.14, 0.18, '#1e1f22'), x, 0.82, 3.05)),
    // Rear door with hinges, rear lights; stowage boxes and an exhaust grille on the sides.
    place(box(1.05, 1.0, 0.06, OLIVE_DARK), 0, 1.6, -2.98),
    ...[1.25, 1.95].map((y) => place(box(0.1, 0.1, 0.1, STEEL), -0.5, y, -3.02)),
    ...[-1.1, 1.1].map((x) => place(box(0.14, 0.1, 0.04, '#b0302a'), x, 1.85, -2.98)),
    ...[-1, 1].map((s) => place(box(0.28, 0.34, 1.7, '#55603a'), s * 1.32, 2.05, -1.6)),
    place(box(0.04, 0.35, 0.8, '#1e1f22'), 1.38, 1.85, 0.6),
    // Turret ring.
    place(cyl(0.85, 0.85, 0.1, 14, OLIVE_DARK), 0, 2.24, -0.3),
  ]
  for (const sx of [-1.36, 1.36]) for (const sz of [-2.1, -0.7, 0.7, 2.1]) body.push(...roadWheel(0.56, 0.4, sx, 0.56, sz, '#202224', '#4a5032', false))
  const top = [
    // Sloped turret, mantlet and autocannon with muzzle brake, coax, sight, smoke
    // launchers, the commander's hatch thrown open, an aerial.
    place(wedge(1.5, 0.55, 1.75, OLIVE_DARK, { top: 0.78, front: 0.85 }), 0, 0.22, 0),
    place(box(0.45, 0.36, 0.32, OLIVE_DARK), 0, 0.22, 0.95),
    place(cyl(0.065, 0.075, 2.2, 10, '#1e1f22'), 0, 0.22, 2.1, Math.PI / 2),
    place(cyl(0.1, 0.1, 0.26, 10, '#26282a'), 0, 0.22, 3.25, Math.PI / 2),
    place(cyl(0.025, 0.025, 0.5, 6, '#1e1f22'), 0.2, 0.2, 1.3, Math.PI / 2),
    place(box(0.26, 0.22, 0.32, '#2a2e22'), 0.45, 0.6, 0.35),
    place(box(0.2, 0.12, 0.04, '#1e2a30'), 0.45, 0.62, 0.52),
    ...[-1, 1].flatMap((s) => [0, 1, 2].map((k) => place(cyl(0.045, 0.045, 0.24, 6, '#2a2c2e'), s * (0.66 + k * 0.05), 0.38 + k * 0.07, 0.62, 1.2))),
    place(cyl(0.28, 0.28, 0.05, 10, OLIVE_DARK), -0.4, 0.5, -0.45),
    place(box(0.5, 0.05, 0.5, OLIVE_DARK), -0.4, 0.72, -0.95, -1.2),
    tube(0.55, 0.5, -0.7, 0.58, 2.2, -0.95, 0.012, '#1e1f22', 4),
  ]
  const trim = [place(box(0.03, 0.26, 3.0, TRIM), 1.3, 1.95, -0.3), place(box(0.03, 0.26, 3.0, TRIM), -1.3, 1.95, -0.3)]
  return { body: merge(body), top: merge(top), trim: merge(trim), pivot: [0, 2.25, -0.3] }
}

function tank() {
  const TRACK = '#2a2b2c'
  const body = []
  for (const s of [-1, 1]) {
    const x = s * 1.3
    // The track run: top and bottom, wrapped round the idler (front) and sprocket (rear),
    // the road wheels and return rollers inside it; skirts and fenders over it.
    body.push(place(box(0.78, 0.1, 6.1, TRACK), x, 1.0, 0))
    body.push(place(box(0.78, 0.1, 5.3, TRACK), x, 0.05, -0.1))
    body.push(place(cyl(0.48, 0.48, 0.78, 12, TRACK), x, 0.52, 3.0, 0, 0, Math.PI / 2))
    body.push(place(cyl(0.48, 0.48, 0.78, 12, TRACK), x, 0.52, -3.2, 0, 0, Math.PI / 2))
    for (let k = 0; k < 6; k += 1) body.push(...roadWheel(0.36, 0.6, x, 0.42, -2.45 + k * 0.98, '#2e3032', '#4a5032', false, 6))
    body.push(place(cyl(0.1, 0.1, 0.5, 6, '#3a3c3e'), x, 0.9, 0, 0, 0, Math.PI / 2))
    body.push(place(box(0.08, 0.55, 5.9, OLIVE), s * 1.74, 0.78, 0.05))
    body.push(place(box(0.96, 0.06, 7.1, OLIVE_DARK), x, 1.1, 0))
    // Tow cable along the hull side.
    body.push(tube(s * 1.02, 1.55, -2.4, s * 1.02, 1.55, 1.8, 0.04, '#3a3530'))
  }
  body.push(
    // Hull, the steep glacis, the lower front plate, rear plate.
    place(box(2.0, 0.85, 5.9, OLIVE), 0, 1.3, -0.15),
    place(box(2.55, 0.1, 1.55, OLIVE), 0, 1.5, 3.05, 1.12),
    place(box(2.2, 0.55, 0.1, OLIVE_DARK), 0, 0.95, 3.3, -0.7),
    place(box(2.1, 0.8, 0.1, OLIVE_DARK), 0, 1.3, -3.12),
    // Engine deck grilles, exhausts, stowage bins at the back.
    ...[-2.9, -2.6, -2.3, -2.0, -1.7, -1.4].map((z) => place(box(1.7, 0.03, 0.12, '#1e1f22'), 0, 1.74, z)),
    place(box(0.5, 0.28, 0.3, '#2a2c2e'), 0.65, 1.45, -3.25),
    place(box(0.5, 0.28, 0.3, '#2a2c2e'), -0.65, 1.45, -3.25),
    place(box(0.5, 0.35, 0.8, '#55603a'), 1.15, 1.95, -2.6),
    // Driver's hatch and periscopes, headlights.
    place(cyl(0.28, 0.28, 0.06, 10, OLIVE_DARK), -0.5, 1.78, 2.35),
    ...[-0.7, -0.5, -0.3].map((x) => place(box(0.12, 0.08, 0.1, '#1e2a30'), x, 1.8, 2.72)),
    ...[-0.9, 0.9].flatMap((x) => [place(cyl(0.09, 0.09, 0.08, 8, LIGHT), x, 1.62, 3.32, Math.PI / 2), place(box(0.24, 0.22, 0.04, STEEL), x, 1.62, 3.38)]),
    // Turret ring.
    place(cyl(1.05, 1.05, 0.1, 16, OLIVE_DARK), 0, 1.78, -0.3),
  )
  // Turret: angular front faces, the bustle with its stowage basket, the mantlet and the
  // long gun (fume extractor, sleeve bands, muzzle), the cupola with periscopes and its
  // hatch open, a machine gun, the loader's hatch, smoke dischargers, sight, aerials.
  const top = [
    place(wedge(2.4, 0.72, 2.9, OLIVE, { top: 0.88, front: 0.72, topD: 0.94 }), 0, 0.15, 0.1),
    place(wedge(2.0, 0.58, 1.0, OLIVE_DARK, { top: 0.9 }), 0, 0.17, -1.75),
    tube(-1.05, 0.55, -2.35, 1.05, 0.55, -2.35, 0.03, '#2a2c2e', 4),
    tube(-1.05, 0.55, -1.4, -1.05, 0.55, -2.35, 0.03, '#2a2c2e', 4),
    tube(1.05, 0.55, -1.4, 1.05, 0.55, -2.35, 0.03, '#2a2c2e', 4),
    place(box(1.9, 0.08, 0.9, '#55603a'), 0, 0.6, -1.9),
    place(box(1.0, 0.62, 0.5, OLIVE_DARK), 0, 0.15, 1.65),
    place(cyl(0.11, 0.13, 4.2, 12, '#26282a'), 0, 0.2, 3.95, Math.PI / 2),
    place(cyl(0.17, 0.17, 0.55, 12, '#2a2c2e'), 0, 0.2, 3.3, Math.PI / 2),
    ...[2.6, 4.4].map((z) => place(cyl(0.135, 0.135, 0.12, 12, '#3a3f2e'), 0, 0.2, z, Math.PI / 2)),
    place(cyl(0.14, 0.14, 0.3, 12, '#26282a'), 0, 0.2, 6.05, Math.PI / 2),
    place(cyl(0.35, 0.38, 0.28, 12, OLIVE_DARK), 0.55, 0.62, -0.4),
    ...[0, 1, 2, 3, 4].map((k) => {
      const a = -0.9 + k * 0.45
      return place(box(0.1, 0.08, 0.08, '#1e2a30'), 0.55 + Math.sin(a) * 0.36, 0.7, -0.4 + Math.cos(a) * 0.36, 0, a, 0)
    }),
    place(box(0.62, 0.06, 0.62, OLIVE_DARK), 0.55, 1.0, -0.88, -1.15),
    place(cyl(0.03, 0.03, 0.9, 6, '#1e1f22'), 0.1, 0.85, -0.1, Math.PI / 2),
    place(box(0.1, 0.14, 0.4, STEEL), 0.1, 0.85, -0.5),
    place(cyl(0.3, 0.3, 0.06, 10, OLIVE_DARK), -0.55, 0.55, -0.3),
    ...[-1, 1].flatMap((s) => [0, 1, 2].map((k) => place(cyl(0.05, 0.05, 0.26, 6, '#2a2c2e'), s * 0.98, 0.32 + k * 0.09, 0.95 - k * 0.05, 1.25))),
    place(box(0.28, 0.24, 0.36, '#2a2e22'), -0.6, 0.62, 1.0),
    place(box(0.22, 0.14, 0.04, '#1e2a30'), -0.6, 0.64, 1.19),
    tube(-0.8, 0.5, -1.6, -0.85, 2.4, -1.85, 0.012, '#1e1f22', 4),
    tube(0.8, 0.5, -1.6, 0.85, 2.0, -1.85, 0.012, '#1e1f22', 4),
  ]
  const trim = [place(box(0.03, 0.3, 1.9, TRIM), 1.1, 0.2, 0.1), place(box(0.03, 0.3, 1.9, TRIM), -1.1, 0.2, 0.1)]
  return { body: merge(body), top: merge(top), trim: merge(trim), pivot: [0, 2.05, -0.3] }
}

/** The strike jet: swept wings, twin tail, grey. */
function jet() {
  const grey = '#8b9196'
  const dark = '#5c6166'
  return merge([
    place(cyl(0.55, 0.45, 9, 10, grey), 0, 0, 0, Math.PI / 2),
    place(tint(new ConeGeometry(0.55, 2.2, 10), grey), 0, 0, 5.6, Math.PI / 2),
    place(box(0.7, 0.4, 1.6, '#3a4a58'), 0, 0.45, 2.8),
    place(box(8.5, 0.14, 2.2, dark), 0, -0.1, -0.4, 0, 0, 0),
    place(box(3.4, 0.1, 1.2, dark), 0, 0.1, -4.0),
    place(box(0.12, 1.8, 1.3, dark), 0.7, 1.0, -3.9, 0, 0, -0.25),
    place(box(0.12, 1.8, 1.3, dark), -0.7, 1.0, -3.9, 0, 0, 0.25),
    place(cyl(0.4, 0.4, 0.4, 8, '#2a2c2e'), 0, 0, -4.6, Math.PI / 2),
  ])
}

export function buildVehicleGeometries() {
  return { jeep: jeep(), apc: apc(), tank: tank(), jet: jet() }
}

/** Team-coloured bits for a helicopter (tail fin flash and a stripe down each side). */
export function helicopterTrim() {
  return merge([place(box(0.18, 0.4, 0.5, TRIM), 0, 3.55, -7.6), place(box(0.04, 0.16, 1.6, TRIM), 0.3, 2.45, -4.2), place(box(0.04, 0.16, 1.6, TRIM), -0.3, 2.45, -4.2)])
}
