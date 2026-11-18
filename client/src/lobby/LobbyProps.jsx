import { useEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'

import Soldiers from '../battle/render/Soldiers'
import { makeSoldier, resetSoldier } from '../battle/sim/soldier'
import { UNIT_ORDER, UNIT_TYPES } from '../battle/sim/units'
import { addFrameHook, PHASE } from '../battle/state'
import { ARMORY_LINE, FLAGPOLE, PAD_RADIUS, RADIO_MAST, STATIONS } from './baseCamp'
import { lobby, useLobby } from './lobbyState'

/**
 * Base Camp's live props: the station pads (glowing rings you step into), their floating
 * signs, the camp flag waving on its pole, the radio mast's warning light and the armory
 * line-up of your troops standing at ease.
 */

const LIVE = new Color('#ff8a1f')
const SOON = new Color('#9aa3ad')
const m4 = new Matrix4()
const q4 = new Quaternion()
const p3 = new Vector3()
const s3 = new Vector3()

// --- Pads -------------------------------------------------------------------------------

function Pads() {
  const parts = useMemo(() => {
    const n = STATIONS.length
    const ringGeo = new RingGeometry(PAD_RADIUS - 0.28, PAD_RADIUS, 48).rotateX(-Math.PI / 2)
    const discGeo = new CircleGeometry(PAD_RADIUS - 0.28, 40).rotateX(-Math.PI / 2)
    const ringMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false })
    const discMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false })
    const rings = new InstancedMesh(ringGeo, ringMat, n)
    const discs = new InstancedMesh(discGeo, discMat, n)
    for (const mesh of [rings, discs]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      STATIONS.forEach((st, i) => mesh.setColorAt(i, st.live ? LIVE : SOON))
    }
    return { rings, discs, ringGeo, discGeo, ringMat, discMat }
  }, [])
  useEffect(
    () => () => {
      parts.ringGeo.dispose()
      parts.discGeo.dispose()
      parts.ringMat.dispose()
      parts.discMat.dispose()
    },
    [parts],
  )
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const t = state.clock.elapsedTime
        const zone = useLobby.getState().zone
        STATIONS.forEach((st, i) => {
          const on = zone === st.id
          const pulse = 1 + Math.sin(t * 3 + i) * 0.03 + (on ? 0.06 : 0)
          q4.identity()
          p3.set(st.x, 0.04, st.z)
          s3.set(pulse, 1, pulse)
          m4.compose(p3, q4, s3)
          parts.rings.setMatrixAt(i, m4)
          p3.y = 0.035
          s3.set(1, 1, 1)
          m4.compose(p3, q4, s3)
          parts.discs.setMatrixAt(i, m4)
        })
        parts.rings.instanceMatrix.needsUpdate = true
        parts.discs.instanceMatrix.needsUpdate = true
      }),
    [parts],
  )
  return (
    <>
      <primitive object={parts.discs} />
      <primitive object={parts.rings} />
    </>
  )
}

// --- Signs ------------------------------------------------------------------------------

function drawSign(ctx, st) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.font = '72px "Fredoka One", system-ui, sans-serif'
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(20,24,30,0.9)'
  ctx.fillStyle = '#ffffff'
  ctx.strokeText(st.title.toUpperCase(), W / 2, 92)
  ctx.fillText(st.title.toUpperCase(), W / 2, 92)
  ctx.fillStyle = st.live ? '#ff8a1f' : '#9aa3ad'
  ctx.fillRect(W / 2 - 70, 112, 140, 8)
  ctx.font = '600 36px system-ui, "Segoe UI", sans-serif'
  ctx.lineWidth = 8
  ctx.strokeText(st.sub, W / 2, 170)
  ctx.fillStyle = st.live ? '#ffe2c2' : '#d6dbe0'
  ctx.fillText(st.sub, W / 2, 170)
}

function Signs() {
  const signs = useMemo(
    () =>
      STATIONS.map((st) => {
        const c = document.createElement('canvas')
        c.width = 640
        c.height = 200
        drawSign(c.getContext('2d'), st)
        const map = new CanvasTexture(c)
        map.colorSpace = SRGBColorSpace
        const mat = new SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false })
        const sprite = new Sprite(mat)
        sprite.position.set(st.x, 3.6, st.z)
        sprite.scale.set(5.6, 1.75, 1)
        sprite.renderOrder = 4
        return { st, c, map, mat, sprite }
      }),
    [],
  )
  // Redraw once the display font has loaded (the first draw may use the fallback).
  useEffect(() => {
    let cancelled = false
    document.fonts?.load('72px "Fredoka One"').then(() => {
      if (cancelled) return
      for (const s of signs) {
        drawSign(s.c.getContext('2d'), s.st)
        s.map.needsUpdate = true
      }
    })
    return () => {
      cancelled = true
      for (const s of signs) {
        s.map.dispose()
        s.mat.dispose()
      }
    }
  }, [signs])
  // A gentle bob.
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const t = state.clock.elapsedTime
        signs.forEach((s, i) => {
          s.sprite.position.y = 3.6 + Math.sin(t * 1.4 + i) * 0.08
        })
      }),
    [signs],
  )
  return signs.map((s) => <primitive key={s.st.id} object={s.sprite} />)
}

