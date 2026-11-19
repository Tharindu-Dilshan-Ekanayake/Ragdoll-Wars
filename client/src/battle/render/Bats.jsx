import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BAT_LIFT } from '../sim/zombies'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * Zombie Horde's bats: every flying soldier slot (sim/zombies.js batStep) drawn as a
 * small dark bat with red eyes, wings flapping. One instanced mesh, one draw call, ~50
 * triangles each; the flap is done in the vertex shader. Drawn on every preset (they
 * matter for the game), with no shadows.
 */

const MAX_BATS = 48
const BODY = '#2b2230'
const WING = '#3d3048'
const EYE = '#ff3b2f'

/** A coloured part for the merged geometry: position and colour only. */
function part(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const c = new Color(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return g
}

/** One wing (side +1 right, -1 left): a scalloped fan from the shoulder out. */
function wing(side) {
  const pts = [
    [0.07, 0.02, 0.14], // shoulder, front
    [0.07, 0.0, -0.18], // shoulder, back
    [0.66, 0.06, 0.02], // tip
    [0.46, -0.02, -0.34], // trailing corner
    [0.3, 0.0, -0.1],
  ]
  const tri = [
    [0, 1, 2],
    [1, 3, 2],
    [1, 4, 3],
  ]
  const pos = []
  for (const t of tri) for (const k of t) pos.push(pts[k][0] * side, pts[k][1], pts[k][2])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return part(g, WING)
}

function batGeometry() {
  const parts = [
    part(new BoxGeometry(0.17, 0.15, 0.36), BODY),
    part(new BoxGeometry(0.13, 0.12, 0.13).translate(0, 0.02, 0.24), BODY),
    // Ears.
    part(new BoxGeometry(0.04, 0.1, 0.03).translate(0.045, 0.1, 0.25), BODY),
    part(new BoxGeometry(0.04, 0.1, 0.03).translate(-0.045, 0.1, 0.25), BODY),
    // Eyes.
    part(new BoxGeometry(0.03, 0.03, 0.02).translate(0.04, 0.04, 0.31), EYE),
    part(new BoxGeometry(0.03, 0.03, 0.02).translate(-0.04, 0.04, 0.31), EYE),
    wing(1),
    wing(-1),
  ]
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

const m4 = new Matrix4()
const q4 = new Quaternion()
const e4 = new Euler(0, 0, 0, 'YXZ')
const p3 = new Vector3()
const s3 = new Vector3(1, 1, 1)

export default function Bats() {
  const parts = useMemo(() => {
    const geo = batGeometry()
    const phase = new InstancedBufferAttribute(new Float32Array(MAX_BATS), 1)
    phase.setUsage(DynamicDrawUsage)
    geo.setAttribute('aPhase', phase)
    const uTime = { value: 0 }
    const mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aPhase;\nuniform float uTime;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += sin(uTime * 17.0 + aPhase) * max(0.0, abs(position.x) - 0.08) * 0.8;')
    }
    mat.customProgramCacheKey = () => 'ff-bat'
    const mesh = new InstancedMesh(geo, mat, MAX_BATS)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    return { geo, mat, mesh, phase, uTime }
  }, [])

  useEffect(() => {
    const { mesh, phase, uTime } = parts
    const off = addFrameHook(PHASE.DRAW, (state) => {
      const w = battle.world
      if (!w) return
      uTime.value = state.clock.elapsedTime
      let n = 0
      for (let i = 0; i < w.slots.length && n < MAX_BATS; i += 1) {
        const s = w.slots[i]
        if (!s.used || !s.alive || !s.flying) continue
        // Nose down a little as it dives, up as it climbs; yaw to where it's going.
        e4.set(-0.25, s.yaw, 0)
        q4.setFromEuler(e4)
        m4.compose(p3.set(s.x, s.fy + BAT_LIFT, s.z), q4, s3)
        mesh.setMatrixAt(n, m4)
        phase.array[n] = s.seed
        n += 1
      }
      mesh.count = n
      if (n) {
        mesh.instanceMatrix.clearUpdateRanges()
        mesh.instanceMatrix.addUpdateRange(0, n * 16)
        mesh.instanceMatrix.needsUpdate = true
        phase.needsUpdate = true
      }
    })
    return off
  }, [parts])

  useEffect(
    () => () => {
      parts.geo.dispose()
      parts.mat.dispose()
    },
    [parts],
  )

  return <primitive object={parts.mesh} />
}
