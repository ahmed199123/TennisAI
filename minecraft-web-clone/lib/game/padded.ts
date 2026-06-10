import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './worldgen'
import { PX, PAD, paddedIndex } from './meshing'

// Builds the padded volume (chunk + 1-block border from all 8 neighbours) that
// the greedy mesher consumes. Reading neighbour blocks here is what fixes the
// "faces between chunks not rendered / hidden faces" bug: every seam face is
// evaluated against real neighbour voxels instead of assumed air.
//
// We index the 3x3 neighbourhood chunk arrays directly (no per-voxel
// floor/modulo/Map lookups) so this stays cheap enough to run per remesh.

export type ChunkData = Uint16Array

export function buildPaddedVolume(
  get: (cx: number, cz: number) => ChunkData | undefined,
  cx: number,
  cz: number,
): Uint16Array {
  const padded = new Uint16Array(PX * PX * WORLD_HEIGHT)

  // Cache the 3x3 chunk neighbourhood once.
  const neigh: (ChunkData | undefined)[] = []
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) neigh[(dz + 1) * 3 + (dx + 1)] = get(cx + dx, cz + dz)

  for (let px = 0; px < PX; px++) {
    // world-local x within current chunk space, range -1..CHUNK_SIZE
    const wx = px - PAD
    // which neighbour column (-1,0,1) and local x inside that chunk (0..15)
    let ndx = 0
    let lx = wx
    if (wx < 0) {
      ndx = -1
      lx = wx + CHUNK_SIZE
    } else if (wx >= CHUNK_SIZE) {
      ndx = 1
      lx = wx - CHUNK_SIZE
    }

    for (let pz = 0; pz < PX; pz++) {
      const wz = pz - PAD
      let ndz = 0
      let lz = wz
      if (wz < 0) {
        ndz = -1
        lz = wz + CHUNK_SIZE
      } else if (wz >= CHUNK_SIZE) {
        ndz = 1
        lz = wz - CHUNK_SIZE
      }

      const chunk = neigh[(ndz + 1) * 3 + (ndx + 1)]
      if (!chunk) continue // missing neighbour -> treated as air (border only)

      const srcBase = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
      const dstBase = (px * PX + pz) * WORLD_HEIGHT
      // copy the whole vertical column at once
      padded.set(chunk.subarray(srcBase, srcBase + WORLD_HEIGHT), dstBase)
    }
  }

  return padded
}

// Re-export for callers
export { paddedIndex, blockIndex }
