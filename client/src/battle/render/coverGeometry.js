import { BufferGeometry, Color, Float32BufferAttribute, MeshLambertMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAIL_H, railRuns } from '../sim/levels.js'

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
   * repeat, or 0 to map each face once (crates). `skip`: faces to leave out, as bits
   * (1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z) - the ones against a wall or the ground.
   */
  box(cx, cy, cz, w, h, d, color, uvScale = 2, skip = 0) {
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
    for (let f = 0; f < 6; f += 1) {
      if (skip & (1 << f)) continue
      const [n, u, v, us, vs] = faces[f]
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

  /**
   * A flat polygon (3 or 4 corners, [x, y, z] each), facing whichever way `hint` points;
   * texture laid along its first edge, `uvScale` metres per repeat.
   */
  poly(pts, hint, color, uvScale = 2) {
    const [a, b, c] = pts
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const nl = Math.hypot(...n) || 1
    n = n.map((v) => v / nl)
    const flip = n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0
    if (flip) n = n.map((v) => -v)
    const el = Math.hypot(...e1) || 1
    const u = e1.map((v) => v / el)
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]
    const base = this.pos.length / 3
    for (const p of pts) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(n[0], n[1], n[2])
      this.uv.push((p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) / uvScale, (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / uvScale)
      this.col.push(color.r, color.g, color.b)
    }
    const tri = (i, j, k) => (flip ? this.idx.push(base + i, base + k, base + j) : this.idx.push(base + i, base + j, base + k))
    tri(0, 1, 2)
    if (pts.length === 4) tri(0, 2, 3)
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
  // Raised floors (levels.js): platforms with their railings, and ramps up to them.
  for (const l of map.levels || []) {
    const c = col(l.color || '#c9c8c2')
    if (!l.ramp) {
      concrete.box(l.x, l.h / 2, l.z, l.w, l.h, l.d, c, 2, 8)
      // A darker band round the top edge reads as a slab.
      concrete.box(l.x, l.h - 0.12, l.z, l.w + 0.06, 0.24, l.d + 0.06, c.clone().multiplyScalar(0.82), 2, 8 | 4)
      const rc = c.clone().multiplyScalar(1.06)
      for (const [x, z, w, d] of railRuns(l)) concrete.box(x, l.h + RAIL_H / 2, z, w, RAIL_H, d, rc, 2, 8)
    } else {
      const x0 = l.x - l.w / 2
      const x1 = l.x + l.w / 2
      const z0 = l.z - l.d / 2
      const z1 = l.z + l.d / 2
      const alongX = l.ramp[0] === 'x'
      const up = l.ramp[1] === '+'
      // Height at each footprint corner.
      const hAt = (x, z) => (alongX ? ((up ? x - x0 : x1 - x) / l.w) * l.h : ((up ? z - z0 : z1 - z) / l.d) * l.h)
      const P = (x, z, top) => [x, top ? hAt(x, z) : 0, z]
      const slope = [P(x0, z0, 1), P(x1, z0, 1), P(x1, z1, 1), P(x0, z1, 1)]
      concrete.poly(slope, [alongX ? (up ? -1 : 1) : 0, 1, alongX ? 0 : up ? -1 : 1], c, 2)
      const side = c.clone().multiplyScalar(0.86)
      // The two side faces (triangles) and the tall end.
      if (alongX) {
        const hx = up ? x1 : x0
        const lx = up ? x0 : x1
        concrete.poly([[lx, 0, z0], [hx, l.h, z0], [hx, 0, z0]], [0, 0, -1], side, 2)
        concrete.poly([[lx, 0, z1], [hx, l.h, z1], [hx, 0, z1]], [0, 0, 1], side, 2)
        concrete.poly([[hx, 0, z0], [hx, l.h, z0], [hx, l.h, z1], [hx, 0, z1]], [up ? 1 : -1, 0, 0], side, 2)
      } else {
        const hz = up ? z1 : z0
        const lz = up ? z0 : z1
        concrete.poly([[x0, 0, lz], [x0, l.h, hz], [x0, 0, hz]], [-1, 0, 0], side, 2)
        concrete.poly([[x1, 0, lz], [x1, l.h, hz], [x1, 0, hz]], [1, 0, 0], side, 2)
        concrete.poly([[x0, 0, hz], [x0, l.h, hz], [x1, l.h, hz], [x1, 0, hz]], [0, 0, up ? 1 : -1], side, 2)
      }
      // Yellow edge strips down both sides of the slope.
      const y = col('#d9a63a')
      const strip = 0.18
      if (alongX) {
        for (const zz of [z0 + strip / 2, z1 - strip / 2]) {
          concrete.poly([[x0, hAt(x0, 0) + 0.03, zz - strip / 2], [x1, hAt(x1, 0) + 0.03, zz - strip / 2], [x1, hAt(x1, 0) + 0.03, zz + strip / 2], [x0, hAt(x0, 0) + 0.03, zz + strip / 2]], [0, 1, 0], y, 0.5)
        }
      } else {
        for (const xx of [x0 + strip / 2, x1 - strip / 2]) {
          concrete.poly([[xx - strip / 2, hAt(0, z0) + 0.03, z0], [xx - strip / 2, hAt(0, z1) + 0.03, z1], [xx + strip / 2, hAt(0, z1) + 0.03, z1], [xx + strip / 2, hAt(0, z0) + 0.03, z0]], [0, 1, 0], y, 0.5)
        }
      }
    }
  }
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
      const c = col(o.color || (o.kind === 'wall' ? '#a9a59b' : '#b8b3a8')).multiplyScalar(v)
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
    } else if (o.kind === 'warehouse') {
      // A big steel shed: corrugated walls on a concrete plinth, roller doors along the
      // side facing the middle of the map, a strip of high windows, a shallow roof.
      const c = col(o.color || '#8d9297').multiplyScalar(v)
      const alongX = o.w >= o.d
      const len = alongX ? o.w : o.d
      const deep = alongX ? o.d : o.w
      steel.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 1.4)
      concrete.box(o.x, 0.3, o.z, o.w + 0.3, 0.6, o.d + 0.3, col('#9a968c').multiplyScalar(v))
      const side = alongX ? (o.z > 0 ? -1 : 1) : o.x > 0 ? -1 : 1
      const doors = Math.max(1, Math.floor(len / 8.5))
      const door = col(o.door || '#596066').multiplyScalar(v)
      const frame = col('#d4a531')
      for (let k = 0; k < doors; k += 1) {
        const t = ((k + 0.5) / doors - 0.5) * len
        const fx = alongX ? o.x + t : o.x + side * (deep / 2 + 0.05)
        const fz = alongX ? o.z + side * (deep / 2 + 0.05) : o.z + t
        steel.box(fx, 2.3, fz, alongX ? 4.2 : 0.1, 4.6, alongX ? 0.1 : 4.2, door, 0.9)
        concrete.box(fx, 4.7, fz, alongX ? 4.6 : 0.14, 0.22, alongX ? 0.14 : 4.6, frame, 0)
      }
      const glass = col('#2b3a44')
      for (const sgn of [-1, 1]) {
        const wx = alongX ? o.x : o.x + sgn * (o.w / 2 + 0.04)
        const wz = alongX ? o.z + sgn * (o.d / 2 + 0.04) : o.z
        concrete.box(wx, o.h - 0.9, wz, alongX ? len * 0.86 : 0.08, 0.7, alongX ? 0.08 : len * 0.86, glass, 0)
      }
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, Math.min(2.2, deep * 0.14), col(o.roof || '#6b7176').multiplyScalar(v)))
    } else if (o.kind === 'shed') {
      const c = col(o.color || '#8f6c48').multiplyScalar(v)
      wood.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, c, 2.4)
      // Door and window on the side facing the middle of the map.
      const sideZ = o.z > 0 ? -1 : 1
      const dark = col('#2a221b')
      wood.box(o.x - o.w * 0.2, 1.05, o.z + sideZ * (o.d / 2 + 0.03), 1.1, 2.1, 0.08, dark, 0)
      wood.box(o.x + o.w * 0.22, 1.9, o.z + sideZ * (o.d / 2 + 0.03), 1.2, 0.8, 0.08, dark, 0)
      roofs.push(roofGeometry(o.x, o.h, o.z, o.w, o.d, o.roof ? 1.8 : 1.3, col(o.roof || '#5d6266')))
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
