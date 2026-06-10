import { createNoise2D, createNoise3D } from 'simplex-noise'
import { ID, type BlockId } from './blocks'

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 128
export const SEA_LEVEL = 40

// Simple seeded PRNG -> noise functions
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class WorldGen {
  private height2d: ReturnType<typeof createNoise2D>
  private temp2d: ReturnType<typeof createNoise2D>
  private humid2d: ReturnType<typeof createNoise2D>
  private cave3d: ReturnType<typeof createNoise3D>
  private ore3d: ReturnType<typeof createNoise3D>
  private treeRng: () => number
  readonly seed: number

  constructor(seed = 1337) {
    this.seed = seed
    const r1 = mulberry32(seed)
    const r2 = mulberry32(seed + 1)
    const r3 = mulberry32(seed + 2)
    const r4 = mulberry32(seed + 3)
    const r5 = mulberry32(seed + 4)
    this.height2d = createNoise2D(r1)
    this.temp2d = createNoise2D(r2)
    this.humid2d = createNoise2D(r3)
    this.cave3d = createNoise3D(r4)
    this.ore3d = createNoise3D(r5)
    this.treeRng = mulberry32(seed + 99)
  }

  terrainHeight(x: number, z: number): number {
    const continental = this.height2d(x * 0.0035, z * 0.0035) * 28
    const regional = this.height2d(x * 0.012, z * 0.012) * 14
    const local = this.height2d(x * 0.05, z * 0.05) * 5
    return Math.floor(SEA_LEVEL + 6 + continental + regional + local)
  }

  biome(x: number, z: number): 'plains' | 'desert' | 'forest' | 'tundra' | 'mountains' {
    const t = this.temp2d(x * 0.004, z * 0.004)
    const h = this.humid2d(x * 0.004, z * 0.004)
    const elev = this.terrainHeight(x, z)
    if (elev > SEA_LEVEL + 34) return 'mountains'
    if (t > 0.4 && h < -0.1) return 'desert'
    if (t < -0.4) return 'tundra'
    if (h > 0.25) return 'forest'
    return 'plains'
  }

  private isCave(x: number, y: number, z: number, surface: number): boolean {
    if (y < 6 || y > surface - 3) return false
    const n1 = this.cave3d(x * 0.05, y * 0.06, z * 0.05)
    const n2 = this.cave3d(x * 0.05 + 100, y * 0.06, z * 0.05 + 100)
    return n1 * n1 + n2 * n2 < 0.018
  }

  private ore(x: number, y: number, z: number): BlockId {
    if (y < 1) return ID.STONE
    const d = this.ore3d(x * 0.1, y * 0.1, z * 0.1)
    if (y < 16 && d > 0.86) return ID.DIAMOND
    if (y < 28 && d > 0.82) return ID.GOLD
    if (y < 40 && d < -0.82) return ID.IRON
    if (y < 52 && d > 0.78) return ID.COAL
    return ID.STONE
  }

  // Generate a full chunk into a flat Uint16Array (x,z,y indexed)
  generateChunk(cx: number, cz: number): Uint16Array {
    const data = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
    const idx = (x: number, y: number, z: number) =>
      (x * CHUNK_SIZE + z) * WORLD_HEIGHT + y

    const trees: { x: number; z: number; surface: number; biome: string }[] = []

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx
        const wz = cz * CHUNK_SIZE + lz
        const surface = this.terrainHeight(wx, wz)
        const biome = this.biome(wx, wz)

        for (let y = 0; y <= Math.max(surface, SEA_LEVEL); y++) {
          let block: BlockId = ID.AIR
          if (y === 0) block = ID.BEDROCK
          else if (y <= surface) {
            if (this.isCave(wx, y, wz, surface)) {
              block = ID.AIR
            } else if (y === surface) {
              // top layer
              if (biome === 'desert') block = ID.SAND
              else if (biome === 'tundra' || biome === 'mountains')
                block = y > SEA_LEVEL + 30 ? ID.SNOW : ID.GRASS
              else block = surface < SEA_LEVEL ? ID.DIRT : ID.GRASS
              if (surface <= SEA_LEVEL + 1 && biome !== 'desert') block = ID.SAND
            } else if (y > surface - 4) {
              block = biome === 'desert' ? ID.SAND : ID.DIRT
            } else {
              block = this.ore(wx, y, wz)
            }
          } else if (y <= SEA_LEVEL) {
            block = ID.WATER
          }
          if (block !== ID.AIR) data[idx(lx, y, lz)] = block
        }

        // queue trees on land surfaces
        if (
          surface > SEA_LEVEL + 1 &&
          (biome === 'forest' || biome === 'plains') &&
          lx > 1 &&
          lx < CHUNK_SIZE - 2 &&
          lz > 1 &&
          lz < CHUNK_SIZE - 2
        ) {
          const density = biome === 'forest' ? 0.06 : 0.012
          // deterministic per-column chance
          const r = mulberry32(this.seed + wx * 73856093 + wz * 19349663)()
          if (r < density) trees.push({ x: lx, z: lz, surface, biome })
        }
        // cactus in desert
        if (biome === 'desert' && surface > SEA_LEVEL) {
          const r = mulberry32(this.seed + wx * 12345 + wz * 67890)()
          if (r < 0.01) {
            const h = 2 + Math.floor(r * 200) % 2
            for (let i = 1; i <= h; i++)
              if (surface + i < WORLD_HEIGHT)
                data[idx(lx, surface + i, lz)] = ID.CACTUS
          }
        }
      }
    }

    // plant trees
    for (const t of trees) {
      const trunk = t.biome === 'forest' ? 5 : 4
      for (let i = 1; i <= trunk; i++) {
        if (t.surface + i < WORLD_HEIGHT) data[idx(t.x, t.surface + i, t.z)] = ID.WOOD
      }
      const topY = t.surface + trunk
      for (let dy = -1; dy <= 1; dy++) {
        const ly = topY + dy
        const rad = dy === 1 ? 1 : 2
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue
            const px = t.x + dx
            const pz = t.z + dz
            if (
              px < 0 ||
              pz < 0 ||
              px >= CHUNK_SIZE ||
              pz >= CHUNK_SIZE ||
              ly >= WORLD_HEIGHT
            )
              continue
            if (data[idx(px, ly, pz)] === ID.AIR) data[idx(px, ly, pz)] = ID.LEAVES
          }
        }
      }
      if (topY + 1 < WORLD_HEIGHT) data[idx(t.x, topY + 1, t.z)] = ID.LEAVES
    }

    return data
  }
}

export function blockIndex(x: number, y: number, z: number) {
  return (x * CHUNK_SIZE + z) * WORLD_HEIGHT + y
}
