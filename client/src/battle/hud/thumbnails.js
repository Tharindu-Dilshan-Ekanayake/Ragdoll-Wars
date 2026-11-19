import {
  BoxGeometry,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { buildCover, coverMaterials } from '../render/coverGeometry'
import { buildHelicopterGeometry, MAIN_ROTOR_PIVOT } from '../render/helicopterModel'
import { buildWeaponGeometries } from '../render/models'
import { buildPiecesGeometry, coverBoxesOf } from '../render/structureModels'
import { getTextures } from '../render/textures'
import { buildVehicleGeometries } from '../render/vehicleModels'
import { BUILD_TYPES, pieceBoxes } from '../sim/pieces'

/**
 * Pictures for the dock's cards, rendered from the game's own 3D models: every weapon,
 * vehicle, helicopter, strike and build piece, three-quarter view, lit like a product
 * shot, on a transparent background. Done once per page on a small throwaway renderer,
 * a few pictures per frame so the battle doesn't hitch, then the renderer is let go;
 * the results are data URLs the cards show as plain images (no GPU memory kept).
 */

const W = 200
const H = 120
const cache = new Map()
let running = null

const tmpColor = new Color()
const tint = (g, hex) => {
  const c = tmpColor.set(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3))
  if (g.attributes.uv) g.deleteAttribute('uv')
  return g.index ? g.toNonIndexed() : g
}

/** A medic's kit: a white case with a red cross. */
function medkit() {
  return mergeGeometries([
    tint(new BoxGeometry(0.5, 0.34, 0.2), '#e9e6df'),
    tint(new BoxGeometry(0.24, 0.07, 0.205).translate(0, 0, 0.003), '#d23a32'),
    tint(new BoxGeometry(0.07, 0.24, 0.205).translate(0, 0, 0.003), '#d23a32'),
    tint(new BoxGeometry(0.18, 0.05, 0.05).translate(0, 0.2, 0), '#55595e'),
  ])
}

/** A landmine (as on the battlefield, Ordnance.jsx). */
function mine() {
  return mergeGeometries([tint(new CylinderGeometry(0.27, 0.3, 0.1, 14), '#4b5233'), tint(new CylinderGeometry(0.08, 0.08, 0.05, 10).translate(0, 0.07, 0), '#2d3020'), tint(new SphereGeometry(0.03, 6, 4).translate(0.12, 0.06, 0), '#ff4d3a')])
}

/** A big bomb with tail fins. */
function bomb() {
  return mergeGeometries([
    tint(new CylinderGeometry(0.22, 0.22, 1.3, 12).rotateX(Math.PI / 2), '#5d6448'),
    tint(new SphereGeometry(0.22, 12, 8).scale(1, 1, 1.6).translate(0, 0, 0.65), '#5d6448'),
    tint(new CylinderGeometry(0.22, 0.08, 0.4, 12).rotateX(Math.PI / 2).translate(0, 0, -0.85), '#4a503a'),
    tint(new BoxGeometry(0.62, 0.03, 0.3).translate(0, 0, -1.0), '#3d4230'),
    tint(new BoxGeometry(0.03, 0.62, 0.3).translate(0, 0, -1.0), '#3d4230'),
    tint(new BoxGeometry(0.46, 0.04, 0.06).translate(0, 0, 0.2), '#d9b13a'),
  ])
}

/** What to draw for `key`: { meshes: [[geometry, material]], yaw, pitch } (geometries owned). */
function subjectFor(key, kit) {
  const { body, trim } = kit.mats
  const weapons = kit.weapons
  if (weapons[key]) return { parts: [[weapons[key], body]], yaw: -Math.PI / 2 + 0.35, pitch: 0.32, keep: true }
  if (key === 'medic') return { parts: [[medkit(), body]], yaw: -0.5, pitch: 0.35 }
  if (key === 'mine') return { parts: [[mine(), body]], yaw: 0.3, pitch: 0.7 }
  if (key === 'heavybomb') return { parts: [[bomb(), body]], yaw: -Math.PI / 2 + 0.4, pitch: 0.3 }
  if (key === 'airstrike') return { parts: [[kit.vehicles.jet, body]], yaw: -2.5, pitch: 0.5, keep: true }
  if (key === 'gunship' || key === 'scout') {
    const g = kit.heli
    const rotor = g.mainRotor.clone().translate(...MAIN_ROTOR_PIVOT)
    return { parts: [[g.body, body], [rotor, body]], yaw: -2.3, pitch: 0.38, keepFirst: true }
  }
  const v = kit.vehicles[key]
  if (v) {
    const top = v.top.clone().translate(...v.pivot)
    const t = v.trim
    return { parts: [[v.body, body], [top, body], [t, trim]], yaw: -2.35, pitch: 0.42, keepFirst: true }
  }
  if (BUILD_TYPES[key]) {
    const st = { key, x: 0, z: 0, rot: 0, seed: 0.37, boxes: pieceBoxes(key, 0, 0, 0) }
    const parts = []
    const own = buildPiecesGeometry([st])
    if (own) parts.push([own, body])
    const cover = buildCover({ obstacles: coverBoxesOf([st]) })
    for (const [k, g] of Object.entries(cover)) if (g && g.attributes?.position?.count) parts.push([g, kit.cover[k === 'roofs' ? 'roof' : k] || body])
    return { parts, yaw: -2.4, pitch: 0.55 }
  }
  return null
}

