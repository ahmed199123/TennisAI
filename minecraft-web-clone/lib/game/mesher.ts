import * as THREE from 'three'
import { CHUNK_SIZE, WORLD_HEIGHT } from './worldgen'
import { World } from './world'
import { BLOCKS, ID, isTransparent, type BlockId } from './blocks'
import type { Atlas } from './atlas'

// Per-face data: normal + 4 corner vertex offsets + AO neighbour sampling
interface FaceDef {
  dir: [number, number, number]
  corners: [number, number, number][]
  // for AO: for each corner, the two side neighbours + corner neighbour offsets
  ao: [[number, number, number], [number, number, number], [number, number, number]][]
}

const FACES: { key: 'top' | 'bottom' | 'side'; def: FaceDef }[] = [
  {
    key: 'side', // +x
    def: {
      dir: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
      ao: [
        [[1, -1, 0], [1, 0, -1], [1, -1, -1]],
        [[1, -1, 0], [1, 0, 1], [1, -1, 1]],
        [[1, 1, 0], [1, 0, 1], [1, 1, 1]],
        [[1, 1, 0], [1, 0, -1], [1, 1, -1]],
      ],
    },
  },
  {
    key: 'side', // -x
    def: {
      dir: [-1, 0, 0],
      corners: [
        [0, 0, 1],
        [0, 0, 0],
        [0, 1, 0],
        [0, 1, 1],
      ],
      ao: [
        [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]],
        [[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]],
        [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]],
        [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]],
      ],
    },
  },
  {
    key: 'top', // +y
    def: {
      dir: [0, 1, 0],
      corners: [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ],
      ao: [
        [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
        [[1, 1, 0], [0, 1, 1], [1, 1, 1]],
        [[1, 1, 0], [0, 1, -1], [1, 1, -1]],
        [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]],
      ],
    },
  },
  {
    key: 'bottom', // -y
    def: {
      dir: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      ao: [
        [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]],
        [[1, -1, 0], [0, -1, -1], [1, -1, -1]],
        [[1, -1, 0], [0, -1, 1], [1, -1, 1]],
        [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]],
      ],
    },
  },
  {
    key: 'side', // +z
    def: {
      dir: [0, 0, 1],
      corners: [
        [1, 0, 1],
        [0, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ],
      ao: [
        [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
        [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
        [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]],
        [[1, 0, 1], [0, 1, 1], [1, 1, 1]],
      ],
    },
  },
  {
    key: 'side', // -z
    def: {
      dir: [0, 0, -1],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
      ao: [
        [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
        [[1, 0, -1], [0, -1, -1], [1, -1, -1]],
        [[1, 0, -1], [0, 1, -1], [1, 1, -1]],
        [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
      ],
    },
  },
]

const AO_LEVELS = [0.65, 0.78, 0.9, 1.0]

function texKeyForFace(id: BlockId, faceKey: 'top' | 'bottom' | 'side') {
  const b = BLOCKS[id]
  return faceKey === 'top' ? b.top : faceKey === 'bottom' ? b.bottom : b.side
}

export interface MeshResult {
  opaque: THREE.BufferGeometry | null
  transparent: THREE.BufferGeometry | null
}

export function buildChunkMesh(
  world: World,
  cx: number,
  cz: number,
  atlas: Atlas,
): MeshResult {
  const baseX = cx * CHUNK_SIZE
  const baseZ = cz * CHUNK_SIZE
  const tile = 1 / atlas.cols

  const op = { pos: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] }
  const tr = { pos: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] }

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const wx = baseX + lx
        const wz = baseZ + lz
        const id = world.getBlock(wx, y, wz)
        if (id === ID.AIR) continue
        const selfTransparent = isTransparent(id)
        const target = selfTransparent ? tr : op

        for (const { key, def } of FACES) {
          const nx = wx + def.dir[0]
          const ny = y + def.dir[1]
          const nz = wz + def.dir[2]
          const neighbour = world.getBlock(nx, ny, nz)
          // cull if neighbour is opaque, or (for transparent) same type
          if (!isTransparent(neighbour)) continue
          if (selfTransparent && neighbour === id) continue

          const texIndex = atlas.indexOf[texKeyForFace(id, key)] ?? 0
          const tu = (texIndex % atlas.cols) * tile
          const tv = Math.floor(texIndex / atlas.cols) * tile

          // face shading (fake directional) — same for all 4 corners
          let shade = 1
          if (def.dir[1] === 1) shade = 1
          else if (def.dir[1] === -1) shade = 0.65
          else if (def.dir[0] !== 0) shade = 0.8
          else shade = 0.9

          const start = target.pos.length / 3
          const aoVals: number[] = []
          for (let ci = 0; ci < 4; ci++) {
            const c = def.corners[ci]
            target.pos.push(lx + c[0], y + c[1], lz + c[2])
            let ao = 1
            if (!selfTransparent) {
              // AO sampling (only for solid blocks — water stays flat/connected)
              const [s1, s2, cn] = def.ao[ci]
              const b1 = !isTransparent(world.getBlock(wx + s1[0], y + s1[1], wz + s1[2])) ? 1 : 0
              const b2 = !isTransparent(world.getBlock(wx + s2[0], y + s2[1], wz + s2[2])) ? 1 : 0
              const bc = !isTransparent(world.getBlock(wx + cn[0], y + cn[1], wz + cn[2])) ? 1 : 0
              const level = b1 && b2 ? 0 : 3 - (b1 + b2 + bc)
              ao = AO_LEVELS[Math.max(0, level)]
            }
            aoVals.push(ao)
            const c2 = ao * shade
            target.col.push(c2, c2, c2)
          }
          // UVs (per corner) with half-texel inset to prevent atlas bleeding
          const pad = tile / 32
          const u0 = tu + pad
          const u1 = tu + tile - pad
          const v0 = tv + pad
          const v1 = tv + tile - pad
          target.uv.push(u0, v1)
          target.uv.push(u1, v1)
          target.uv.push(u1, v0)
          target.uv.push(u0, v0)

          // flip quad triangulation to avoid AO anisotropy
          if (aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3]) {
            target.idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
          } else {
            target.idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start)
          }
        }
      }
    }
  }

  const make = (d: typeof op) => {
    if (d.idx.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3))
    g.setIndex(d.idx)
    g.computeVertexNormals()
    g.translate(baseX, 0, baseZ)
    return g
  }

  return { opaque: make(op), transparent: make(tr) }
}
