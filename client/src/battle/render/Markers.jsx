import { useEffect, useMemo, useRef } from 'react'
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three'

import { useHud } from '../hud/hudStore'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * Ground markers: the placement ghost (one ring per soldier about to drop, in the
 * squad's formation) and the expanding ring where a move order was sent.
 */
const MAX_GHOST = 10
const TEAM_RGB = [new Color('#6aa8ff'), new Color('#ff7a7a')]
const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()

export default function Markers({ map }) {
  const moveRef = useRef(null)
  const parts = useMemo(() => {
    const ghostGeo = new RingGeometry(0.3, 0.42, 20).rotateX(-Math.PI / 2)
    const ghostMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
    const ghost = new InstancedMesh(ghostGeo, ghostMat, MAX_GHOST)
    ghost.instanceMatrix.setUsage(DynamicDrawUsage)
    ghost.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_GHOST * 3), 3)
    ghost.frustumCulled = false
    ghost.count = 0
    ghost.renderOrder = 3
    const moveGeo = new RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2)
    const moveMat = new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0, depthWrite: false })
    return { ghost, ghostGeo, ghostMat, moveGeo, moveMat }
  }, [])

  useEffect(
    () => () => {
      parts.ghostGeo.dispose()
      parts.ghostMat.dispose()
      parts.moveGeo.dispose()
      parts.moveMat.dispose()
    },
    [parts],
  )

  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const hud = useHud.getState()
        const ghost = parts.ghost
        const h = battle.hover
        if (hud.placing && h) {
          const n = Math.min(MAX_GHOST, hud.count)
          const enemy = map.bases[1 - hud.team]
          const face = Math.atan2(enemy.x - h.x, enemy.z - h.z)
          const fx = Math.sin(face)
          const fz = Math.cos(face)
          const cols = Math.ceil(Math.sqrt(n))
          const pulse = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.08
          const c = TEAM_RGB[hud.team]
          for (let i = 0; i < n; i += 1) {
            const ox = ((i % cols) - (cols - 1) / 2) * 1.25
            const oz = -Math.floor(i / cols) * 1.25
            p3.set(h.x + fz * ox + fx * oz, 0.05, h.z - fx * ox + fz * oz)
            s3.setScalar(pulse)
            m4.compose(p3, q4.identity(), s3)
            ghost.setMatrixAt(i, m4)
            ghost.setColorAt(i, c)
          }
          ghost.count = n
          ghost.instanceMatrix.needsUpdate = true
          ghost.instanceColor.needsUpdate = true
        } else {
          ghost.count = 0
        }

        const mk = battle.moveMarker
        const mesh = moveRef.current
        if (mesh) {
          const age = mk ? (performance.now() - mk.t) / 1000 : 9
          if (age < 0.8) {
            mesh.position.set(mk.x, 0.06, mk.z)
            mesh.scale.setScalar(1.6 - age * 1.2)
            parts.moveMat.opacity = 1 - age / 0.8
            mesh.visible = true
          } else mesh.visible = false
        }
      }),
    [parts, map],
  )

  return (
    <group>
      <primitive object={parts.ghost} />
      <mesh
        ref={moveRef}
        geometry={parts.moveGeo}
        material={parts.moveMat}
        visible={false}
        renderOrder={3}
      />
    </group>
  )
}
