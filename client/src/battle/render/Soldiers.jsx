import { useEffect, useMemo } from 'react'
import {
  Color,
  DynamicDrawUsage,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  Sphere,
} from 'three'

import { useQuality } from '../../store/quality'
import { MAX_SLOTS } from '../sim/constants'
import { groundAt } from '../sim/terrain'
import { animate, buildParts, J_PELVIS, PART_COUNT, P_WEAPON, TRS } from '../sim/rig'
import { UNIT_TYPES, WEAPON_MODELS, weaponModelIndex } from '../sim/units'
import { addFrameHook, battle, PHASE } from '../state'
import { buildSoldierGeometries, buildWeaponGeometries } from './models'
import { getTextures } from './textures'

/**
 * Every soldier, alive or dead, drawn with one instanced mesh per body part (11) plus
 * one per weapon model (9; empty ones are hidden and cost nothing): ~20 draw calls for
 * the whole army however big it gets. With
 * realtime shadows on, bodies on the ground go into a second set of meshes that casts
 * none (their shadows are invisible anyway, and it halves the shadow pass).
 *
 * Each frame: frustum-cull per soldier, pose the visible ones (far ones every 2nd/3rd
 * frame, reusing their cached parts in between), and pack them to the front of each
 * mesh so off-screen soldiers cost no triangles at all. Settled bodies keep their
 * parts cached until something moves them.
 */

// Which mesh each part goes into (arms, legs, boots and hands share a mesh per pair).
const MESH_KEYS = ['pelvis', 'torso', 'vest', 'head', 'helmet', 'upperArm', 'foreArm', 'thigh', 'shin', 'boot', 'hand']
const PART_TO_MESH = [0, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
const PER_SOLDIER = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]
/** Parts big enough to be worth a realtime shadow (small ones and weapons skip it). */
const CASTS_SHADOW = [true, true, true, true, true, true, false, true, true, false, false]
/**
 * Limb meshes (upper arms, thighs, shins): their shadows only when the camera is close
 * (on foot, or zoomed in). From the commander's height a body's shadow reads the same
 * without them, and they're over a third of the soldiers' shadow pass.
 */
const LIMB_SHADOW = [false, false, false, false, false, true, false, true, true, false, false]
const NEAR_SHADOWS = 45

// Colour role per part: 0 shirt, 1 vest, 2 pants, 3 helmet, 4 skin, 5 boots. Sleeves are
// rolled up: shirt on the upper arms (with the cuff baked in, models.js), bare forearms.
const PART_ROLE = [2, 0, 1, 4, 3, 0, 0, 4, 4, 2, 2, 2, 2, 5, 5, 4, 4]
const TEAM_COLORS = [
  ['#3f7ddf', '#5b6443', '#2f3d5c', '#2d5cc0', null, '#2a2520'],
  ['#d84848', '#646043', '#583132', '#b53232', null, '#2a2520'],
]
const SKIN = ['#f1c9a5', '#e3b088', '#c98d5f', '#a36a43', '#7c4c2c']

const toRGB = (hex) => {
  const c = new Color(hex)
  return [c.r, c.g, c.b]
}
const PALETTE = TEAM_COLORS.map((roles) => roles.map((h) => (h ? toRGB(h) : null)))
const SKIN_RGB = SKIN.map(toRGB)
const RING_RGB = [toRGB('#7fb4ff'), toRGB('#ff8a8a')]
// Zombies: torn clothes, green skin, hair where the helmet would be; per type.
const ZOMBIE_COLORS = {
  zombie: ['#5f6a52', '#4b4237', '#3c4454', '#2b2620', '#86a86e', '#2a2520'],
  runner: ['#7a5f4a', '#5a4434', '#4a4a40', '#3a2a1e', '#93b07a', '#2a2520'],
  brute: ['#6b3f33', '#4e3a2c', '#3a3f48', '#221d18', '#7a9a62', '#231f1b'],
  behemoth: ['#4d4f3a', '#3a3328', '#2e3238', '#1a1714', '#6c8a58', '#1d1a17'],
}
const ZOMBIE_PAL = Object.fromEntries(Object.entries(ZOMBIE_COLORS).map(([k, roles]) => [k, roles.map(toRGB)]))

