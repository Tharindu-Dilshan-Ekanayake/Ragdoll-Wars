import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'

import { addFrameHook, battle, PHASE } from '../state'
import { BoxBatch, col, hash } from './coverGeometry'
import { getTextures } from './textures'

/**
 * The rampart (Mirefall Bastion): stone sections with buttresses and a crenellated
 * parapet, stairs at the back, lamp posts along the top throwing beams into the mist -
 * and, for each section, the heap of rubble it becomes when it falls.
 *
 * Two meshes hold every section (standing / fallen); each vertex knows its section and
 * the shader drops the ones that don't apply (a uniform per section), so a section
 * coming down costs no new geometry and no extra draw calls. Lamps are instanced and
 * re-laid only when a section's state changes. ~5 draw calls in all.
 */

const MAX_SEGS = 8
/** 1 = standing, per section (shared by both wall materials; one battle at a time). */
const upUniform = { value: new Array(MAX_SEGS).fill(1) }

const STONE = '#8e8a7f'

/** Tags every vertex added to `batch` since `from` with section `seg` (-1: always shown). */
function tagSince(batch, from, seg, tags) {
  for (let i = from; i < batch.pos.length / 3; i += 1) tags.push(seg)
}

function sectionGeometry(batch, tags, d, parapet) {
  const from = batch.pos.length / 3
  const v = 0.94 + hash(d.x, d.z) * 0.1
  const stone = col(STONE).multiplyScalar(v)
  const dark = col(STONE).multiplyScalar(v * 0.78)
  const x0 = d.x - d.w / 2
  const x1 = d.x + d.w / 2
  const z0 = d.z - d.d / 2
  const h = d.h
  // The body, its face set back between buttresses.
  batch.box(d.x - 0.3, h / 2, d.z, d.w - 0.6, h, d.d, stone)
  for (let z = z0 + 1.4; z < z0 + d.d - 0.8; z += 5.5) batch.box(x1 - 0.32, h / 2 - 0.1, z, 0.64, h - 0.2, 1.3, dark)
  // A plinth along the foot and a course of darker stone near the top.
  batch.box(x1 - 0.5, 0.35, d.z, 0.9, 0.7, d.d, dark)
  batch.box(x1 - 0.62, h - 0.45, d.z, 0.06, 0.3, d.d, dark)
  // The walkway and a kerb at the back.
  batch.box(d.x, h + 0.03, d.z, d.w - 0.05, 0.06, d.d - 0.02, col('#6e6b63').multiplyScalar(v))
  batch.box(x0 + 0.15, h + 0.17, d.z, 0.3, 0.28, d.d, dark)
  // The parapet: a low wall with merlons.
  if (parapet) {
    const px = parapet.x
    batch.box(px, h + 0.3, d.z, parapet.w, 0.6, d.d, stone)
    for (let z = z0 + 0.6; z < z0 + d.d - 0.4; z += 1.7) batch.box(px, h + 0.8, z + 0.5, parapet.w + 0.04, 0.42, 1.0, stone)
  }
  tagSince(batch, from, d.seg, tags)
}

function rubbleGeometry(batch, tags, d) {
  const from = batch.pos.length / 3
  const dark = col('#6f6b62')
  const x0 = d.x - d.w / 2
  // A broken stump along the back, then tumbled blocks across the footprint.
  batch.box(x0 + 0.9, 0.7, d.z, 1.8, 1.4, d.d, dark)
  for (let k = 0; k < 26; k += 1) {
    const r1 = hash(d.z + k * 1.7, d.x - k)
    const r2 = hash(d.x + k * 3.1, d.z + k)
    const r3 = hash(k, d.z * 0.7)
    const s = 0.6 + r3 * 1.5
    const c = col(STONE).multiplyScalar(0.6 + r1 * 0.35)
    batch.box(x0 + 1 + r1 * (d.w + 1.5), s * 0.35 + r2 * 0.4, d.z - d.d / 2 + r2 * d.d, s * (0.8 + r2 * 0.6), s * 0.7, s * (0.8 + r1 * 0.6), c)
  }
  tagSince(batch, from, d.seg, tags)
}

