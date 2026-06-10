import * as THREE from 'three'
import { FACE_LAYERS } from './blocks'

// Builds a unit-cube BufferGeometry for the held-item / hand viewmodel that
// uses the SAME vertex attributes (uv, color, layer) as chunk meshes, so it can
// be rendered with the chunk ShaderMaterial and look identical to placed blocks.
//
// Face order matches the mesher's DIRS: +x,-x,+y,-y,+z,-z. Per-face `layer`
// comes from FACE_LAYERS [top, side, bottom]; per-face shade mimics the
// directional lighting used in the world so the cube reads as 3D.

const SHADES = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8] // +x,-x,+y,-y,+z,-z

// corners of a unit cube centered at origin
function faceVerts(dir: number): number[][] {
  const h = 0.5
  switch (dir) {
    case 0: // +x
      return [
        [h, -h, h],
        [h, -h, -h],
        [h, h, -h],
        [h, h, h],
      ]
    case 1: // -x
      return [
        [-h, -h, -h],
        [-h, -h, h],
        [-h, h, h],
        [-h, h, -h],
      ]
    case 2: // +y
      return [
        [-h, h, h],
        [h, h, h],
        [h, h, -h],
        [-h, h, -h],
      ]
    case 3: // -y
      return [
        [-h, -h, -h],
        [h, -h, -h],
        [h, -h, h],
        [-h, -h, h],
      ]
    case 4: // +z
      return [
        [-h, -h, h],
        [h, -h, h],
        [h, h, h],
        [-h, h, h],
      ]
    default: // -z
      return [
        [h, -h, -h],
        [-h, -h, -h],
        [-h, h, -h],
        [h, h, -h],
      ]
  }
}

export function buildBlockItemGeometry(blockId: number): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const lay: number[] = []
  const idx: number[] = []

  const base = blockId * 3
  const layerFor = (dir: number) => {
    if (dir === 2) return FACE_LAYERS[base] // top
    if (dir === 3) return FACE_LAYERS[base + 2] // bottom
    return FACE_LAYERS[base + 1] // side
  }

  for (let dir = 0; dir < 6; dir++) {
    const verts = faceVerts(dir)
    const start = pos.length / 3
    for (const v of verts) pos.push(v[0], v[1], v[2])
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    for (const [u, vv] of uvs) uv.push(u, vv)
    const layer = layerFor(dir)
    const shade = SHADES[dir]
    for (let k = 0; k < 4; k++) {
      lay.push(layer)
      col.push(shade, shade, shade)
    }
    idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}
