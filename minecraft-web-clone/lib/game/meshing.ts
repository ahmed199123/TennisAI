// Pure, DOM-free greedy mesher. Safe to run inside a Web Worker.
// Operates on a "padded volume": the chunk plus a 1-block border from all
// neighbours (including diagonals) so face-culling and ambient occlusion are
// correct across chunk seams.
//
// Winding is derived from the right-hand rule for every axis, which guarantees
// every visible face points outward — this permanently fixes the
// "missing/hidden faces" bug caused by hand-authored, inconsistently-wound quads.

import { CHUNK_SIZE, WORLD_HEIGHT } from './worldgen'
import { FACE_LAYERS, TRANSPARENT_TABLE, type BlockId } from './blocks'

export const PAD = 1
export const PX = CHUNK_SIZE + PAD * 2 // padded width/depth
export const H = WORLD_HEIGHT

export function paddedIndex(px: number, y: number, pz: number): number {
  return (px * PX + pz) * H + y
}

// AO darkness levels for occlusion count 0..3
const AO_LEVELS = [0.5, 0.7, 0.85, 1.0]
// Per-direction face shading (Minecraft-style directional lighting)
// order matches DIRS below
const SHADES = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8]

// 6 face directions: +x,-x,+y,-y,+z,-z
const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export interface MeshArrays {
  position: Float32Array
  uv: Float32Array
  color: Float32Array
  layer: Float32Array
  index: Uint32Array
}

export interface GreedyResult {
  opaque: MeshArrays | null
  transparent: MeshArrays | null
}

interface Buffers {
  pos: number[]
  uv: number[]
  col: number[]
  lay: number[]
  idx: number[]
}

function emptyBuf(): Buffers {
  return { pos: [], uv: [], col: [], lay: [], idx: [] }
}

function finalize(b: Buffers): MeshArrays | null {
  if (b.idx.length === 0) return null
  return {
    position: new Float32Array(b.pos),
    uv: new Float32Array(b.uv),
    color: new Float32Array(b.col),
    layer: new Float32Array(b.lay),
    index: new Uint32Array(b.idx),
  }
}

