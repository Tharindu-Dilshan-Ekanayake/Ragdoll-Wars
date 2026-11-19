import { useEffect, useMemo, useRef } from 'react'
import { MeshLambertMaterial } from 'three'

import { useQuality } from '../../store/quality'
import { battle } from '../state'
import { buildCover, coverMaterials } from './coverGeometry'
import { buildPiecesGeometry, coverBoxesOf } from './structureModels'
import { getTextures } from './textures'

/**
 * Everything built in build mode: the classic kinds (sandbags, barriers, walls, crates,
 * containers, tents, posts) through the battlefield's cover renderer, build mode's own
 * pieces as one merged mesh. Up to seven draw calls however much is built.
 *
 * Rebuilt only when something is built or destroyed - noticed by a 10 Hz check of the
 * build's version, outside the frame loop - so standing structures cost nothing per frame.
 */

const COVER_KEYS = ['concrete', 'bags', 'crates', 'steel', 'wood', 'roofs']
const MAT_OF = { concrete: 'concrete', bags: 'bags', crates: 'crates', steel: 'steel', wood: 'wood', roofs: 'roof' }

export default function Structures() {
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const refs = useRef({})
  const piecesRef = useRef(null)

  const mats = useMemo(() => ({ ...coverMaterials(getTextures()), pieces: new MeshLambertMaterial({ vertexColors: true }) }), [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  useEffect(() => {
    let lastWorld = null
    let lastVersion = -1
    let geos = []
    const apply = () => {
      const w = battle.world
      if (!w) return
      if (w === lastWorld && w.build.version === lastVersion) return
      lastWorld = w
      lastVersion = w.build.version
      for (const g of geos) g.dispose()
      geos = []
      const list = w.build.list
      const cover = buildCover({ obstacles: coverBoxesOf(list) })
      for (const k of COVER_KEYS) {
        const mesh = refs.current[k]
        const g = cover[k]
        if (g) geos.push(g)
        if (!mesh) continue
        if (g && g.attributes.position.count) {
          mesh.geometry = g
          mesh.visible = true
        } else mesh.visible = false
      }
      const pieces = buildPiecesGeometry(list)
      if (pieces) geos.push(pieces)
      const pm = piecesRef.current
      if (pm) {
        if (pieces) {
          pm.geometry = pieces
          pm.visible = true
        } else pm.visible = false
      }
    }
    apply()
    const id = setInterval(apply, 100)
    return () => {
      clearInterval(id)
      for (const g of geos) g.dispose()
    }
  }, [])

  return (
    <group>
      {COVER_KEYS.map((k) => (
        <mesh
          key={k}
          ref={(m) => {
            refs.current[k] = m
          }}
          material={mats[MAT_OF[k]]}
          visible={false}
          castShadow={shadows}
          receiveShadow={shadows}
          frustumCulled={false}
        />
      ))}
      <mesh ref={piecesRef} material={mats.pieces} visible={false} castShadow={shadows} receiveShadow={shadows} frustumCulled={false} />
    </group>
  )
}
