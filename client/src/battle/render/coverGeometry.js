import { BufferGeometry, Color, Float32BufferAttribute, MeshLambertMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Cover-box geometry shared by the battlefield (MapView) and build mode (Structures):
 * every box of a kind - sandbags, barriers, walls, crates, containers, tents, posts,
 * boards, sheds - batched into one geometry per material.
 */

export function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export const col = (hex) => new Color(hex)

/** The materials buildCover's geometries are drawn with (textures from getTextures()). */
export function coverMaterials(tex) {
  return {
    concrete: new MeshLambertMaterial({ vertexColors: true, map: tex.concrete }),
    bags: new MeshLambertMaterial({ vertexColors: true, map: tex.sandbags }),
    crates: new MeshLambertMaterial({ vertexColors: true, map: tex.crate }),
    steel: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
    wood: new MeshLambertMaterial({ vertexColors: true, map: tex.planks }),
    roof: new MeshLambertMaterial({ vertexColors: true, map: tex.corrugated }),
  }
}

/** Accumulates textured, vertex-coloured boxes into one geometry. */
export class BoxBatch {
  constructor() {
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = []
    this.idx = []
  }

  /**
   * Box centred at (cx, cy, cz) with size (w, h, d). `uvScale` metres per texture
   * repeat, or 0 to map each face once (crates).
   */
  box(cx, cy, cz, w, h, d, color, uvScale = 2) {
    const hw = w / 2
    const hh = h / 2
    const hd = d / 2
    // [normal, u axis, v axis, u size, v size]
    const faces = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], d, h],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], d, h],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], w, d],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], w, d],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], w, h],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], w, h],
    ]
    for (const [n, u, v, us, vs] of faces) {
      const base = this.pos.length / 3
      const ox = cx + n[0] * hw
      const oy = cy + n[1] * hh
      const oz = cz + n[2] * hd
      const uh = [u[0] * hw, u[1] * hh, u[2] * hd]
      const vh = [v[0] * hw, v[1] * hh, v[2] * hd]
      const ur = uvScale ? us / uvScale : 1
      const vr = uvScale ? vs / uvScale : 1
      const corners = [
        [-1, -1, 0, 0],
        [1, -1, ur, 0],
        [1, 1, ur, vr],
        [-1, 1, 0, vr],
      ]
      for (const [a, b, tu, tv] of corners) {
        this.pos.push(ox + uh[0] * a + vh[0] * b, oy + uh[1] * a + vh[1] * b, oz + uh[2] * a + vh[2] * b)
        this.nor.push(n[0], n[1], n[2])
        this.uv.push(tu, tv)
        // Bottom edges a touch darker: cheap contact shading.
        const k = n[1] === 0 && b < 0 ? 0.78 : 1
        this.col.push(color.r * k, color.g * k, color.b * k)
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  build() {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

const CONTAINER_TINTS = ['#a8462f', '#3f6b4a', '#2f5f8f', '#c08a2e']

/** A pitched roof over a w x d footprint, ridge along the longer side. */
function roofGeometry(cx, cy, cz, w, d, rise, color) {
  const alongX = w >= d
  const L = (alongX ? w : d) / 2 + 0.3
  const S = (alongX ? d : w) / 2 + 0.4
  // Vertices in (along, up, side) then mapped.
  const map = (a, y, s) => (alongX ? [cx + a, cy + y, cz + s] : [cx + s, cy + y, cz + a])
  const quads = [
    [map(-L, 0, -S), map(L, 0, -S), map(L, rise, 0), map(-L, rise, 0)],
    [map(L, 0, S), map(-L, 0, S), map(-L, rise, 0), map(L, rise, 0)],
  ]
  const tris = [
    [map(-L, 0, S), map(-L, 0, -S), map(-L, rise, 0)],
    [map(L, 0, -S), map(L, 0, S), map(L, rise, 0)],
  ]
  const pos = []
  const uv = []
  const c = []
  for (const q of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...q[i])
      uv.push(i === 1 || i === 2 ? (L * 2) / 1.6 : 0, i >= 2 ? 1 : 0)
      c.push(color.r, color.g, color.b)
    }
  }
  for (const t of tris) {
    for (const p of t) {
      pos.push(...p)
      uv.push(0, 0)
      c.push(color.r * 0.8, color.g * 0.8, color.b * 0.8)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new Float32BufferAttribute(c, 3))
  g.computeVertexNormals()
  return g
}

export function buildCover(map) {
  const concrete = new BoxBatch()
  const bags = new BoxBatch()
  const crates = new BoxBatch()
  const steel = new BoxBatch()
  const wood = new BoxBatch()
  const roofs = []
  for (const o of map.obstacles) {
    const v = 0.92 + hash(o.x, o.z) * 0.16
    if (o.kind === 'barrier') {
      // Jersey barrier: wide foot, narrow top, a hazard band.
      const c = col('#c9c6bd').multiplyScalar(v)
      const narrowX = o.w < o.d
      concrete.box(o.x, 0.22, o.z, o.w, 0.44, o.d, c)
      concrete.box(o.x, 0.44 + (o.h - 0.44) / 2, o.z, narrowX ? o.w * 0.55 : o.w, o.h - 0.44, narrowX ? o.d : o.d * 0.55, c)
      concrete.box(o.x, o.h - 0.12, o.z, narrowX ? o.w * 0.57 : o.w + 0.02, 0.1, narrowX ? o.d + 0.02 : o.d * 0.57, col('#d9a63a'))
    } else if (o.kind === 'lowwall' || o.kind === 'wall') {
      const c = col(o.kind === 'wall' ? '#a9a59b' : '#b8b3a8').multiplyScalar(v)
      concrete.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c)
      if (o.kind === 'wall') {
        // Broken top: a few chunks.
        const along = o.w > o.d
        const len = along ? o.w : o.d
        for (let k = 0; k < 3; k += 1) {
          const t = (hash(o.x + k, o.z - k) - 0.5) * len * 0.8
          const ch = 0.15 + hash(o.z + k, o.x) * 0.3
          concrete.box(o.x + (along ? t : 0), o.h + ch / 2, o.z + (along ? 0 : t), along ? 0.6 + hash(k, o.x) : o.w, ch, along ? o.d : 0.6 + hash(k, o.z), c)
        }
      }
    } else if (o.kind === 'sandbag') {
      const c = col('#ffffff').multiplyScalar(v)
      // Texture: 2 bags (1.2 m) across, 4 rows (0.96 m) up.
      const along = o.w > o.d
      const len = along ? o.w : o.d
      const thick = along ? o.d : o.w
      const b = bags
      const start = b.uv.length
      b.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 0)
      // Rescale this box's UVs: sides by length/1.2 x height/0.96, top by length x thickness.
      for (let k = 0; k < 24; k += 1) {
        const face = Math.floor(k / 4)
        const i = start + k * 2
        const isTop = face === 2 || face === 3
        const sideAlong = along ? face >= 4 : face <= 1
        if (isTop) {
          b.uv[i] *= (along ? len : thick) / 1.2
          b.uv[i + 1] *= (along ? thick : len) / 0.6
        } else {
          b.uv[i] *= (sideAlong ? len : thick) / 1.2
          b.uv[i + 1] *= o.h / 0.96
        }
      }
    } else if (o.kind === 'crate') {
      const c = col('#ffffff').multiplyScalar(v)
      const stack = Math.max(1, Math.round(o.h / 1.25))
      for (let k = 0; k < stack; k += 1) crates.box(o.x, 0.625 + k * 1.25, o.z, o.w, 1.25, o.d, c, 0)
    } else if (o.kind === 'container') {
      const c = col(CONTAINER_TINTS[o.tint % CONTAINER_TINTS.length]).multiplyScalar(v)
      steel.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 1.4)
    } else if (o.kind === 'tent') {
      // Canvas tent: low walls and a steep roof.
      const c = col('#5f6b45').multiplyScalar(v)
      wood.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 1.6)
      const sideZ = o.z > 0 ? -1 : 1
      wood.box(o.x, 0.9, o.z + sideZ * (o.d / 2 + 0.03), Math.min(1.6, o.w * 0.3), 1.8, 0.08, col('#2a2b1f'), 0)
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, 2.1, col('#6d7a4e').multiplyScalar(v)))
    } else if (o.kind === 'post') {
      concrete.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, col(o.color || '#d9d6cf'), 0)
    } else if (o.kind === 'board') {
      // Notice board: two legs and a framed panel.
      const c = col('#8f6c48').multiplyScalar(v)
      const along = o.w >= o.d
      const half = (along ? o.w : o.d) / 2 - 0.15
      for (const sgn of [-1, 1]) wood.box(o.x + (along ? sgn * half : 0), o.h / 2, o.z + (along ? 0 : sgn * half), 0.18, o.h, 0.18, c, 0)
      wood.box(o.x, o.h - 0.85, o.z, along ? o.w : 0.12, 1.3, along ? 0.12 : o.d, c, 2)
    } else if (o.kind === 'shed') {
      const c = col('#8f6c48').multiplyScalar(v)
      wood.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 2.4)
      // Door and window on the side facing the middle of the map.
      const sideZ = o.z > 0 ? -1 : 1
      const dark = col('#2a221b')
      wood.box(o.x - o.w * 0.2, 1.05, o.z + sideZ * (o.d / 2 + 0.03), 1.1, 2.1, 0.08, dark, 0)
      wood.box(o.x + o.w * 0.22, 1.9, o.z + sideZ * (o.d / 2 + 0.03), 1.2, 0.8, 0.08, dark, 0)
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, 1.3, col('#5d6266')))
    }
  }
  const out = {
    concrete: concrete.build(),
    bags: bags.build(),
    crates: crates.build(),
    steel: steel.build(),
    wood: wood.build(),
    roofs: roofs.length ? mergeGeometries(roofs) : null,
  }
  for (const r of roofs) r.dispose()
  return out
}
