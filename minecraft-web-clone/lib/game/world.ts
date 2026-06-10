import { CHUNK_SIZE, WORLD_HEIGHT, WorldGen, blockIndex } from './worldgen'
import { type BlockId, ID } from './blocks'

function key(cx: number, cz: number) {
  return `${cx},${cz}`
}

// Main-thread source of truth for voxel data. Chunk arrays are produced off
// the main thread by the worker pool and handed in via `setChunk`. Reads for
// missing chunks return AIR (no synchronous generation) so raycast/physics
// never trigger an expensive blocking generate — that was a key lag source.
export class World {
  gen: WorldGen
  chunks = new Map<string, Uint16Array>()
  // edits applied on top of generation, so a regenerated/streamed chunk keeps
  // the player's changes.
  edits = new Map<string, BlockId>()
  seed: number

  constructor(seed = 1337) {
    this.seed = seed ?? 1337
    this.gen = new WorldGen(this.seed)
  }

  getChunk(cx: number, cz: number): Uint16Array | undefined {
    return this.chunks.get(key(cx, cz))
  }

  hasChunk(cx: number, cz: number) {
    return this.chunks.has(key(cx, cz))
  }

  // Store a freshly generated chunk and replay any edits that belong to it.
  setChunk(cx: number, cz: number, data: Uint16Array) {
    const k = key(cx, cz)
    if (this.edits.size) {
      const baseX = cx * CHUNK_SIZE
      const baseZ = cz * CHUNK_SIZE
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            const e = this.edits.get(`${baseX + lx},${y},${baseZ + lz}`)
            if (e !== undefined) data[blockIndex(lx, y, lz)] = e
          }
        }
      }
    }
    this.chunks.set(k, data)
  }

  // Generate synchronously on the main thread (fallback only).
  ensureChunk(cx: number, cz: number): Uint16Array {
    let c = this.chunks.get(key(cx, cz))
    if (!c) {
      c = this.gen.generateChunk(cx, cz)
      this.setChunk(cx, cz, c)
    }
    return c
  }

  unloadChunk(cx: number, cz: number) {
    this.chunks.delete(key(cx, cz))
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return ID.AIR
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const c = this.chunks.get(key(cx, cz))
    if (!c) return ID.AIR
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    return c[blockIndex(lx, y, lz)] as BlockId
  }

  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const c = this.chunks.get(key(cx, cz))
    if (!c) return false
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    c[blockIndex(lx, y, lz)] = id
    this.edits.set(`${x},${y},${z}`, id)
    return true
  }
}
