import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Procedural textures drawn on canvases: no image files to download, and every one is
 * 256 px or smaller (well under the 512 px LOW budget). Made once per battle and
 * disposed with it (disposeTextures).
 */

let cache = null

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')]
}

/** Deterministic noise so textures look the same every time. */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function toTexture(c, repeat = true) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) {
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
  }
  t.minFilter = LinearMipmapLinearFilter
  t.anisotropy = 4
  return t
}

function speckle(ctx, size, rand, count, alpha, light) {
  for (let i = 0; i < count; i += 1) {
    const v = light ? 255 : 0
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`
    const r = 0.5 + rand() * 1.6
    ctx.fillRect(rand() * size, rand() * size, r, r)
  }
}

/** Grey-ish multiplier for the ground: grain, small stones, blades. */
function grassDetail() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(11)
  ctx.fillStyle = '#d8d8d8'
  ctx.fillRect(0, 0, S, S)
  speckle(ctx, S, rand, 2600, 0.22, false)
  speckle(ctx, S, rand, 1400, 0.25, true)
  ctx.lineWidth = 1
  for (let i = 0; i < 700; i += 1) {
    const x = rand() * S
    const y = rand() * S
    const g = 150 + rand() * 90
    ctx.strokeStyle = `rgba(${g},${g},${g},0.35)`
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4)
    ctx.stroke()
  }
  return toTexture(c)
}

/** Concrete: mottled grey with faint form-work seams. */
function concrete() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(21)
  ctx.fillStyle = '#e4e4e0'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 60; i += 1) {
    const g = 200 + rand() * 40
    ctx.fillStyle = `rgba(${g},${g},${g - 6},0.35)`
    ctx.beginPath()
    ctx.arc(rand() * S, rand() * S, 6 + rand() * 26, 0, Math.PI * 2)
    ctx.fill()
  }
  speckle(ctx, S, rand, 2200, 0.18, false)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, S / 2)
  ctx.lineTo(S, S / 2)
  ctx.moveTo(S / 2, 0)
  ctx.lineTo(S / 2, S)
  ctx.stroke()
  return toTexture(c)
}

/** Sandbags: staggered rows of plump bags with seams. One texture repeat = 2 x 4 bags. */
function sandbags() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(31)
  ctx.fillStyle = '#7a6a48'
  ctx.fillRect(0, 0, S, S)
  const rows = 4
  const rh = S / rows
  for (let r = 0; r < rows; r += 1) {
    const off = r % 2 ? S / 4 : 0
    for (let k = -1; k < 3; k += 1) {
      const x = k * (S / 2) + off
      const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh)
      g.addColorStop(0, '#d9c79a')
      g.addColorStop(0.55, '#c4b080')
      g.addColorStop(1, '#94815a')
      ctx.fillStyle = g
      const pad = 3
      const rr = 14
      ctx.beginPath()
      ctx.roundRect(x + pad, r * rh + pad, S / 2 - pad * 2, rh - pad * 2, rr)
      ctx.fill()
      // Stitching along the bag's end.
      ctx.strokeStyle = 'rgba(80,60,30,0.45)'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x + S / 2 - 14, r * rh + 8)
      ctx.lineTo(x + S / 2 - 14, (r + 1) * rh - 8)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  speckle(ctx, S, rand, 1500, 0.15, false)
  return toTexture(c)
}

/** A wooden crate face: frame, planks and a diagonal brace. Maps once per face. */
function crate() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(41)
  ctx.fillStyle = '#b07a42'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i % 2 ? '#a8723c' : '#b98448'
    ctx.fillRect(0, (i * S) / 5, S, S / 5)
    ctx.fillStyle = 'rgba(60,35,10,0.35)'
    ctx.fillRect(0, (i * S) / 5, S, 2)
  }
  ctx.strokeStyle = '#7d5129'
  ctx.lineWidth = 26
  ctx.strokeRect(13, 13, S - 26, S - 26)
  ctx.lineWidth = 22
  ctx.beginPath()
  ctx.moveTo(20, S - 20)
  ctx.lineTo(S - 20, 20)
  ctx.stroke()
  ctx.fillStyle = '#3a2a1a'
  for (const [x, y] of [
    [13, 13],
    [S - 13, 13],
    [13, S - 13],
    [S - 13, S - 13],
  ]) {
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  speckle(ctx, S, rand, 900, 0.2, false)
  return toTexture(c, false)
}

/** Corrugated steel, white-ish so each container's vertex colour tints it. */
function corrugated() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(51)
  for (let x = 0; x < S; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0)
    g.addColorStop(0, '#9a9a9a')
    g.addColorStop(0.5, '#f2f2f2')
    g.addColorStop(1, '#a8a8a8')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 16, S)
  }
  // Rust and grime.
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = `rgba(120,60,20,${rand() * 0.18})`
    ctx.beginPath()
    ctx.arc(rand() * S, rand() * S, 4 + rand() * 18, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(60,40,20,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return toTexture(c)
}

/** Vertical planks for the sheds, tinted by vertex colour. */
function planks() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = rng(61)
  for (let x = 0; x < S; x += 32) {
    const v = 200 + rand() * 40
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(x, 0, 32, S)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(x, 0, 2, S)
  }
  for (let i = 0; i < 300; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.08})`
    ctx.fillRect(rand() * S, rand() * S, 1, 4 + rand() * 20)
  }
  return toTexture(c)
}

/** A blood splat with soft edges and droplets (alpha texture). */
function splat() {
  const S = 128
  const [c, ctx] = canvas(S)
  const rand = rng(71)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.28, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * Math.PI * 2
    const d = S * (0.18 + rand() * 0.22)
    ctx.beginPath()
    ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 3 + rand() * 9, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new CanvasTexture(c)
  return t
}

/** Muzzle flash: a hot core fading out. */
function flash() {
  const S = 64
  const [c, ctx] = canvas(S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,230,1)')
  g.addColorStop(0.25, 'rgba(255,220,120,0.95)')
  g.addColorStop(0.6, 'rgba(255,140,40,0.35)')
  g.addColorStop(1, 'rgba(255,100,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return new CanvasTexture(c)
}

/** Soft round shadow for the blob-shadow presets. */
function blob() {
  const S = 64
  const [c, ctx] = canvas(S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.3)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return new CanvasTexture(c)
}

export function getTextures() {
  if (!cache) {
    cache = {
      blob: blob(),
      grass: grassDetail(),
      concrete: concrete(),
      sandbags: sandbags(),
      crate: crate(),
      corrugated: corrugated(),
      planks: planks(),
      splat: splat(),
      flash: flash(),
    }
  }
  return cache
}

export function disposeTextures() {
  if (!cache) return
  for (const t of Object.values(cache)) t.dispose()
  cache = null
}