const box3 = new Box3()
const centre = new Vector3()
const size = new Vector3()

/** Renders `keys` into data URLs (cached); calls `onEach(key, url)` as each is ready. */
export function renderThumbnails(keys, onEach) {
  const todo = keys.filter((k) => !cache.has(k))
  for (const k of keys) if (cache.has(k)) onEach(k, cache.get(k))
  if (!todo.length) return Promise.resolve()
  if (running) return running.then(() => renderThumbnails(keys, onEach))
  running = (async () => {
    let renderer = null
    try {
      const canvas = document.createElement('canvas')
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      renderer.setSize(W, H, false)
      renderer.setClearColor(0x000000, 0)
      const scene = new Scene()
      scene.add(new HemisphereLight('#ffffff', '#4a4a52', 2.2))
      const key = new DirectionalLight('#fff6e6', 2.6)
      key.position.set(-3, 5, 4)
      scene.add(key)
      const rim = new DirectionalLight('#9cc4ff', 1.4)
      rim.position.set(4, 2, -5)
      scene.add(rim)
      const camera = new PerspectiveCamera(28, W / H, 0.01, 500)
      const tex = getTextures()
      const kit = {
        weapons: buildWeaponGeometries(),
        vehicles: buildVehicleGeometries(),
        heli: buildHelicopterGeometry(),
        mats: { body: new MeshLambertMaterial({ vertexColors: true }), trim: new MeshLambertMaterial({ color: '#3f7ddf' }) },
        cover: coverMaterials(tex),
      }
      const holder = new Group()
      scene.add(holder)
      for (let i = 0; i < todo.length; i += 1) {
        const k = todo[i]
        const subject = subjectFor(k, kit)
        if (!subject) continue
        holder.clear()
        for (const [g, m] of subject.parts) holder.add(new Mesh(g, m))
        holder.rotation.set(0, subject.yaw, 0)
        holder.position.set(0, 0, 0)
        holder.updateMatrixWorld(true)
        box3.setFromObject(holder)
        box3.getCenter(centre)
        box3.getSize(size)
        holder.position.sub(centre)
        // Fit: back the camera off along a raised three-quarter direction.
        // The picture is wider than tall: long things may use its whole width.
        const aspect = W / H
        const tall = size.y * Math.cos(subject.pitch) + size.z * Math.sin(subject.pitch)
        const radius = Math.max((size.x * 0.5) / aspect, tall * 0.5, 0.05) * 1.12
        const dist = radius / Math.tan((28 * Math.PI) / 360)
        camera.position.set(0, Math.sin(subject.pitch) * dist, Math.cos(subject.pitch) * dist)
        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
        const url = canvas.toDataURL('image/png')
        cache.set(k, url)
        onEach(k, url)
        // Our own geometries go; the shared model sets are disposed at the end.
        subject.parts.forEach(([g], idx) => {
          if (subject.keep || (subject.keepFirst && idx === 0)) return
          g.dispose()
        })
        if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0))
      }
      holder.clear()
      for (const g of Object.values(kit.weapons)) g.dispose()
      for (const v of Object.values(kit.vehicles)) {
        if (v.isBufferGeometry) v.dispose()
        else for (const g of [v.body, v.top, v.trim]) g?.dispose()
      }
      for (const g of Object.values(kit.heli)) g.dispose()
      for (const m of [...Object.values(kit.mats), ...Object.values(kit.cover)]) m.dispose()
    } catch (err) {
      console.warn('[thumbnails] could not render', err)
    } finally {
      if (renderer) {
        renderer.dispose()
        renderer.forceContextLoss()
      }
      running = null
    }
  })()
  return running
}

export const thumbnail = (key) => cache.get(key) || null
