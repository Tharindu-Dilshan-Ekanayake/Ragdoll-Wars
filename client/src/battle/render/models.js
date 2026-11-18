import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Euler,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Low-poly geometry for the soldier's parts and the weapons, built from primitives
 * in code (no model files). Baked vertex colours carry the small details - eyes, pouches,
 * wood and steel - while each instance's colour carries team and skin tone.
 *
 * Budget: a whole soldier is ~580 triangles plus ~40-140 for the weapon. Built once per battle,
 * disposed with it.
 */

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpS = new Vector3()
const tmpP = new Vector3()

/** Gives `geo` a flat vertex colour and returns it (non-indexed geometries stay so). */
function tint(geo, r, g, b) {
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

/** Moves/rotates/scales `geo` in place and returns it. */
function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz))
  geo.applyMatrix4(tmpM)
  return geo
}

function merge(parts) {
  const geo = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return geo
}

const WHITE = [1, 1, 1]
const box = (w, h, d, col = WHITE) => tint(new BoxGeometry(w, h, d), ...col)
const cyl = (rt, rb, h, seg = 6, col = WHITE) => tint(new CylinderGeometry(rt, rb, h, seg), ...col)

// --- Soldier parts -------------------------------------------------------------------

function torsoGeometry() {
  const g = box(0.42, 0.52, 0.26)
  // A little V-shape: wider shoulders, narrower waist.
  const p = g.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    const top = p.getY(i) > 0
    p.setX(i, p.getX(i) * (top ? 1.06 : 0.9))
  }
  g.computeVertexNormals()
  return g
}

function vestGeometry() {
  const pouch = [0.8, 0.8, 0.76]
  return merge([box(0.45, 0.3, 0.29), place(box(0.12, 0.09, 0.05, pouch), -0.09, -0.07, 0.16), place(box(0.12, 0.09, 0.05, pouch), 0.09, -0.07, 0.16)])
}

function headGeometry() {
  const eye = [0.07, 0.07, 0.08]
  return merge([
    tint(new SphereGeometry(0.16, 8, 6), 1, 1, 1),
    place(box(0.042, 0.052, 0.03, eye), 0.058, 0.025, 0.145),
    place(box(0.042, 0.052, 0.03, eye), -0.058, 0.025, 0.145),
    place(box(0.07, 0.016, 0.02, [0.55, 0.32, 0.3]), 0, -0.055, 0.15),
  ])
}

function helmetGeometry() {
  return merge([
    tint(new SphereGeometry(0.19, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), 1, 1, 1),
    place(tint(new CylinderGeometry(0.2, 0.205, 0.05, 8, 1, true), 0.72, 0.72, 0.72), 0, 0.005, 0),
  ])
}

/** Capsule hanging down from its top joint, spanning `bone` metres. */
function limbGeometry(radius, bone) {
  const g = tint(new CapsuleGeometry(radius, Math.max(0.02, bone - radius * 1.2), 1, 5), 1, 1, 1)
  return place(g, 0, -bone / 2, 0)
}

function bootGeometry() {
  return merge([place(box(0.13, 0.1, 0.25), 0, -0.015, 0.045), place(box(0.14, 0.03, 0.27, [0.45, 0.45, 0.45]), 0, -0.07, 0.045)])
}

export function buildSoldierGeometries() {
  return {
    pelvis: box(0.34, 0.22, 0.24),
    torso: torsoGeometry(),
    vest: vestGeometry(),
    head: headGeometry(),
    helmet: helmetGeometry(),
    upperArm: limbGeometry(0.062, 0.27),
    foreArm: limbGeometry(0.055, 0.27),
    thigh: limbGeometry(0.085, 0.41),
    shin: limbGeometry(0.073, 0.41),
    boot: bootGeometry(),
    hand: tint(new IcosahedronGeometry(0.055, 0), 1, 1, 1),
  }
}

// --- Weapons (grip at the origin, barrel along +Z) -----------------------------------

const STEEL = [0.17, 0.18, 0.2]
const GUNMETAL = [0.32, 0.33, 0.36]
const BLACK = [0.1, 0.1, 0.11]
const WOOD = [0.46, 0.28, 0.13]
const OLIVE = [0.33, 0.36, 0.24]
const TAN = [0.62, 0.53, 0.36]

const barrel = (r, len, z, y, col = STEEL) => place(cyl(r, r, len, 6, col), 0, y, z, Math.PI / 2)

function pistol() {
  return merge([
    place(box(0.032, 0.045, 0.19, GUNMETAL), 0, 0.045, 0.06),
    place(box(0.03, 0.03, 0.15, BLACK), 0, 0.012, 0.05),
    place(box(0.03, 0.1, 0.045, BLACK), 0, -0.035, -0.005, -0.25),
  ])
}

function smg() {
  return merge([
    place(box(0.045, 0.07, 0.28, BLACK), 0, 0.03, 0.06),
    barrel(0.012, 0.09, 0.24, 0.045),
    place(box(0.03, 0.14, 0.035, GUNMETAL), 0, -0.06, 0.1, 0.1),
    place(box(0.03, 0.08, 0.04, BLACK), 0, -0.03, 0, -0.3),
    place(box(0.022, 0.04, 0.15, GUNMETAL), 0, 0.02, -0.1),
    place(box(0.018, 0.07, 0.02, GUNMETAL), 0, -0.0, -0.17),
  ])
}

function rifle() {
  return merge([
    place(box(0.05, 0.08, 0.3, STEEL), 0, 0.03, 0.05),
    place(box(0.056, 0.06, 0.2, WOOD), 0, 0.028, 0.29),
    barrel(0.013, 0.2, 0.47, 0.04),
    place(box(0.012, 0.04, 0.012, STEEL), 0, 0.075, 0.5),
    place(box(0.035, 0.17, 0.06, GUNMETAL), 0, -0.07, 0.13, 0.32),
    place(box(0.032, 0.09, 0.045, BLACK), 0, -0.04, -0.01, -0.3),
    place(box(0.042, 0.085, 0.26, WOOD), 0, -0.005, -0.17, 0.08),
  ])
}

