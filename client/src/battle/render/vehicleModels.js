import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Phase 3's vehicle models, built from primitives in code (no model files): jeep, APC,
 * tank and the strike jet. Each vehicle is split into the parts that move separately -
 * `body`, `top` (the turret or gun, turning about `pivot`) - plus `trim`, the bits
 * painted in the team's colour. +Z is forward, the wheels or tracks stand on y = 0.
 * A few hundred triangles each.
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
const wheel = (r, w, x, y, z, hex = '#202224') => place(cyl(r, r, w, 10, hex), x, y, z, 0, 0, Math.PI / 2)

const OLIVE = '#5f6b3d'
const OLIVE_DARK = '#4a5430'
const STEEL = '#3b3f44'
const GLASS = '#3e5566'
const TRIM = '#ffffff'

function jeep() {
  const body = [
    place(box(1.9, 0.5, 4.0, OLIVE), 0, 0.78, 0),
    place(box(1.8, 0.36, 1.3, OLIVE), 0, 1.2, 1.25),
    place(box(1.8, 0.08, 0.2, STEEL), 0, 1.0, 2.05),
    place(box(1.75, 0.55, 0.06, GLASS), 0, 1.6, 0.5, -0.25),
    place(box(1.7, 0.42, 1.3, OLIVE_DARK), 0, 1.2, -0.85),
    place(box(0.08, 0.7, 0.08, STEEL), 0, 1.6, -0.6),
    place(cyl(0.38, 0.38, 0.22, 10, '#202224'), 0, 1.05, -2.1, Math.PI / 2),
    // Seats for the driver and his mate, and the steering wheel.
    place(box(0.5, 0.55, 0.1, '#2a2c2e'), 0.42, 1.32, -0.12, 0.15),
    place(box(0.5, 0.55, 0.1, '#2a2c2e'), -0.42, 1.32, -0.12, 0.15),
    place(cyl(0.17, 0.17, 0.035, 10, '#1e1f22'), 0.42, 1.45, 0.42, -1.1),
  ]
  for (const sx of [-0.98, 0.98]) for (const sz of [-1.35, 1.35]) body.push(wheel(0.42, 0.34, sx, 0.42, sz))
  const top = [place(box(0.14, 0.16, 0.9, STEEL), 0, 0, 0.25), place(cyl(0.035, 0.035, 0.6, 6, '#1e1f22'), 0, 0.02, 0.95, Math.PI / 2), place(box(0.1, 0.22, 0.1, STEEL), 0, -0.12, 0)]
  const trim = [place(box(0.5, 0.02, 1.25, TRIM), 0, 1.39, 1.25), place(box(0.03, 0.22, 1.6, TRIM), 0.96, 0.85, 0.2), place(box(0.03, 0.22, 1.6, TRIM), -0.96, 0.85, 0.2)]
  return { body: merge(body), top: merge(top), trim: merge(trim), pivot: [0, 2.0, -0.6] }
}

function apc() {
  const body = [
    place(box(2.7, 1.0, 5.8, OLIVE), 0, 1.0, 0),
    place(box(2.4, 0.7, 4.4, OLIVE), 0, 1.85, -0.3),
    place(box(2.6, 0.9, 1.2, OLIVE_DARK), 0, 1.45, 2.65, 0.6),
    place(box(0.5, 0.18, 0.5, STEEL), 0.7, 2.25, -1.6),
    place(box(2.72, 0.12, 5.6, OLIVE_DARK), 0, 1.48, 0),
    // The driver's hatch, open.
    place(box(0.55, 0.06, 0.55, OLIVE_DARK), 0.75, 2.45, 0.95, -1.2),
  ]
  for (const sx of [-1.36, 1.36]) for (const sz of [-2.1, -0.7, 0.7, 2.1]) body.push(wheel(0.56, 0.4, sx, 0.56, sz))
  const top = [
    place(box(1.3, 0.55, 1.5, OLIVE_DARK), 0, 0.2, 0),
    place(cyl(0.075, 0.075, 2.1, 8, '#1e1f22'), 0, 0.22, 1.7, Math.PI / 2),
    place(box(0.3, 0.3, 0.3, STEEL), 0, 0.22, 0.8),
    // The commander's hatch, open.
    place(box(0.5, 0.05, 0.5, OLIVE_DARK), -0.4, 0.72, -0.95, -1.2),
  ]
  const trim = [place(box(0.03, 0.3, 3.0, TRIM), 1.36, 1.25, 0), place(box(0.03, 0.3, 3.0, TRIM), -1.36, 1.25, 0)]
  return { body: merge(body), top: merge(top), trim: merge(trim), pivot: [0, 2.25, -0.3] }
}

function tank() {
  const body = [
    place(box(0.85, 1.0, 7.0, '#2b2d2f'), 1.3, 0.55, 0),
    place(box(0.85, 1.0, 7.0, '#2b2d2f'), -1.3, 0.55, 0),
    place(box(0.95, 0.12, 7.1, OLIVE_DARK), 1.3, 1.1, 0),
    place(box(0.95, 0.12, 7.1, OLIVE_DARK), -1.3, 1.1, 0),
    place(box(2.0, 0.9, 6.2, OLIVE), 0, 1.3, -0.1),
    place(box(2.6, 0.5, 1.4, OLIVE), 0, 1.3, 3.0, -0.45),
    place(box(2.2, 0.25, 1.2, OLIVE_DARK), 0, 1.8, -2.6),
  ]
  for (const sx of [-1.3, 1.3]) for (let k = 0; k < 6; k += 1) body.push(wheel(0.36, 0.9, sx, 0.4, -2.6 + k * 1.04, '#3a3c3e'))
  const top = [
    place(box(2.3, 0.75, 2.8, OLIVE), 0, 0.15, 0),
    place(box(1.9, 0.4, 0.6, OLIVE_DARK), 0, 0.15, 1.55),
    place(cyl(0.11, 0.13, 3.8, 10, '#26282a'), 0, 0.2, 3.5, Math.PI / 2),
    place(cyl(0.16, 0.16, 0.4, 8, '#26282a'), 0, 0.2, 5.3, Math.PI / 2),
    place(cyl(0.35, 0.35, 0.25, 10, OLIVE_DARK), 0.55, 0.62, -0.4),
    place(box(0.5, 0.3, 0.9, OLIVE_DARK), 0, 0.15, -1.75),
    // The commander's cupola hatch thrown open, a machine gun beside it.
    place(box(0.62, 0.06, 0.62, OLIVE_DARK), 0.55, 1.0, -0.88, -1.15),
    place(cyl(0.03, 0.03, 0.9, 6, '#1e1f22'), 0.1, 0.85, -0.1, Math.PI / 2),
    place(box(0.1, 0.14, 0.4, STEEL), 0.1, 0.85, -0.5),
  ]
  const trim = [place(box(0.03, 0.32, 1.8, TRIM), 1.16, 0.2, 0), place(box(0.03, 0.32, 1.8, TRIM), -1.16, 0.2, 0)]
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