// --- Flag and radio light -------------------------------------------------------------------

function flagTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ff8a1f'
  ctx.fillRect(0, 0, 256, 160)
  ctx.fillStyle = '#c9640a'
  ctx.fillRect(0, 126, 256, 34)
  // A floppy helmet.
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(128, 86, 44, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(74, 82, 108, 12)
  ctx.fillStyle = '#ff8a1f'
  ctx.fillRect(108, 96, 10, 14)
  ctx.fillRect(138, 96, 10, 14)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function Flag() {
  const flag = useMemo(() => {
    const geo = new PlaneGeometry(2.6, 1.6, 12, 6).translate(1.3, 0, 0)
    geo.attributes.position.setUsage(DynamicDrawUsage)
    const base = Float32Array.from(geo.attributes.position.array)
    const map = flagTexture()
    const mat = new MeshLambertMaterial({ map, side: DoubleSide })
    return { geo, base, map, mat }
  }, [])
  useEffect(
    () => () => {
      flag.geo.dispose()
      flag.map.dispose()
      flag.mat.dispose()
    },
    [flag],
  )
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        const t = state.clock.elapsedTime
        const pos = flag.geo.attributes.position
        const arr = pos.array
        const b = flag.base
        for (let i = 0; i < arr.length; i += 3) {
          const u = b[i] / 2.6
          arr[i + 2] = Math.sin(t * 4.2 - b[i] * 2.4) * 0.16 * u + Math.sin(t * 2.3 - b[i + 1]) * 0.05 * u
          arr[i + 1] = b[i + 1] - u * u * 0.12
        }
        pos.needsUpdate = true
        flag.geo.computeVertexNormals()
      }),
    [flag],
  )
  return <mesh geometry={flag.geo} material={flag.mat} position={[FLAGPOLE.x + 0.11, FLAGPOLE.height - 0.95, FLAGPOLE.z]} />
}

function RadioLight() {
  const ref = useRef(null)
  const parts = useMemo(() => ({ geo: new SphereGeometry(0.22, 10, 8), mat: new MeshBasicMaterial({ color: '#ff3b30', toneMapped: false }) }), [])
  useEffect(
    () => () => {
      parts.geo.dispose()
      parts.mat.dispose()
    },
    [parts],
  )
  useEffect(
    () =>
      addFrameHook(PHASE.DRAW, (state) => {
        if (ref.current) ref.current.visible = state.clock.elapsedTime % 1.2 < 0.6
      }),
    [],
  )
  return <mesh ref={ref} geometry={parts.geo} material={parts.mat} position={[RADIO_MAST.x, RADIO_MAST.height + 0.15, RADIO_MAST.z]} />
}

// --- Armory line-up ---------------------------------------------------------------------------

/** One soldier of each type standing at ease, shouldering their weapon now and then. */
function useArmory() {
  const world = useMemo(() => {
    const slots = UNIT_ORDER.map((key, i) => {
      const s = makeSoldier(i)
      const t = UNIT_ORDER.length > 1 ? i / (UNIT_ORDER.length - 1) : 0
      resetSoldier(s, UNIT_TYPES[key], 0, ARMORY_LINE.x0 + (ARMORY_LINE.x1 - ARMORY_LINE.x0) * t, ARMORY_LINE.z, ARMORY_LINE.yaw, 'hold')
      return s
    })
    return { slots, time: 0 }
  }, [])
  useEffect(
    () =>
      addFrameHook(PHASE.SIM, (_state, delta) => {
        world.time += delta
        const t = world.time
        // Look at you when you come close.
        const p = lobby.player
        for (const s of world.slots) {
          const near = Math.hypot(p.x - s.x, p.z - s.z) < 7
          const wantReady = !near && Math.sin(t * 0.45 + s.seed * 3) > 0.55 ? 1 : 0
          s.ready += (wantReady - s.ready) * Math.min(1, delta * 3)
          const look = near ? Math.atan2(p.x - s.x, p.z - s.z) : s.yaw + Math.sin(t * 0.3 + s.seed) * 0.35
          let d = look - s.aimYaw
          d = Math.atan2(Math.sin(d), Math.cos(d))
          s.aimYaw += d * Math.min(1, delta * 4)
          s.aimPitch = 0
        }
      }),
    [world],
  )
  return world
}

export default function LobbyProps() {
  const armory = useArmory()
  const getArmory = useMemo(() => () => armory, [armory])
  return (
    <>
      <Pads />
      <Signs />
      <Flag />
      <RadioLight />
      <Soldiers getWorld={getArmory} capacity={UNIT_ORDER.length} />
    </>
  )
}
