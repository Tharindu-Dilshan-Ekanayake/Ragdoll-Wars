import { BoxGeometry, Color, Euler, Float32BufferAttribute, Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Vehicle crews: the drivers, gunners, commanders and door gunners riding in the
 * vehicles (sim/vehicles.js CREW says who sits where). Two poses, each one small merged
 * geometry drawn instanced for every crewman of every vehicle:
 *
 * - 'seated': sitting on a seat, origin at the seat, hands forward on a wheel or a gun,
 *   shins hanging down.
 * - 'hatch': standing in a hatch or behind a pintle gun, origin at the waist, arms
 *   forward on the rim; the legs are left out (they're inside the vehicle).
 *
 * +Z is the way they face. Uniform parts carry `aTeam` = 1 and take the team colour from
 * the instance colour (crewMaterial), everything else - skin, helmet, vest, boots -
 * keeps its own colour. About 200 triangles a crewman.
 */

const tmpM = new Matrix4()
const tmpQ = new Quaternion()
const tmpE = new Euler()
const tmpP = new Vector3()
const tmpS = new Vector3()
const tmpC = new Color()

const SKIN = '#e0ad84'
const HELMET = '#4f583a'
const VEST = '#5b6443'
const BOOT = '#2a2520'
const GLOVE = '#3a3428'

/** A part: geometry, colour, whether it takes the team colour, placement. */
function part(geo, hex, team, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  g.deleteAttribute('uv')
  tmpC.set(hex)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  const t = new Float32Array(n).fill(team ? 1 : 0)
  for (let i = 0; i < n; i += 1) {
    col[i * 3] = tmpC.r
    col[i * 3 + 1] = tmpC.g
    col[i * 3 + 2] = tmpC.b
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('aTeam', new Float32BufferAttribute(t, 1))
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz))
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, 1, 1))
  return g.applyMatrix4(tmpM)
}

const box = (w, h, d) => new BoxGeometry(w, h, d)

/** Head, helmet and torso with its vest, from the waist (y = 0) up. */
function upperBody(lean = 0) {
  const c = Math.cos(lean)
  const sn = Math.sin(lean)
  const at = (y, z = 0) => [z * c + y * sn, y * c - z * sn]
  const [tz, ty] = at(0.3)
  const [hz, hy] = at(0.74)
  const [nz, ny] = at(0.6)
  return [
    // Uniform (team colour), vest and belt over it.
    part(box(0.42, 0.56, 0.24), '#ffffff', true, 0, ty, tz, lean),
    part(box(0.45, 0.36, 0.28), VEST, false, 0, ty + 0.06, tz, lean),
    part(box(0.44, 0.07, 0.27), BOOT, false, 0, 0.04, 0),
    part(box(0.13, 0.1, 0.13), SKIN, false, 0, ny, nz, lean),
    part(box(0.22, 0.25, 0.23), SKIN, false, 0, hy, hz, lean),
    part(new SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), HELMET, false, 0, hy + 0.07, hz, lean),
    part(box(0.36, 0.035, 0.38), HELMET, false, 0, hy + 0.06, hz + 0.01, lean),
  ]
}

/** Both arms reaching forward to hands at (±hx, hy, hz), shoulders at y = 0.5. */
function arms(hx, hy, hz, lean = 0) {
  const out = []
  const sy = 0.5 * Math.cos(lean)
  const szz = 0.5 * Math.sin(lean)
  for (const sx of [-1, 1]) {
    const ax = sx * 0.27
    const ex = (ax + sx * hx) / 2
    const ey = (sy + hy) / 2 - 0.08
    const ez = (szz + hz) / 2
    // Upper arm shoulder -> elbow, forearm elbow -> hand.
    const seg = (x0, y0, z0, x1, y1, z1, w, hex, team) => {
      const dx = x1 - x0
      const dy = y1 - y0
      const dz = z1 - z0
      const len = Math.hypot(dx, dy, dz)
      const g = box(w, len, w)
      tmpQ.setFromUnitVectors(tmpP.set(0, 1, 0), tmpS.set(dx / len, dy / len, dz / len))
      tmpE.setFromQuaternion(tmpQ)
      out.push(part(g, hex, team, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, tmpE.x, tmpE.y, tmpE.z))
    }
    seg(ax, sy, szz, ex, ey, ez, 0.12, '#ffffff', true)
    seg(ex, ey, ez, sx * hx, hy, hz, 0.1, '#ffffff', true)
    out.push(part(box(0.1, 0.1, 0.12), GLOVE, false, sx * hx, hy, hz))
  }
  return out
}

function merge(parts) {
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

function seated() {
  const parts = [...upperBody(0.12), ...arms(0.2, 0.36, 0.42, 0.12)]
  for (const sx of [-1, 1]) {
    // Thigh forward along the seat, shin down, boot.
    parts.push(part(box(0.16, 0.15, 0.48), '#8c8c8c', true, sx * 0.11, 0.06, 0.22))
    parts.push(part(box(0.14, 0.44, 0.14), '#8c8c8c', true, sx * 0.11, -0.16, 0.44))
    parts.push(part(box(0.15, 0.1, 0.25), BOOT, false, sx * 0.11, -0.39, 0.5))
  }
  return merge(parts)
}

function hatch() {
  const parts = [...upperBody(0), ...arms(0.24, 0.3, 0.32)]
  // Hips, so no gap shows above a hatch rim.
  parts.push(part(box(0.4, 0.4, 0.24), '#8c8c8c', true, 0, -0.2, 0))
  return merge(parts)
}

export function buildCrewGeometries() {
  return { seated: seated(), hatch: hatch() }
}

/**
 * The crew's material: vertex colours, with the instance colour (the team's) applied
 * only to the uniform (`aTeam`), so skin and kit keep their own colours.
 */
export function crewMaterial() {
  const m = new MeshLambertMaterial({ vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aTeam;\nvoid main() {')
      // three tints the whole crewman by the instance colour; undo it off the uniform.
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  #ifdef USE_INSTANCING_COLOR
    vColor.xyz = mix(color.xyz, vColor.xyz, aTeam);
  #endif`,
      )
  }
  m.customProgramCacheKey = () => 'ff-crew'
  return m
}