/** Medics wear white helmets. */
const MEDIC_HELMET = toRGB('#eceae4')
const HELMET_PART = 4

const frustum = new Frustum()
const projView = new Matrix4()
const sphere = new Sphere()

/** The weapon mesh for a mortar set up on the ground. */
const MORTAR_SET = WEAPON_MODELS.indexOf('mortarSet')

function writeMatrix(arr, o, px, py, pz, qx, qy, qz, qw, s) {
  const x2 = qx + qx
  const y2 = qy + qy
  const z2 = qz + qz
  const xx = qx * x2
  const xy = qx * y2
  const xz = qx * z2
  const yy = qy * y2
  const yz = qy * z2
  const zz = qz * z2
  const wx = qw * x2
  const wy = qw * y2
  const wz = qw * z2
  arr[o] = (1 - (yy + zz)) * s
  arr[o + 1] = (xy + wz) * s
  arr[o + 2] = (xz - wy) * s
  arr[o + 3] = 0
  arr[o + 4] = (xy - wz) * s
  arr[o + 5] = (1 - (xx + zz)) * s
  arr[o + 6] = (yz + wx) * s
  arr[o + 7] = 0
  arr[o + 8] = (xz + wy) * s
  arr[o + 9] = (yz - wx) * s
  arr[o + 10] = (1 - (xx + yy)) * s
  arr[o + 11] = 0
  arr[o + 12] = px
  arr[o + 13] = py
  arr[o + 14] = pz
  arr[o + 15] = 1
}

function makeMesh(geometry, material, capacity, withColor) {
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  if (withColor) {
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    mesh.instanceColor.setUsage(DynamicDrawUsage)
  }
  mesh.frustumCulled = false
  mesh.count = 0
  return mesh
}

function flush(mesh, count, withColor) {
  mesh.count = count
  if (!count) return
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.addUpdateRange(0, count * 16)
  mesh.instanceMatrix.needsUpdate = true
  if (withColor && mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges()
    mesh.instanceColor.addUpdateRange(0, count * 3)
    mesh.instanceColor.needsUpdate = true
  }
}

/**
 * @param {{ getWorld: () => ({ slots: object[], time: number } | null), capacity?: number }}
 *   props: where the soldiers come from (the battle simulation, or the lobby's armory
 *   line-up), and how many slots to size the instance buffers for.
 */
