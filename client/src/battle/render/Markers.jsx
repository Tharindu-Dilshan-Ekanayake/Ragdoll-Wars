import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three'

import { useHud } from '../hud/hudStore'
import { segmentClear2D } from '../sim/obstacles'
import { floorAt } from '../sim/levels'
import { deckAt } from '../sim/rampart'
import { BUILD_TYPES } from '../sim/structures'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * Ground markers: the placement ghost (one ring per soldier about to drop, in the
 * squad's formation; or, in build mode, see-through boxes where the pieces will go -
 * green when the ground is clear, red when something's in the way) and the expanding
 * ring where a move order was sent.
 */
const MAX_BUILD_GHOST = 48
const GHOST_OK = new Color('#7dffa0')
const GHOST_BAD = new Color('#ff6b5a')
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
    const boxGeo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
    const boxMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false })
    const boxes = new InstancedMesh(boxGeo, boxMat, MAX_BUILD_GHOST)
    boxes.instanceMatrix.setUsage(DynamicDrawUsage)
    boxes.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_BUILD_GHOST * 3), 3)
    boxes.frustumCulled = false
    boxes.count = 0
    boxes.renderOrder = 3
    return { ghost, ghostGeo, ghostMat, moveGeo, moveMat, boxes, boxGeo, boxMat }
  }, [])

  useEffect(
    () => () => {
      parts.ghostGeo.dispose()
      parts.ghostMat.dispose()
      parts.moveGeo.dispose()
      parts.moveMat.dispose()
      parts.boxGeo.dispose()
      parts.boxMat.dispose()
    },
    [parts],
  )

  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const hud = useHud.getState()
        const ghost = parts.ghost
        const h = battle.hover
        const piece = hud.placing ? BUILD_TYPES[hud.placing] : null
        const boxes = parts.boxes
        boxes.count = 0
        if (piece && h && !piece.tool) {
          // Where each piece goes (same layout as sim/structures.js piecePositions).
          const n = hud.count
          const rot = hud.buildRot
          const w = battle.world
          const cols = Math.ceil(Math.sqrt(n))
          const rows = Math.ceil(n / cols)
          const len = piece.size[0] + 0.05
          let k = 0
          for (let i = 0; i < n && k < MAX_BUILD_GHOST; i += 1) {
            let cx
            let cz
            if (piece.scatter) {
              const jitter = n > 1 ? (((i * 7919) % 97) / 97 - 0.5) * piece.scatter * 0.4 : 0
              cx = h.x + ((i % cols) - (cols - 1) / 2) * piece.scatter + jitter
              cz = h.z + (Math.floor(i / cols) - (rows - 1) / 2) * piece.scatter - jitter
            } else {
              const along = (i - (n - 1) / 2) * len
              cx = h.x + (rot ? 0 : along)
              cz = h.z + (rot ? -along : 0)
            }
            const list = piece.boxes.length ? piece.boxes : null
            const count = list ? list.length : 1
            for (let j = 0; j < count && k < MAX_BUILD_GHOST; j += 1) {
              const o = list ? list[j] : null
              const ox = o ? o.x : 0
              const oz = o ? o.z : 0
              const bw = o ? o.w : piece.size[0]
              const bd = o ? o.d : piece.size[1]
              const bh = o ? Math.min(o.h, 4) : 0.3
              const x = cx + (rot ? oz : ox)
              const z = cz + (rot ? -ox : oz)
              p3.set(x, 0.02, z)
              s3.set(rot ? bd : bw, bh, rot ? bw : bd)
              m4.compose(p3, q4.identity(), s3)
              boxes.setMatrixAt(k, m4)
              // Red where it would sit on cover that's already there.
              const clear = !w || segmentClear2D(w.obs, x - 0.01, z, x + 0.01, z, Math.min(bw, bd) * 0.4)
              boxes.setColorAt(k, clear ? GHOST_OK : GHOST_BAD)
              k += 1
            }
          }
          boxes.count = k
          boxes.instanceMatrix.needsUpdate = true
          boxes.instanceColor.needsUpdate = true
          ghost.count = 0
        } else if (hud.placing && h && !piece) {
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
            p3.set(h.x + fz * ox + fx * oz, (h.y || 0) + 0.05, h.z - fx * ox + fz * oz)
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
            const r = battle.world?.rampart
            const deck = r ? deckAt(r, mk.x, mk.z) : -1
            mesh.position.set(mk.x, (deck >= 0 ? r.segs[deck].h : floorAt(battle.world?.levels, mk.x, mk.z)) + 0.06, mk.z)
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
      <primitive object={parts.boxes} />
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
