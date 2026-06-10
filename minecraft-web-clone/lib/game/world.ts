import { CHUNK_SIZE, WORLD_HEIGHT, WorldGen, blockIndex } from './worldgen'
import { type BlockId, ID } from './blocks'

function key(cx: number, cz: number) {
  return `${cx},${cz}`
}

export class World {
  gen: WorldGen
  chunks = new Map<string, Uint16Array>()
  // edits applied on top of generation, so regen stays consistent
  edits = new Map<string, BlockId>()

  constructor(seed?: number) {
    this.gen = new WorldGen(seed)
  }

  getChunk(cx: number, cz: number): Uint16Array {
    const k = key(cx, cz)
    let c = this.chunks.get(k)
    if (!c) {
      c = this.gen.generateChunk(cx, cz)
      this.chunks.set(k, c)
    }
    return c
  }

  hasChunk(cx: number, cz: number) {
    return this.chunks.has(key(cx, cz))
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return ID.AIR
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const c = this.getChunk(cx, cz)
    return c[blockIndex(lx, y, lz)] as BlockId
  }

  setBlock(x: number, y: number, z: number, id: BlockId) {
    if (y < 0 || y >= WORLD_HEIGHT) return
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const c = this.getChunk(cx, cz)
    c[blockIndex(lx, y, lz)] = id
    this.edits.set(`${x},${y},${z}`, id)
  }
}
