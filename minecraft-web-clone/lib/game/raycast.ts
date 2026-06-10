import * as THREE from 'three'
import { World } from './world'
import { isSolid, ID } from './blocks'

export interface RayHit {
  x: number
  y: number
  z: number
  // adjacent empty block (for placement)
  nx: number
  ny: number
  nz: number
}

// Amanatides & Woo voxel traversal
export function raycastVoxel(
  world: World,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 6,
): RayHit | null {
  const d = dir.clone().normalize()
  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)

  const stepX = Math.sign(d.x)
  const stepY = Math.sign(d.y)
  const stepZ = Math.sign(d.z)

  const tDeltaX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity
  const tDeltaY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity
  const tDeltaZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity

  const fracX = origin.x - x
  const fracY = origin.y - y
  const fracZ = origin.z - z

  let tMaxX = d.x > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX
  let tMaxY = d.y > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY
  let tMaxZ = d.z > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ
  if (d.x === 0) tMaxX = Infinity
  if (d.y === 0) tMaxY = Infinity
  if (d.z === 0) tMaxZ = Infinity

  let nx = x
  let ny = y
  let nz = z
  let t = 0

  while (t <= maxDist) {
    const block = world.getBlock(x, y, z)
    if (isSolid(block) && block !== ID.WATER) {
      return { x, y, z, nx, ny, nz }
    }
    nx = x
    ny = y
    nz = z
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
    }
  }
  return null
}
