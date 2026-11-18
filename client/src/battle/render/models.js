import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  PlaneGeometry,
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
 * Budget: a whole soldier is ~600 triangles plus ~40-140 for the weapon. Built once per battle,
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

/**
 * A limb as a smooth six-sided tube through `rings` ({ y, r, c?, sx?, z? }: height, radius,
 * vertex shade, side-to-side squash, forward offset), top to bottom, with an optional
 * rounded cap at either end (`capTop` / `capBottom`: how far the cap pokes out). Shared
 * ring vertices give smooth shading, so six sides read as round. Ends that sit inside
 * another part (a wrist in its hand, an ankle in its boot) leave the cap off.
 */
function tube(rings, { capTop = 0, capBottom = 0, radial = 6 } = {}) {
  const pos = []
  const colors = []
  const idx = []
  rings.forEach((ring) => {
    const c = ring.c ?? 1
    for (let k = 0; k < radial; k += 1) {
      const a = (k / radial) * Math.PI * 2
      pos.push(Math.cos(a) * ring.r * (ring.sx ?? 1), ring.y, Math.sin(a) * ring.r + (ring.z ?? 0))
      colors.push(c, c, c)
    }
  })
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = r * radial + k
      const b = r * radial + ((k + 1) % radial)
      const c = a + radial
      const d = b + radial
      // Counter-clockwise seen from outside (normals out).
      idx.push(a, b, c, b, d, c)
    }
  }
  const cap = (ringIndex, dy, flip) => {
    const ring = rings[ringIndex]
    const centre = pos.length / 3
    const c = ring.c ?? 1
    pos.push(0, ring.y + dy, ring.z ?? 0)
    colors.push(c, c, c)
    for (let k = 0; k < radial; k += 1) {
      const a = ringIndex * radial + k
      const b = ringIndex * radial + ((k + 1) % radial)
      if (flip) idx.push(centre, b, a)
      else idx.push(centre, a, b)
    }
  }
  if (capTop) cap(0, capTop, true)
  if (capBottom) cap(rings.length - 1, -capBottom, false)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

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

/** Hips in the trousers' colour, a dark belt round the top. */
function pelvisGeometry() {
  const belt = [0.36, 0.33, 0.3]
  return merge([box(0.34, 0.22, 0.24), place(box(0.355, 0.045, 0.255, belt), 0, 0.085, 0)])
}

/** The vest with a row of magazine pouches across the front. */
function vestGeometry() {
  const pouch = [0.8, 0.8, 0.76]
  return merge([box(0.45, 0.3, 0.29), place(box(0.3, 0.09, 0.05, pouch), 0, -0.07, 0.16)])
}

/** A flat face feature (two triangles facing forward) at (x, y) on the head's front. */
function facePatch(w, h, x, y, z, col, rz = 0) {
  return place(tint(new PlaneGeometry(w, h), ...col), x, y, z, 0, 0, rz)
}

function headGeometry() {
  const eye = [0.07, 0.07, 0.08]
  const brow = [0.22, 0.16, 0.12]
  // The crown is always under the helmet (or the zombies' hair): no need for its pole.
  const head = tint(new SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, Math.PI / 6, (Math.PI * 5) / 6), 1, 1, 1)
  head.deleteAttribute('uv')
  const face = [
    facePatch(0.04, 0.052, 0.058, 0.022, 0.152, eye),
    facePatch(0.04, 0.052, -0.058, 0.022, 0.152, eye),
    // Brows, a little frown: a soldier's game face.
    facePatch(0.056, 0.014, 0.06, 0.066, 0.146, brow, -0.18),
    facePatch(0.056, 0.014, -0.06, 0.066, 0.146, brow, 0.18),
    facePatch(0.064, 0.014, 0, -0.056, 0.151, [0.5, 0.3, 0.28]),
  ]
  for (const f of face) f.deleteAttribute('uv')
  return merge([head.toNonIndexed(), ...face.map((f) => f.toNonIndexed())])
}

function helmetGeometry() {
  return merge([
    tint(new SphereGeometry(0.19, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), 1, 1, 1),
    place(tint(new CylinderGeometry(0.2, 0.205, 0.05, 8, 1, true), 0.72, 0.72, 0.72), 0, 0.005, 0),
  ])
}

/** Upper arm (shirt): round shoulder, the sleeve rolled up just above the elbow. */
function upperArmGeometry() {
  return tube(
    [
      { y: 0.02, r: 0.074 },
      { y: -0.18, r: 0.065 },
      { y: -0.192, r: 0.069, c: 1.18 },
      { y: -0.25, r: 0.066, c: 1.1 },
    ],
    { capTop: 0.05, capBottom: 0.025 },
  )
}

/** Forearm (bare, sleeves rolled): thick below the elbow, slim at the wrist (in the hand). */
function foreArmGeometry() {
  return tube(
    [
      { y: 0.015, r: 0.058 },
      { y: -0.08, r: 0.06, sx: 1.08 },
      { y: -0.255, r: 0.042, sx: 1.15 },
    ],
    { capTop: 0.04 },
  )
}

/** Thigh (trousers): full at the hip (inside the pelvis), easing in to the knee. */
function thighGeometry() {
  return tube(
    [
      { y: 0.03, r: 0.1 },
      { y: -0.2, r: 0.093, z: 0.008 },
      { y: -0.41, r: 0.074 },
    ],
    { capBottom: 0.045 },
  )
}

/** Shin (trousers) with a darker knee pad on top, the calf, down into the boot. */
function shinGeometry() {
  return tube(
    [
      { y: 0.035, r: 0.083, c: 0.6, z: 0.01 },
      { y: -0.075, r: 0.08, c: 0.6, z: 0.01 },
      { y: -0.09, r: 0.077, z: -0.004 },
      { y: -0.4, r: 0.058 },
    ],
    { capTop: 0.045 },
  )
}

/** A boot: rounded-off toe, heel, a darker sole. */
function bootGeometry() {
  const upper = box(0.13, 0.11, 0.26)
  const p = upper.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    const z = p.getZ(i)
    const y = p.getY(i)
    // The toe narrows and dips; the top of the toe slopes down to it.
    if (z > 0) {
      p.setX(i, p.getX(i) * 0.78)
      if (y > 0) p.setY(i, y - 0.04)
    }
  }
  upper.computeVertexNormals()
  return merge([place(upper, 0, -0.015, 0.045), place(box(0.14, 0.03, 0.275, [0.42, 0.42, 0.42]), 0, -0.075, 0.045)])
}

/** A hand: a flat palm, narrower at the fingertips and curled forward (as on a grip). */
function handGeometry() {
  const palm = box(0.075, 0.095, 0.05)
  const p = palm.attributes.position
  for (let i = 0; i < p.count; i += 1) {
    if (p.getY(i) < 0) {
      p.setZ(i, p.getZ(i) + 0.014)
      p.setX(i, p.getX(i) * 0.85)
    }
  }
  palm.computeVertexNormals()
  return place(palm, 0, -0.03, 0)
}

export function buildSoldierGeometries() {
  return {
    pelvis: pelvisGeometry(),
    torso: torsoGeometry(),
    vest: vestGeometry(),
    head: headGeometry(),
    helmet: helmetGeometry(),
    upperArm: upperArmGeometry(),
    foreArm: foreArmGeometry(),
    thigh: thighGeometry(),
    shin: shinGeometry(),
    boot: bootGeometry(),
    hand: handGeometry(),
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
