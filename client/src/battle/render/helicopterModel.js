import { BoxGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Floppy Front's transport helicopter, built from primitives in code: an olive body with
 * an orange tail band and a dark canopy, landing skids, and separate main and tail
 * rotors so they can spin. Used by the lobby's arrival flight (and later by air units).
 *
 * Local space: +Z is the nose, +Y up, the skids rest on y = 0. About 11 m long with a
 * 10 m rotor; ~700 triangles in three draw calls.
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

function merge(parts) {
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

const OLIVE = 0x6d7a47
const OLIVE_DARK = 0x56603b
const ORANGE = 0xff8a1f
const GLASS = 0x5a7a96
const STEEL = 0x3a3d42
const DOOR = 0x3c4430

/** Where the rotors spin about, in local space. */
export const MAIN_ROTOR_PIVOT = [0, 3.62, 0]
export const TAIL_ROTOR_PIVOT = [0.28, 3.05, -7.35]

export function buildHelicopterGeometry() {
  const body = merge([
    place(tint(new SphereGeometry(1, 14, 10), OLIVE), 0, 1.75, 0.5, 0, 0, 0, 1.25, 1.15, 2.6),
    place(tint(new SphereGeometry(1, 12, 8), GLASS), 0, 2.05, 2.2, -0.15, 0, 0, 1.0, 0.75, 1.15),
    place(tint(new BoxGeometry(1.35, 0.7, 2.3), OLIVE_DARK), 0, 2.8, -0.3),
    place(tint(new CylinderGeometry(0.2, 0.45, 6.2, 8), OLIVE), 0, 2.25, -4.5, Math.PI / 2 + 0.05),
    place(tint(new BoxGeometry(0.16, 1.7, 1.05), OLIVE), 0, 3.0, -7.35, -0.3),
    place(tint(new BoxGeometry(0.18, 0.38, 1.08), ORANGE), 0, 3.6, -7.55, -0.3),
    place(tint(new BoxGeometry(2.5, 0.08, 0.62), OLIVE_DARK), 0, 2.35, -6.5),
    place(tint(new BoxGeometry(2.5, 0.2, 0.34), ORANGE), 0, 1.55, -1.45),
    place(tint(new BoxGeometry(0.06, 0.95, 1.15), DOOR), 1.22, 1.72, 0.4),
    place(tint(new BoxGeometry(0.06, 0.95, 1.15), DOOR), -1.22, 1.72, 0.4),
    place(tint(new CylinderGeometry(0.12, 0.14, 0.55, 8), STEEL), 0, 3.35, 0),
    // A door gun on a swing arm at each open door, for the door gunners.
    place(tint(new BoxGeometry(0.9, 0.12, 0.12), STEEL), 1.75, 1.74, 0.4),
    place(tint(new BoxGeometry(0.9, 0.12, 0.12), STEEL), -1.75, 1.74, 0.4),
    place(tint(new BoxGeometry(0.1, 0.4, 0.1), STEEL), 1.42, 1.5, 0.4),
    place(tint(new BoxGeometry(0.1, 0.4, 0.1), STEEL), -1.42, 1.5, 0.4),
    // Skids and struts.
    place(tint(new CylinderGeometry(0.07, 0.07, 4.8, 6), STEEL), 1.1, 0.07, 0.4, Math.PI / 2),
    place(tint(new CylinderGeometry(0.07, 0.07, 4.8, 6), STEEL), -1.1, 0.07, 0.4, Math.PI / 2),
    place(tint(new BoxGeometry(0.08, 1.0, 0.08), STEEL), 0.98, 0.55, 1.4, 0, 0, 0.25),
    place(tint(new BoxGeometry(0.08, 1.0, 0.08), STEEL), -0.98, 0.55, 1.4, 0, 0, -0.25),
    place(tint(new BoxGeometry(0.08, 1.0, 0.08), STEEL), 0.98, 0.55, -0.7, 0, 0, 0.25),
    place(tint(new BoxGeometry(0.08, 1.0, 0.08), STEEL), -0.98, 0.55, -0.7, 0, 0, -0.25),
  ])
  // Main rotor about its own pivot: hub and three blades.
  const blades = [tint(new CylinderGeometry(0.28, 0.28, 0.2, 10), STEEL)]
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3
    blades.push(place(tint(new BoxGeometry(0.34, 0.05, 5.0), i === 0 ? 0x2a2d31 : 0x33363b), Math.sin(a) * 2.6, 0.05, Math.cos(a) * 2.6, 0, a, 0))
    // Orange tip on each blade.
    blades.push(place(tint(new BoxGeometry(0.35, 0.06, 0.4), ORANGE), Math.sin(a) * 4.9, 0.05, Math.cos(a) * 4.9, 0, a, 0))
  }
  const mainRotor = merge(blades)
  const tailRotor = merge([
    tint(new BoxGeometry(0.05, 1.7, 0.18), 0x2a2d31),
    tint(new BoxGeometry(0.05, 0.18, 1.7), 0x2a2d31),
    tint(new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateZ(Math.PI / 2), STEEL),
  ])
  return { body, mainRotor, tailRotor }
}
