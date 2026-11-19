import { CanvasTexture, SRGBColorSpace } from 'three'

/** Canvas helpers and the helipad's painted texture (the Sea Fort's pad, battle helipads). */

export function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

export function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function texture(c) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Concrete pad: slab seams, a white edge, the orange ring, a big H and corner lamps. */
export function paintHelipad() {
  const S = 256
  const [c, g] = canvas(S, S)
  g.fillStyle = '#7f7d76'
  g.fillRect(0, 0, S, S)
  const r = rng(11)
  for (let i = 0; i < 1500; i += 1) {
    const v = (96 + r() * 46) | 0
    g.fillStyle = `rgba(${v},${v},${v - 6},0.28)`
    g.fillRect(r() * S, r() * S, 2 + r() * 4, 2 + r() * 4)
  }
  g.strokeStyle = 'rgba(38,38,36,0.4)'
  g.lineWidth = 1.5
  for (const k of [S / 3, (2 * S) / 3]) {
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k, S)
    g.moveTo(0, k)
    g.lineTo(S, k)
    g.stroke()
  }
  // Tyre and oil marks.
  g.fillStyle = 'rgba(30,30,28,0.16)'
  for (let i = 0; i < 9; i += 1) {
    g.beginPath()
    g.ellipse(S / 2 + (r() - 0.5) * 90, S / 2 + (r() - 0.5) * 90, 10 + r() * 22, 6 + r() * 12, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#efeadf'
  g.lineWidth = 5
  g.strokeRect(10, 10, S - 20, S - 20)
  g.strokeStyle = '#ff8a1f'
  g.lineWidth = 15
  g.beginPath()
  g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#f6f2e8'
  const w = S * 0.075
  const h = S * 0.36
  const gap = S * 0.12
  g.fillRect(S / 2 - gap - w / 2, S / 2 - h / 2, w, h)
  g.fillRect(S / 2 + gap - w / 2, S / 2 - h / 2, w, h)
  g.fillRect(S / 2 - gap, S / 2 - w / 2, gap * 2, w)
  for (const [x, y] of [
    [22, 22],
    [S - 22, 22],
    [22, S - 22],
    [S - 22, S - 22],
  ]) {
    const glow = g.createRadialGradient(x, y, 0, x, y, 10)
    glow.addColorStop(0, '#fff3c4')
    glow.addColorStop(0.45, '#ffb43a')
    glow.addColorStop(1, 'rgba(255,150,40,0)')
    g.fillStyle = glow
    g.fillRect(x - 10, y - 10, 20, 20)
  }
  return texture(c)
}

/** A ring of blown dust for the rotor wash. */
export function paintDust() {
  const S = 128
  const [c, g] = canvas(S, S)
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(214,192,150,0)')
  grad.addColorStop(0.55, 'rgba(214,192,150,0.55)')
  grad.addColorStop(1, 'rgba(214,192,150,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const r = rng(5)
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 70; i += 1) {
    g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.4})`
    g.beginPath()
    g.arc(r() * S, r() * S, 3 + r() * 9, 0, Math.PI * 2)
    g.fill()
  }
  return new CanvasTexture(c)
}