export function greedyMesh(padded: Uint16Array): GreedyResult {
  const block = (lx: number, y: number, lz: number): BlockId => {
    if (y < 0 || y >= H) return 0
    return padded[paddedIndex(lx + PAD, y, lz + PAD)] as BlockId
  }

  const opaque = emptyBuf()
  const transparent = emptyBuf()

  // visibility test: should we draw `self`'s face toward `neighbour`?
  const visible = (self: BlockId, neighbour: BlockId): boolean => {
    if (self === 0) return false
    const selfT = TRANSPARENT_TABLE[self] === 1
    const nbT = TRANSPARENT_TABLE[neighbour] === 1
    if (!selfT) return nbT // opaque: draw against any transparent/air
    // transparent self
    if (neighbour === 0) return true
    if (!nbT) return false
    return neighbour !== self // hide shared faces between same transparent type
  }

  // face layer index for a block given direction index
  const faceLayer = (id: BlockId, dirIdx: number): number => {
    const base = id * 3
    if (dirIdx === 2) return FACE_LAYERS[base] // +y top
    if (dirIdx === 3) return FACE_LAYERS[base + 2] // -y bottom
    return FACE_LAYERS[base + 1] // sides
  }

  // ambient occlusion for one vertex (3 occluder samples)
  const aoFor = (
    bx: number,
    by: number,
    bz: number,
    n: [number, number, number],
    t: [number, number, number],
    s: [number, number, number],
    du: number,
    dv: number,
  ): number => {
    const occ = (dx: number, dy: number, dz: number) =>
      TRANSPARENT_TABLE[block(bx + dx, by + dy, bz + dz)] === 1 ? 0 : 1
    const s1 = occ(n[0] + t[0] * du, n[1] + t[1] * du, n[2] + t[2] * du)
    const s2 = occ(n[0] + s[0] * dv, n[1] + s[1] * dv, n[2] + s[2] * dv)
    const c = occ(
      n[0] + t[0] * du + s[0] * dv,
      n[1] + t[1] * du + s[1] * dv,
      n[2] + t[2] * du + s[2] * dv,
    )
    const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c)
    return AO_LEVELS[level]
  }

  // For each of the 6 directions run a greedy sweep.
  for (let dir = 0; dir < 6; dir++) {
    const n = DIRS[dir]
    const d = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2 // primary axis
    const u = (d + 1) % 3
    const v = (d + 2) % 3
    const dimU = u === 1 ? H : CHUNK_SIZE
    const dimV = v === 1 ? H : CHUNK_SIZE
    const dimD = d === 1 ? H : CHUNK_SIZE
    const shade = SHADES[dir]

    // tangent unit vectors
    const tU: [number, number, number] = [0, 0, 0]
    tU[u] = 1
    const tV: [number, number, number] = [0, 0, 0]
    tV[v] = 1

    // mask entries: null = no face; else descriptor
    type Cell = {
      layer: number
      transparent: boolean
      ao: [number, number, number, number]
      uniform: boolean
      shade: number
    }
    const mask: (Cell | null)[] = new Array(dimU * dimV).fill(null)

    for (let dd = 0; dd < dimD; dd++) {
      // build mask for this slice
      for (let vv = 0; vv < dimV; vv++) {
        for (let uu = 0; uu < dimU; uu++) {
          const cell: number[] = [0, 0, 0]
          cell[d] = dd
          cell[u] = uu
          cell[v] = vv
          const self = block(cell[0], cell[1], cell[2]) as BlockId
          const nb = block(cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]) as BlockId
          if (!visible(self, nb)) {
            mask[vv * dimU + uu] = null
            continue
          }
          // AO at 4 corners (du,dv) = (-1,-1),(+1,-1),(+1,+1),(-1,+1)
          const a0 = aoFor(cell[0], cell[1], cell[2], n, tU, tV, -1, -1)
          const a1 = aoFor(cell[0], cell[1], cell[2], n, tU, tV, 1, -1)
          const a2 = aoFor(cell[0], cell[1], cell[2], n, tU, tV, 1, 1)
          const a3 = aoFor(cell[0], cell[1], cell[2], n, tU, tV, -1, 1)
          const uniform = a0 === a1 && a1 === a2 && a2 === a3
          mask[vv * dimU + uu] = {
            layer: faceLayer(self, dir),
            transparent: TRANSPARENT_TABLE[self] === 1,
            ao: [a0, a1, a2, a3],
            uniform,
            shade,
          }
        }
      }

      // greedy merge over the mask
      for (let j = 0; j < dimV; j++) {
        for (let i = 0; i < dimU; ) {
          const c = mask[j * dimU + i]
          if (!c) {
            i++
            continue
          }
          // width
          let w = 1
          while (i + w < dimU && cellMergeable(c, mask[j * dimU + i + w])) w++
          // height
          let h = 1
          outer: while (j + h < dimV) {
            for (let k = 0; k < w; k++) {
              if (!cellMergeable(c, mask[(j + h) * dimU + i + k])) break outer
            }
            h++
          }

          emitQuad(c, dir, d, u, v, dd, i, j, w, h, n)

          // clear consumed
          for (let hh = 0; hh < h; hh++)
            for (let ww = 0; ww < w; ww++) mask[(j + hh) * dimU + i + ww] = null
          i += w
        }
      }
    }

    function cellMergeable(a: Cell, b: Cell | null): boolean {
      if (!b) return false
      if (a.layer !== b.layer || a.transparent !== b.transparent) return false
      if (!a.uniform || !b.uniform) return false
      return a.ao[0] === b.ao[0]
    }

    function emitQuad(
      c: Cell,
      dirIdx: number,
      d: number,
      u: number,
      v: number,
      dd: number,
      i: number,
      j: number,
      w: number,
      h: number,
      n: [number, number, number],
    ) {
      const buf = c.transparent ? transparent : opaque
      // plane offset: faces on +dir sit at dd+1, -dir sit at dd
      const planeBase = dd + (n[d] > 0 ? 1 : 0)

      // four corners in (u,v) space: (0,0),(w,0),(w,h),(0,h)
      const corner = (su: number, sv: number): [number, number, number] => {
        const p: [number, number, number] = [0, 0, 0]
        p[d] = planeBase
        p[u] = i + su
        p[v] = j + sv
        return p
      }
      const p0 = corner(0, 0)
      const p1 = corner(w, 0)
      const p2 = corner(w, h)
      const p3 = corner(0, h)

      const start = buf.pos.length / 3
      buf.pos.push(...p0, ...p1, ...p2, ...p3)

      // UVs upright per face, tiling once per block via RepeatWrapping
      let uvs: [number, number][]
      if (d === 1) {
        // top / bottom
        uvs = [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ]
      } else if (d === 0) {
        // x faces: texU = v(z) extent, texV = u(y) extent, flip V so up = top
        uvs = [
          [0, h],
          [0, 0],
          [w, 0],
          [w, h],
        ]
      } else {
        // z faces: texU = u(x), texV = v(y), flip V
        uvs = [
          [0, h],
          [w, h],
          [w, 0],
          [0, 0],
        ]
      }
      for (const [uu, vv] of uvs) buf.uv.push(uu, vv)

      for (let k = 0; k < 4; k++) buf.lay.push(c.layer)

      const ao = c.ao
      for (let k = 0; k < 4; k++) {
        const sh = ao[k] * c.shade
        buf.col.push(sh, sh, sh)
      }

      // winding: +dir normal uses CCW (p0,p1,p2,p3); -dir reverses.
      if (n[d] > 0) {
        buf.idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
      } else {
        buf.idx.push(start, start + 2, start + 1, start, start + 3, start + 2)
      }
    }
  }

  return { opaque: finalize(opaque), transparent: finalize(transparent) }
}
