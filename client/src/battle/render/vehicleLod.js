import { BoxGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Distance LOD for the vehicles: light models (a few hundred triangles - the game's first
 * vehicle models) drawn in place of the detailed ones (vehicleModels.js,
 * helicopterModel.js) once a vehicle is further from the camera than the preset's LOD
 * distance. Same size, same turret pivots; nobody can tell at that range, and a battle
 * full of armour stays inside the triangle budget.
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
const wheel = (r, w, x, y, z, hex = '#202224') => place(cyl(r, r, w, 6, hex), x, y, z, 0, 0, Math.PI / 2)

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
  // (No road wheels: at this range the track blocks hide them.)
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


// --- Helicopter body --------------------------------------------------------------------

function htint(geo, hex) {
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

function hplace(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz))
  return geo.applyMatrix4(tmpM)
}

function hmerge(parts) {
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

const H_OLIVE = 0x6d7a47
const H_OLIVE_DARK = 0x56603b
const H_ORANGE = 0xff8a1f
const H_GLASS = 0x5a7a96
const H_STEEL = 0x3a3d42
const H_DOOR = 0x3c4430


function helicopterLod() {
  const body = hmerge([
    hplace(htint(new SphereGeometry(1, 14, 10), H_OLIVE), 0, 1.75, 0.5, 0, 0, 0, 1.25, 1.15, 2.6),
    hplace(htint(new SphereGeometry(1, 12, 8), H_GLASS), 0, 2.05, 2.2, -0.15, 0, 0, 1.0, 0.75, 1.15),
    hplace(htint(new BoxGeometry(1.35, 0.7, 2.3), H_OLIVE_DARK), 0, 2.8, -0.3),
    hplace(htint(new CylinderGeometry(0.2, 0.45, 6.2, 8), H_OLIVE), 0, 2.25, -4.5, Math.PI / 2 + 0.05),
    hplace(htint(new BoxGeometry(0.16, 1.7, 1.05), H_OLIVE), 0, 3.0, -7.35, -0.3),
    hplace(htint(new BoxGeometry(0.18, 0.38, 1.08), H_ORANGE), 0, 3.6, -7.55, -0.3),
    hplace(htint(new BoxGeometry(2.5, 0.08, 0.62), H_OLIVE_DARK), 0, 2.35, -6.5),
    hplace(htint(new BoxGeometry(2.5, 0.2, 0.34), H_ORANGE), 0, 1.55, -1.45),
    hplace(htint(new BoxGeometry(0.06, 0.95, 1.15), H_DOOR), 1.22, 1.72, 0.4),
    hplace(htint(new BoxGeometry(0.06, 0.95, 1.15), H_DOOR), -1.22, 1.72, 0.4),
    hplace(htint(new CylinderGeometry(0.12, 0.14, 0.55, 8), H_STEEL), 0, 3.35, 0),
    // A door gun on a swing arm at each open door, for the door gunners.
    hplace(htint(new BoxGeometry(0.9, 0.12, 0.12), H_STEEL), 1.75, 1.74, 0.4),
    hplace(htint(new BoxGeometry(0.9, 0.12, 0.12), H_STEEL), -1.75, 1.74, 0.4),
    hplace(htint(new BoxGeometry(0.1, 0.4, 0.1), H_STEEL), 1.42, 1.5, 0.4),
    hplace(htint(new BoxGeometry(0.1, 0.4, 0.1), H_STEEL), -1.42, 1.5, 0.4),
    // Skids and struts.
    hplace(htint(new CylinderGeometry(0.07, 0.07, 4.8, 6), H_STEEL), 1.1, 0.07, 0.4, Math.PI / 2),
    hplace(htint(new CylinderGeometry(0.07, 0.07, 4.8, 6), H_STEEL), -1.1, 0.07, 0.4, Math.PI / 2),
    hplace(htint(new BoxGeometry(0.08, 1.0, 0.08), H_STEEL), 0.98, 0.55, 1.4, 0, 0, 0.25),
    hplace(htint(new BoxGeometry(0.08, 1.0, 0.08), H_STEEL), -0.98, 0.55, 1.4, 0, 0, -0.25),
    hplace(htint(new BoxGeometry(0.08, 1.0, 0.08), H_STEEL), 0.98, 0.55, -0.7, 0, 0, 0.25),
    hplace(htint(new BoxGeometry(0.08, 1.0, 0.08), H_STEEL), -0.98, 0.55, -0.7, 0, 0, -0.25),
  ])
  // Main rotor about its own pivot: hub and three blades.
  const blades = [htint(new CylinderGeometry(0.28, 0.28, 0.2, 10), H_STEEL)]
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3
    blades.push(hplace(htint(new BoxGeometry(0.34, 0.05, 5.0), i === 0 ? 0x2a2d31 : 0x33363b), Math.sin(a) * 2.6, 0.05, Math.cos(a) * 2.6, 0, a, 0))
    // Orange tip on each blade.
    blades.push(hplace(htint(new BoxGeometry(0.35, 0.06, 0.4), H_ORANGE), Math.sin(a) * 4.9, 0.05, Math.cos(a) * 4.9, 0, a, 0))
  }
  const mainRotor = hmerge(blades)
  const tailRotor = hmerge([
    htint(new BoxGeometry(0.05, 1.7, 0.18), 0x2a2d31),
    htint(new BoxGeometry(0.05, 0.18, 1.7), 0x2a2d31),
    htint(new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateZ(Math.PI / 2), H_STEEL),
  ])
  return { body, mainRotor, tailRotor }
}


/** The light models: { jeep, apc, tank: { body, top, trim }, heli: body geometry }. */
export function buildVehicleLods() {
  const heli = helicopterLod()
  heli.mainRotor.dispose()
  heli.tailRotor.dispose()
  return { jeep: jeep(), apc: apc(), tank: tank(), heli: heli.body }
}
