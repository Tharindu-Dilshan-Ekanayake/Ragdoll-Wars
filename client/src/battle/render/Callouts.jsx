import { useEffect, useMemo } from 'react'
import { CanvasTexture, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { BARKS } from '../sim/barks'
import { BAT_LIFT } from '../sim/zombies'
import { drain } from '../sim/fx'
import { addFrameHook, battle, PHASE } from '../state'

/**
 * Callouts over soldiers' heads, one draw call for all of them:
 *  - the word of each shout ("CONTACT!", "MEDIC!", "FALL BACK!"...) rising and fading for
 *    a second and a half, from the sim's 'bark' sound events (so they come across in
 *    multiplayer too);
 *  - a pulsing red cross over every fallen soldier still alive, so you can see who needs
 *    a medic from above;
 *  - Zombie Horde: a glowing red blip over every zombie far from the camera, so the
 *    horde can be seen coming through the mist from a hundred metres out.
 * The words and crosses are Medium and High only, and only near the camera; the blips
 * (a game signal) are on every preset. The words are drawn once onto a 512 x
 * 128 sheet (4 x 2 cells).
 */

const MAX_BUBBLES = 18
const MAX_DOWN = 20
const MAX_BLIPS = 130
const CAPACITY = MAX_BUBBLES + MAX_DOWN + MAX_BLIPS
const LIFE = 1.5
/** Only things this far from the camera are drawn (m). */
const RANGE = 75
const CROSS = 6
const BLIP = 7
/** Zombie Horde: a zombie further than this from the camera gets a glowing blip. */
const BLIP_FROM = 38

const WORDS = [
  ['CONTACT!', '#ffb347'],
  ['ARGH!', '#ff6b5a'],
  ['MEDIC!', '#7dffa0'],
  ['RELOADING!', '#d9e6ff'],
  ['FALL BACK!', '#ffe08a'],
  ['MAN DOWN!', '#ff8f8f'],
]

function makeSheet() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'bold 21px system-ui, "Segoe UI", sans-serif'
  g.lineJoin = 'round'
  WORDS.forEach(([text, color], i) => {
    const x = (i % 4) * 128 + 64
    const y = Math.floor(i / 4) * 64 + 32
    g.lineWidth = 6
    g.strokeStyle = 'rgba(8,10,14,0.9)'
    g.strokeText(text, x, y)
    g.fillStyle = color
    g.fillText(text, x, y)
  })
  // A red cross on a white disc.
  const cx = (CROSS % 4) * 128 + 64
  const cy = Math.floor(CROSS / 4) * 64 + 32
  g.fillStyle = 'rgba(8,10,14,0.85)'
  g.beginPath()
  g.arc(cx, cy, 25, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(cx, cy, 21, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e03a3a'
  g.fillRect(cx - 4.5, cy - 14, 9, 28)
  g.fillRect(cx - 14, cy - 4.5, 28, 9)
  // A glowing red blip.
  const bx = (BLIP % 4) * 128 + 64
  const by = Math.floor(BLIP / 4) * 64 + 32
  const grad = g.createRadialGradient(bx, by, 1, bx, by, 26)
  grad.addColorStop(0, 'rgba(255,235,210,1)')
  grad.addColorStop(0.25, 'rgba(255,80,55,1)')
  grad.addColorStop(1, 'rgba(255,40,30,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(bx, by, 26, 0, Math.PI * 2)
  g.fill()
  const tex = new CanvasTexture(c)
  tex.generateMipmaps = false
  tex.minFilter = 1006 // LinearFilter
  return tex
}

const VERT = /* glsl */ `
  attribute float aCell;
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vec2 cell = vec2(mod(aCell, 4.0), floor(aCell / 4.0));
    vUv = vec2((uv.x + cell.x) * 0.25, (uv.y + (1.0 - cell.y)) * 0.5);
    vA = aAlpha;
    // Always facing the camera: the card's size comes from the instance matrix.
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 sc = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
    mv.xy += position.xy * sc;
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vec4 c = texture2D(map, vUv);
    float a = c.a * vA;
    if (a < 0.02) discard;
    gl_FragColor = vec4(c.rgb, a);
  }
`

const m4 = new Matrix4()
const p3 = new Vector3()
const BARK_CELL = Object.fromEntries(BARKS.map((b, i) => [b, i]))

export default function Callouts() {
  const parts = useMemo(() => {
    const map = makeSheet()
    const geo = new PlaneGeometry(1, 1)
    const cell = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
    const alpha = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
    cell.setUsage(DynamicDrawUsage)
    alpha.setUsage(DynamicDrawUsage)
    geo.setAttribute('aCell', cell)
    geo.setAttribute('aAlpha', alpha)
    const mat = new ShaderMaterial({ uniforms: { map: { value: map } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false })
    const mesh = new InstancedMesh(geo, mat, CAPACITY)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    mesh.count = 0
    // The speech bubbles still showing: where, which word, since when.
    const bubbles = Array.from({ length: MAX_BUBBLES }, () => ({ x: 0, y: 0, z: 0, cell: 0, t0: -99 }))
    return { map, geo, mat, mesh, cell, alpha, bubbles, head: 0 }
  }, [])

  useEffect(() => {
    let cursor = battle.world ? battle.world.fx.sounds.head : 0
    const off = addFrameHook(PHASE.DRAW, (state) => {
      const w = battle.world
      if (!w) return
      const cam = state.camera.position
      const range2 = RANGE * RANGE
      const words = useQuality.getState().settings.particles
      const { mesh, cell, alpha, bubbles } = parts
      const time = w.time
      // New shouts.
      cursor = drain(w.fx.sounds, cursor, (s) => {
        if (s.kind !== 'bark' || !words) return
        const dx = s.x - cam.x
        const dz = s.z - cam.z
        if (dx * dx + dz * dz > range2) return
        const b = bubbles[parts.head % MAX_BUBBLES]
        parts.head += 1
        b.x = s.x
        b.y = s.y
        b.z = s.z
        b.cell = BARK_CELL[s.meta] ?? 0
        b.t0 = time
      })
      // How big a card is: bigger the further out you are, so it stays readable.
      const far = Math.min(2.6, Math.max(1, Math.hypot(cam.x - battle.view.tx, cam.y, cam.z - battle.view.tz) * 0.028))
      let n = 0
      const place = (x, y, z, w3, h3, c, a) => {
        m4.makeScale(w3, h3, 1)
        m4.setPosition(p3.set(x, y, z))
        mesh.setMatrixAt(n, m4)
        cell.array[n] = c
        alpha.array[n] = a
        n += 1
      }
      for (let i = 0; i < MAX_BUBBLES && words; i += 1) {
        const b = bubbles[i]
        const age = time - b.t0
        if (age < 0 || age > LIFE) continue
        const a = Math.min(1, age / 0.1) * Math.min(1, (LIFE - age) / 0.45)
        place(b.x, b.y + age * 0.55, b.z, 1.7 * far, 0.85 * far, b.cell, a)
      }
      // The fallen who still need a medic.
      let down = 0
      for (let i = 0; i < w.slots.length && down < MAX_DOWN && words; i += 1) {
        const s = w.slots[i]
        if (!s.used || !s.alive || !s.downed) continue
        const dx = s.x - cam.x
        const dz = s.z - cam.z
        if (dx * dx + dz * dz > range2) continue
        down += 1
        place(s.x, s.fy + 1.15 + Math.sin(time * 4 + i) * 0.06, s.z, 0.8 * far, 0.4 * far, CROSS, 0.7 + 0.3 * Math.sin(time * 5 + i))
      }
      // The horde, far off: one glowing blip over each.
      if (w.zmode) {
        let blips = 0
        for (let i = 0; i < w.slots.length && blips < MAX_BLIPS; i += 1) {
          const s = w.slots[i]
          if (!s.used || !s.alive || s.team !== 1) continue
          const d = Math.hypot(s.x - cam.x, s.z - cam.z)
          if (d < BLIP_FROM) continue
          blips += 1
          const size = Math.min(2.4, Math.max(0.7, d * 0.011))
          const lift = s.flying ? BAT_LIFT + 0.7 : 2.2
          place(s.x, s.fy + lift, s.z, size, size, BLIP, Math.min(1, (d - BLIP_FROM) / 22) * 0.9)
        }
      }
      mesh.count = n
      if (n) {
        mesh.instanceMatrix.clearUpdateRanges()
        mesh.instanceMatrix.addUpdateRange(0, n * 16)
        mesh.instanceMatrix.needsUpdate = true
        cell.needsUpdate = true
        alpha.needsUpdate = true
      }
    })
    return () => {
      off()
    }
  }, [parts])


  // Dispose everything when the battle (or the preset) goes away.
  useEffect(
    () => () => {
      parts.map.dispose()
      parts.geo.dispose()
      parts.mat.dispose()
    },
    [parts],
  )

  return <primitive object={parts.mesh} />
}