/** Lambert with the section switch: `show` 1 draws standing sections, 0 fallen ones. */
function wallMaterial(map, show) {
  const m = new MeshLambertMaterial({ vertexColors: true, map })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uUp = upUniform
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `attribute float aSeg;\nuniform float uUp[${MAX_SEGS}];\nvoid main() {`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  if (aSeg > -0.5) {
    float up = uUp[int(aSeg + 0.5)];
    if (${show ? 'up < 0.5' : 'up > 0.5'}) transformed = vec3(0.0, -500.0, 0.0);
  }`,
      )
  }
  m.customProgramCacheKey = () => `ff-rampart-${show}`
  return m
}

const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()
const ZERO = new Vector3(0, 0, 0)

export default function Rampart({ map }) {
  const parts = useMemo(() => {
    const decks = map.obstacles.filter((o) => o.rampart === 'deck')
    if (!decks.length) return null
    const tex = getTextures()
    const wall = new BoxBatch()
    const wallTags = []
    const rubble = new BoxBatch()
    const rubbleTags = []
    for (const d of decks) {
      const parapet = map.obstacles.find((o) => o.rampart === 'parapet' && o.seg === d.seg)
      sectionGeometry(wall, wallTags, d, parapet)
      rubbleGeometry(rubble, rubbleTags, d)
    }
    // Stairs (always there).
    for (const o of map.obstacles.filter((b) => b.rampart === 'step')) {
      const from = wall.pos.length / 3
      wall.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, col('#837f75'))
      tagSince(wall, from, -1, wallTags)
    }
    const wallGeo = wall.build()
    wallGeo.setAttribute('aSeg', new Float32BufferAttribute(wallTags, 1))
    const rubbleGeo = rubble.build()
    rubbleGeo.setAttribute('aSeg', new Float32BufferAttribute(rubbleTags, 1))

    // Lamps: a post at the back of the walkway leaning an arm out over the parapet.
    const lamps = (map.lamps || []).map((z) => {
      const d = decks.find((k) => z >= k.z - k.d / 2 && z <= k.z + k.d / 2) || decks[0]
      return { seg: d.seg, x: d.x - d.w / 2 + 0.6, z, top: d.h, headX: d.x + d.w / 2 - 1.2 }
    })
    const postGeo = new BoxGeometry(0.16, 4.2, 0.16).translate(0, 2.1, 0)
    const headGeo = new BoxGeometry(0.42, 0.14, 0.3)
    const beamGeo = new ConeGeometry(3.4, 9, 20, 1, true).translate(0, -4.5, 0)
    const poolGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const metal = new MeshLambertMaterial({ color: '#3d4247' })
    const glow = new MeshBasicMaterial({ color: '#fff4cf' })
    const beamMat = new MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.075, depthWrite: false, blending: AdditiveBlending, side: DoubleSide })
    const poolMat = new MeshBasicMaterial({ color: '#ffdf9a', map: tex.blob, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending })
    const n = Math.max(1, lamps.length)
    const posts = new InstancedMesh(postGeo, metal, n * 2)
    const heads = new InstancedMesh(headGeo, glow, n)
    const beams = new InstancedMesh(beamGeo, beamMat, n)
    const pools = new InstancedMesh(poolGeo, poolMat, n * 2)
    for (const mesh of [posts, heads, beams, pools]) {
      mesh.frustumCulled = false
      mesh.count = lamps.length * (mesh === posts || mesh === pools ? 2 : 1)
    }
    pools.renderOrder = 2
    beams.renderOrder = 3
    const wallMat = wallMaterial(tex.concrete, true)
    const rubbleMat = wallMaterial(tex.concrete, false)
    return { wallGeo, rubbleGeo, wallMat, rubbleMat, lamps, posts, heads, beams, pools, geos: [postGeo, headGeo, beamGeo, poolGeo], mats: [metal, glow, beamMat, poolMat], segs: decks.length }
  }, [map])

  useEffect(
    () => () => {
      if (!parts) return
      parts.wallGeo.dispose()
      parts.rubbleGeo.dispose()
      parts.wallMat.dispose()
      parts.rubbleMat.dispose()
      for (const g of parts.geos) g.dispose()
      for (const m of parts.mats) m.dispose()
      for (const m of [parts.posts, parts.heads, parts.beams, parts.pools]) m.dispose()
    },
    [parts],
  )

  // Section states -> the wall shader, and the lamps re-laid when one changes.
  useEffect(() => {
    if (!parts) return undefined
    let key = -1
    upUniform.value.fill(1)
    return addFrameHook(PHASE.DRAW, () => {
      const r = battle.world?.rampart
      if (!r) return
      let k = 0
      for (let i = 0; i < r.segs.length; i += 1) {
        const up = r.segs[i].up ? 1 : 0
        upUniform.value[i] = up
        k |= up << i
      }
      if (k === key) return
      key = k
      parts.lamps.forEach((l, i) => {
        const on = (k >> l.seg) & 1
        const y = l.top
        // Post (with the arm as a second, sideways post) and the lamp head.
        if (on) {
          m4.compose(p3.set(l.x, y, l.z), q4.identity(), s3.set(1, 1, 1))
          parts.posts.setMatrixAt(i * 2, m4)
          const armLen = l.headX - l.x
          q4.setFromAxisAngle(p3.set(0, 0, 1), Math.PI / 2)
          m4.compose(p3.set(l.x + armLen / 2, y + 4.15, l.z), q4, s3.set(1, armLen / 4.2, 1))
          parts.posts.setMatrixAt(i * 2 + 1, m4)
          m4.compose(p3.set(l.headX, y + 4.0, l.z), q4.identity(), s3.set(1, 1, 1))
          parts.heads.setMatrixAt(i, m4)
          // Beam: down and out over the field from the head.
          q4.setFromAxisAngle(p3.set(0, 0, 1), 0.42)
          m4.compose(p3.set(l.headX, y + 3.9, l.z), q4, s3.set(1, 1, 1))
          parts.beams.setMatrixAt(i, m4)
          // Pools of light on the walkway and on the ground out front.
          m4.compose(p3.set(l.headX - 0.6, y + 0.08, l.z), q4.identity(), s3.set(6, 1, 6))
          parts.pools.setMatrixAt(i * 2, m4)
          m4.compose(p3.set(l.headX + 5.2, 0.06, l.z), q4.identity(), s3.set(9, 1, 7))
          parts.pools.setMatrixAt(i * 2 + 1, m4)
        } else {
          m4.compose(ZERO, q4.identity(), s3.set(0, 0, 0))
          parts.posts.setMatrixAt(i * 2, m4)
          parts.posts.setMatrixAt(i * 2 + 1, m4)
          parts.heads.setMatrixAt(i, m4)
          parts.beams.setMatrixAt(i, m4)
          parts.pools.setMatrixAt(i * 2, m4)
          parts.pools.setMatrixAt(i * 2 + 1, m4)
        }
      })
      for (const m of [parts.posts, parts.heads, parts.beams, parts.pools]) m.instanceMatrix.needsUpdate = true
    })
  }, [parts])

  if (!parts) return null
  return (
    <group>
      <mesh geometry={parts.wallGeo} material={parts.wallMat} frustumCulled={false} />
      <mesh geometry={parts.rubbleGeo} material={parts.rubbleMat} frustumCulled={false} />
      {parts.lamps.length > 0 && (
        <>
          <primitive object={parts.posts} />
          <primitive object={parts.heads} />
          <primitive object={parts.pools} />
          <primitive object={parts.beams} />
        </>
      )}
    </group>
  )
}
