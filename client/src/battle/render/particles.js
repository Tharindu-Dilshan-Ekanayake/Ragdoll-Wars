import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial } from 'three'

/**
 * A pooled point-sprite particle system (one draw call): soft round sprites that drift,
 * rise or fall, grow and fade. Used for explosion smoke, rocket trails and fire.
 * Spawning overwrites the oldest particle once the pool is full; nothing allocates.
 */

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.04, d));
  }
`

export function createParticles(n, additive) {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('aColor', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('aSize', new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage))
  geo.setAttribute('aAlpha', new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage))
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  return {
    points,
    geo,
    mat,
    n,
    vel: new Float32Array(n * 3),
    life: new Float32Array(n),
    maxLife: new Float32Array(n).fill(1),
    baseSize: new Float32Array(n),
    grow: new Float32Array(n),
    lift: new Float32Array(n),
    peak: new Float32Array(n),
    next: 0,
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

/** One particle at (x, y, z) moving (vx, vy, vz); `lift` is upward acceleration. */
export function spawnParticle(p, x, y, z, vx, vy, vz, r, g, b, size, grow, life, lift, alpha) {
  const j = p.next
  p.next = (p.next + 1) % p.n
  const pos = p.geo.attributes.position.array
  const col = p.geo.attributes.aColor.array
  pos[j * 3] = x
  pos[j * 3 + 1] = y
  pos[j * 3 + 2] = z
  p.vel[j * 3] = vx
  p.vel[j * 3 + 1] = vy
  p.vel[j * 3 + 2] = vz
  col[j * 3] = r
  col[j * 3 + 1] = g
  col[j * 3 + 2] = b
  p.life[j] = life
  p.maxLife[j] = life
  p.baseSize[j] = size
  p.grow[j] = grow
  p.lift[j] = lift
  p.peak[j] = alpha
}

/** Advances every particle by `dt` (battle time) and uploads the changes. */
export function stepParticles(p, dt, viewHeight) {
  const pos = p.geo.attributes.position.array
  const size = p.geo.attributes.aSize.array
  const alpha = p.geo.attributes.aAlpha.array
  for (let j = 0; j < p.n; j += 1) {
    if (p.life[j] <= 0) {
      if (alpha[j] !== 0) alpha[j] = 0
      continue
    }
    p.life[j] -= dt
    const t = 1 - p.life[j] / p.maxLife[j]
    const drag = 1 - Math.min(1, dt * 1.6)
    p.vel[j * 3] *= drag
    p.vel[j * 3 + 2] *= drag
    p.vel[j * 3 + 1] = p.vel[j * 3 + 1] * drag + p.lift[j] * dt
    pos[j * 3] += p.vel[j * 3] * dt
    pos[j * 3 + 1] = Math.max(0.05, pos[j * 3 + 1] + p.vel[j * 3 + 1] * dt)
    pos[j * 3 + 2] += p.vel[j * 3 + 2] * dt
    size[j] = p.baseSize[j] * (1 + p.grow[j] * t)
    alpha[j] = p.peak[j] * (1 - t) * (t < 0.08 ? t / 0.08 : 1)
  }
  p.geo.attributes.position.needsUpdate = true
  p.geo.attributes.aSize.needsUpdate = true
  p.geo.attributes.aAlpha.needsUpdate = true
  p.geo.attributes.aColor.needsUpdate = true
  p.mat.uniforms.uScale.value = viewHeight * 0.9
}
