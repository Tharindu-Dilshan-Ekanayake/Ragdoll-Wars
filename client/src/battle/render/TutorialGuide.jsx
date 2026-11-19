import { useEffect, useMemo } from 'react'
import { AdditiveBlending, CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'

import { addFrameHook, battle, PHASE } from '../state'
import { stairNear, useTutorial } from '../tutorial'

/**
 * The first-time guide in the world (battle/tutorial.js): a beam of light and a bobbing
 * arrow where to go, and a trail of glowing dots there from where you stand. Three draw
 * calls, only while the guide is up.
 */

const MAX_DOTS = 70
const GAP = 1.3
const GOLD = '#ffd25a'

const m4 = new Matrix4()
const p3 = new Vector3()
const s3 = new Vector3(1, 1, 1)
const qI = new Quaternion()
const PATH = Array.from({ length: 3 }, () => new Vector3())

export default function TutorialGuide() {
  const step = useTutorial((s) => s.step)
  const parts = useMemo(() => {
    const beamMat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    const beam = new Mesh(new CylinderGeometry(0.55, 0.55, 16, 18, 1, true).translate(0, 8, 0), beamMat)
    const arrowMat = new MeshBasicMaterial({ color: GOLD })
    const arrow = new Mesh(new ConeGeometry(0.5, 1.0, 4).rotateX(Math.PI), arrowMat)
    const dotMat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, depthWrite: false })
    const dots = new InstancedMesh(new CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), dotMat, MAX_DOTS)
    dots.instanceMatrix.setUsage(DynamicDrawUsage)
    dots.frustumCulled = false
    dots.count = 0
    for (const o of [beam, arrow, dots]) {
      o.visible = false
      o.renderOrder = 4
    }
    return { beam, arrow, dots, mats: [beamMat, arrowMat, dotMat] }
  }, [])

  useEffect(() => {
    const { beam, arrow, dots } = parts
    const off = addFrameHook(PHASE.DRAW, (state) => {
      const w = battle.world
      const s = useTutorial.getState().step
      const show = Boolean(w && w.rampart && (s === 'climb' || s === 'place'))
      beam.visible = arrow.visible = dots.visible = show
      if (!show) return
      const wk = battle.walk
      const t = state.clock.elapsedTime
      let target
      let path = 0
      if (s === 'climb') {
        const st = stairNear(w, wk.z)
        if (!st) return
        target = st.top
        // You -> the foot of the stair -> up it.
        PATH[0].set(wk.x, 0, wk.z)
        PATH[1].set(st.base.x, st.base.y, st.base.z)
        PATH[2].set(st.top.x, st.top.y, st.top.z)
        path = 3
      } else {
        // On the walkway, just in front of you: where to drop your first soldier.
        const deck = w.rampart.segs[0]?.h || 4.5
        target = { x: w.rampart.front - 1.4, y: deck, z: wk.z }
      }
      beam.position.set(target.x, target.y, target.z)
      arrow.position.set(target.x, target.y + 2.2 + Math.sin(t * 3) * 0.3, target.z)
      arrow.rotation.y = t * 1.5
      let n = 0
      if (path) {
        for (let k = 0; k < path - 1 && n < MAX_DOTS; k += 1) {
          const a = PATH[k]
          const b = PATH[k + 1]
          const len = a.distanceTo(b)
          // The dots creep along towards the target.
          const off = (t * 1.6) % GAP
          for (let d = off; d < len && n < MAX_DOTS; d += GAP) {
            p3.lerpVectors(a, b, d / len)
            m4.compose(p3.setY(p3.y + 0.06), qI, s3)
            dots.setMatrixAt(n, m4)
            n += 1
          }
        }
      }
      dots.count = n
      if (n) {
        dots.instanceMatrix.clearUpdateRanges()
        dots.instanceMatrix.addUpdateRange(0, n * 16)
        dots.instanceMatrix.needsUpdate = true
      }
    })
    return off
  }, [parts])

  useEffect(
    () => () => {
      for (const o of [parts.beam, parts.arrow, parts.dots]) o.geometry.dispose()
      for (const m of parts.mats) m.dispose()
    },
    [parts],
  )

  if (!step) return null
  return (
    <>
      <primitive object={parts.beam} />
      <primitive object={parts.arrow} />
      <primitive object={parts.dots} />
    </>
  )
}