export default function Soldiers({ getWorld, capacity = MAX_SLOTS }) {
  const realtimeShadows = useQuality((s) => s.settings.shadows === 'realtime')

  const rig = useMemo(() => {
    const geos = buildSoldierGeometries()
    const weaponGeos = buildWeaponGeometries()
    const material = new MeshLambertMaterial({ vertexColors: true })
    const makeSet = () => ({
      parts: MESH_KEYS.map((k, i) => makeMesh(geos[k], material, capacity * PER_SOLDIER[i], true)),
      weapons: WEAPON_MODELS.map((k) => makeMesh(weaponGeos[k], material, capacity, true)),
      counts: new Int32Array(MESH_KEYS.length),
      wcounts: new Int32Array(WEAPON_MODELS.length),
    })
    const tex = getTextures()
    const shadowMat = new MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false })
    const shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const shadows = makeMesh(shadowGeo, shadowMat, capacity, false)
    shadows.renderOrder = 1
    const ringGeo = new RingGeometry(0.52, 0.66, 28).rotateX(-Math.PI / 2)
    const ringMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })
    const rings = makeMesh(ringGeo, ringMat, capacity, true)
    rings.renderOrder = 2
    return {
      sets: [makeSet(), makeSet()],
      shadows,
      rings,
      material,
      shadowMat,
      ringMat,
      geos: [...Object.values(geos), ...Object.values(weaponGeos), shadowGeo, ringGeo],
      cache: Array.from({ length: capacity }, () => new Float32Array(PART_COUNT * TRS)),
      cacheKey: new Float64Array(capacity).fill(-1),
      frame: 0,
    }
  }, [capacity])

  useEffect(
    () => () => {
      for (const g of rig.geos) g.dispose()
      rig.material.dispose()
      rig.shadowMat.dispose()
      rig.ringMat.dispose()
    },
    [rig],
  )

  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const w = getWorld()
        const cam = state.camera
        if (!w) return
        const q = useQuality.getState().settings
        if (realtimeShadows) {
          const near = battle.walk.on || battle.view.dist < NEAR_SHADOWS
          if (near !== rig.limbShadows) {
            rig.limbShadows = near
            rig.sets[0].parts.forEach((m, i) => {
              if (LIMB_SHADOW[i]) m.castShadow = near
            })
          }
        }
        rig.frame += 1
        const frame = rig.frame
        projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        frustum.setFromProjectionMatrix(projView)
        const cx = cam.position.x
        const cz = cam.position.z
        const lodNear2 = q.lodNear * q.lodNear
        const lodFar2 = q.lodNear * 2 * (q.lodNear * 2)
        for (const set of rig.sets) {
          set.counts.fill(0)
          set.wcounts.fill(0)
        }
        let nShadow = 0
        let nRing = 0
        const shadowArr = rig.shadows.instanceMatrix.array
        const ringArr = rig.rings.instanceMatrix.array
        const ringCol = rig.rings.instanceColor.array

        const n = Math.min(capacity, w.slots.length)
        for (let i = 0; i < n; i += 1) {
          const s = w.slots[i]
          if (!s.used) continue
          const trs = rig.cache[i]
          let px
          let pz
          if (s.alive) {
            px = s.x
            pz = s.z
            sphere.center.set(px, 0.9 + s.dropY + s.fy, pz)
            sphere.radius = 1.4
            if (!frustum.intersectsSphere(sphere)) continue
            const d2 = (px - cx) * (px - cx) + (pz - cz) * (pz - cz)
            const valid = rig.cacheKey[i] === s.id
            const skip = valid && ((d2 > lodFar2 && (frame + i) % 3 !== 0) || (d2 > lodNear2 && (frame + i) % 2 !== 0))
            if (!skip) {
              animate(s, s.joints, w.time)
              // Big zombies: the whole pose scaled up from the feet.
              const size = UNIT_TYPES[s.type].size || 1
              if (size !== 1) {
                const j = s.joints
                for (let k = 0; k < j.length; k += 3) {
                  j[k] = s.x + (j[k] - s.x) * size
                  j[k + 1] *= size
                  j[k + 2] = s.z + (j[k + 2] - s.z) * size
                }
              }
              buildParts(s.joints, trs, s.scale * size)
              rig.cacheKey[i] = s.id
            }
          } else {
            px = s.joints[J_PELVIS * 3]
            pz = s.joints[J_PELVIS * 3 + 2]
            sphere.center.set(px, 0.4, pz)
            sphere.radius = 1.6
            if (!frustum.intersectsSphere(sphere)) continue
            const key = -s.id * 100000 - s.poseVersion
            if (rig.cacheKey[i] !== key) {
              buildParts(s.joints, trs, UNIT_TYPES[s.type].size || 1)
              rig.cacheKey[i] = key
            }
          }

          const set = rig.sets[realtimeShadows && !s.alive ? 1 : 0]
          const counts = set.counts
          const wcounts = set.wcounts
          // Colours: team palette, skin by seed, a little variation; bodies darker,
          // the selected brighter.
          const zpal = ZOMBIE_PAL[s.type]
          const pal = zpal || PALETTE[s.team]
          const skin = zpal ? zpal[4] : SKIN_RGB[Math.floor(s.seed) % SKIN_RGB.length]
          const vary = 0.92 + ((s.seed * 7.31) % 1) * 0.16
          // The burnt end up charred black.
          const shade = (s.alive ? 1 : 0.72) * (s.selected ? 1.18 : 1) * (s.charred ? 0.28 : 1) * vary
          const medic = s.type === 'medic'
          for (let p = 0; p < P_WEAPON; p += 1) {
            const mi = PART_TO_MESH[p]
            const mesh = set.parts[mi]
            const idx = counts[mi]++
            const o = p * TRS
            writeMatrix(mesh.instanceMatrix.array, idx * 16, trs[o], trs[o + 1], trs[o + 2], trs[o + 3], trs[o + 4], trs[o + 5], trs[o + 6], trs[o + 7])
            const role = PART_ROLE[p]
            const col = role === 4 ? skin : medic && p === HELMET_PART ? MEDIC_HELMET : pal[role]
            const k = role === 4 ? (s.charred ? 0.3 : 1) : shade
            const ca = mesh.instanceColor.array
            ca[idx * 3] = col[0] * k
            ca[idx * 3 + 1] = col[1] * k
            ca[idx * 3 + 2] = col[2] * k
          }
          // A mortar gunner standing still has his mortar set up on the ground in front of
          // him; a loader at work has put his rifle away.
          const settled = s.alive && !s.downed && s.dropY <= 0 && s.animMove < 0.15
          const deployed = settled && UNIT_TYPES[s.type].crew
          const wi = deployed ? MORTAR_SET : settled && s.loaderOf >= 0 ? -1 : weaponModelIndex(s.type)
          if (wi >= 0) {
            const mesh = set.weapons[wi]
            const idx = wcounts[wi]++
            if (deployed) {
              const half = s.aimYaw / 2
              writeMatrix(mesh.instanceMatrix.array, idx * 16, s.x + Math.sin(s.aimYaw) * 0.8, s.fy, s.z + Math.cos(s.aimYaw) * 0.8, 0, Math.sin(half), 0, Math.cos(half), 1)
            } else {
              const o = P_WEAPON * TRS
              writeMatrix(mesh.instanceMatrix.array, idx * 16, trs[o], trs[o + 1], trs[o + 2], trs[o + 3], trs[o + 4], trs[o + 5], trs[o + 6], trs[o + 7])
            }
            const ca = mesh.instanceColor.array
            ca[idx * 3] = ca[idx * 3 + 1] = ca[idx * 3 + 2] = s.alive ? 1 : 0.8
          }

          if (!realtimeShadows) {
            const size = s.alive ? 0.95 - Math.min(0.5, s.dropY * 0.15) : 1.5
            // Under their feet: on the ground, or up on the rampart.
            writeMatrix(shadowArr, nShadow * 16, px, (s.alive ? s.fy : groundAt(w.terrain, px, pz)) + 0.025 + (i % 7) * 0.001, pz, 0, 0, 0, 1, size)
            nShadow += 1
          }
          if (s.selected && s.alive) {
            writeMatrix(ringArr, nRing * 16, px, s.fy + 0.04, pz, 0, 0, 0, 1, 1)
            const rc = RING_RGB[s.team]
            ringCol[nRing * 3] = rc[0]
            ringCol[nRing * 3 + 1] = rc[1]
            ringCol[nRing * 3 + 2] = rc[2]
            nRing += 1
          }
        }

        for (const set of rig.sets) {
          // Empty meshes are hidden: an instanced mesh with no instances still costs a
          // draw call otherwise.
          for (let m = 0; m < set.parts.length; m += 1) {
            flush(set.parts[m], set.counts[m], true)
            set.parts[m].visible = set.counts[m] > 0
          }
          for (let m = 0; m < set.weapons.length; m += 1) {
            flush(set.weapons[m], set.wcounts[m], true)
            set.weapons[m].visible = set.wcounts[m] > 0
          }
        }
        flush(rig.shadows, nShadow, false)
        flush(rig.rings, nRing, true)
      }),
    [rig, realtimeShadows, getWorld, capacity],
  )

  return (
    <group>
      {rig.sets.map((set, si) => [
        ...set.parts.map((m, i) => <primitive key={`p${si}-${i}`} object={m} castShadow={realtimeShadows && si === 0 && CASTS_SHADOW[i] && (!LIMB_SHADOW[i] || rig.limbShadows !== false)} />),
        ...set.weapons.map((m, i) => <primitive key={`w${si}-${i}`} object={m} castShadow={false} />),
      ])}
      <primitive object={rig.shadows} visible={!realtimeShadows} />
      <primitive object={rig.rings} />
    </group>
  )
}