function shotgun() {
  return merge([
    place(box(0.05, 0.07, 0.22, BLACK), 0, 0.03, 0.03),
    barrel(0.016, 0.42, 0.35, 0.052),
    barrel(0.013, 0.32, 0.3, 0.018, GUNMETAL),
    place(box(0.062, 0.058, 0.14, WOOD), 0, 0.015, 0.28),
    place(box(0.046, 0.088, 0.28, WOOD), 0, -0.005, -0.17, 0.1),
  ])
}

function sniper() {
  return merge([
    place(box(0.05, 0.07, 0.3, OLIVE), 0, 0.03, 0.06),
    place(cyl(0.012, 0.015, 0.52, 6, STEEL), 0, 0.045, 0.45, Math.PI / 2),
    place(cyl(0.024, 0.024, 0.25, 8, BLACK), 0, 0.11, 0.07, Math.PI / 2),
    place(box(0.02, 0.04, 0.05, BLACK), 0, 0.08, 0.07),
    place(box(0.05, 0.095, 0.32, OLIVE), 0, -0.005, -0.18, 0.06),
    place(box(0.012, 0.18, 0.012, BLACK), 0.03, -0.06, 0.36, 0.3, 0, 0.3),
    place(box(0.012, 0.18, 0.012, BLACK), -0.03, -0.06, 0.36, 0.3, 0, -0.3),
    place(box(0.03, 0.05, 0.06, BLACK), 0, -0.03, 0.12),
  ])
}

function mg() {
  return merge([
    place(box(0.07, 0.1, 0.34, BLACK), 0, 0.03, 0.05),
    place(cyl(0.03, 0.03, 0.26, 8, GUNMETAL), 0, 0.05, 0.33, Math.PI / 2),
    barrel(0.014, 0.18, 0.54, 0.05),
    place(box(0.09, 0.1, 0.11, TAN), -0.07, -0.03, 0.08),
    place(box(0.02, 0.05, 0.12, BLACK), 0, 0.11, 0.1),
    place(box(0.032, 0.09, 0.045, BLACK), 0, -0.05, -0.02, -0.3),
    place(box(0.05, 0.09, 0.26, BLACK), 0, 0.01, -0.16, 0.05),
    place(box(0.012, 0.2, 0.012, BLACK), 0.03, -0.06, 0.46, 0.35, 0, 0.35),
    place(box(0.012, 0.2, 0.012, BLACK), -0.03, -0.06, 0.46, 0.35, 0, -0.35),
  ])
}

/** Shoulder-fired tube: olive launcher, a rocket's warhead poking out, grips and sight. */
function rocket() {
  return merge([
    place(cyl(0.055, 0.055, 1.0, 8, OLIVE), 0, 0.07, -0.06, Math.PI / 2),
    place(cyl(0.062, 0.062, 0.08, 8, BLACK), 0, 0.07, 0.44, Math.PI / 2),
    place(cyl(0.065, 0.062, 0.1, 8, BLACK), 0, 0.07, -0.55, Math.PI / 2),
    place(tint(new CylinderGeometry(0.01, 0.05, 0.16, 6), 0.55, 0.5, 0.36), 0, 0.07, 0.56, Math.PI / 2),
    place(box(0.03, 0.09, 0.04, BLACK), 0, -0.02, 0, -0.2),
    place(box(0.03, 0.08, 0.04, BLACK), 0, -0.01, 0.22, -0.2),
    place(box(0.035, 0.05, 0.06, BLACK), -0.06, 0.13, 0.1),
  ])
}

/** Flame gun with a fuel tank slung under it and a pilot-light nozzle. */
function flame() {
  const tank = [0.62, 0.16, 0.1]
  return merge([
    place(box(0.05, 0.07, 0.36, GUNMETAL), 0, 0.04, 0.1),
    place(cyl(0.022, 0.03, 0.22, 6, STEEL), 0, 0.045, 0.38, Math.PI / 2),
    place(cyl(0.035, 0.035, 0.05, 6, BLACK), 0, 0.045, 0.5, Math.PI / 2),
    place(cyl(0.05, 0.05, 0.26, 8, tank), 0, -0.04, 0.12, Math.PI / 2),
    place(box(0.03, 0.09, 0.04, BLACK), 0, -0.03, -0.02, -0.25),
    place(box(0.04, 0.07, 0.16, GUNMETAL), 0, 0.02, -0.14),
  ])
}

/** Mortar tube with its base plate at the back. */
function mortar() {
  return merge([
    place(cyl(0.05, 0.055, 0.78, 8, OLIVE), 0, 0.05, 0.08, Math.PI / 2),
    place(cyl(0.06, 0.06, 0.05, 8, BLACK), 0, 0.05, 0.47, Math.PI / 2),
    place(box(0.26, 0.03, 0.22, STEEL), 0, 0.05, -0.32, Math.PI / 2),
    place(box(0.02, 0.2, 0.02, BLACK), 0.05, -0.05, 0.12, 0.4),
    place(box(0.02, 0.2, 0.02, BLACK), -0.05, -0.05, 0.12, 0.4),
  ])
}

export function buildWeaponGeometries() {
  return { pistol: pistol(), smg: smg(), rifle: rifle(), shotgun: shotgun(), sniper: sniper(), mg: mg(), rocket: rocket(), flame: flame(), mortar: mortar() }
}

/** Triangle count of a geometry (for the perf report). */
export const triangles = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3
