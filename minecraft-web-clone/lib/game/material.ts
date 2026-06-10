import * as THREE from 'three'
import type { Atlas } from './atlas'

// Custom material that samples a DataArrayTexture (sampler2DArray) using a
// per-vertex `layer` attribute. The greedy mesher emits UVs in block units
// (0..w, 0..h), and we use fract() in the shader so a single block texture
// tiles across a merged quad with NO bleeding and NO seams — this is what makes
// greedy meshing render correctly. Vertex colors carry baked AO + face shading.
//
// A `uTint` uniform drives the day/night cycle, and exponential fog is applied
// manually so it works regardless of the array-texture sampler.

export interface ChunkMaterialUniforms {
  uTint: { value: THREE.Color }
  uFogColor: { value: THREE.Color }
  uFogDensity: { value: number }
  uAtlas: { value: THREE.DataArrayTexture }
}

const vertexShader = /* glsl */ `
  attribute float layer;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    vUv = uv;
    vLayer = layer;
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;

  uniform sampler2DArray uAtlas;
  uniform vec3 uTint;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    // Tile the per-block texture across greedy-merged quads.
    vec2 tiled = fract(vUv);
    vec4 tex = texture(uAtlas, vec3(tiled, vLayer));
    if (tex.a < 0.5) discard;

    vec3 rgb = tex.rgb * vColor * uTint;

    // exponential squared fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    rgb = mix(rgb, uFogColor, fogFactor);

    gl_FragColor = vec4(rgb, tex.a);
  }
`

export function createChunkMaterials(atlas: Atlas, fogDensity: number) {
  const shared: ChunkMaterialUniforms = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0x9ec8ff) },
    uFogDensity: { value: fogDensity },
    uAtlas: { value: atlas.texture },
  }

  const opaque = new THREE.ShaderMaterial({
    uniforms: shared as unknown as { [k: string]: THREE.IUniform },
    vertexShader,
    fragmentShader,
    vertexColors: true,
    glslVersion: THREE.GLSL3,
  })

  const transparent = new THREE.ShaderMaterial({
    uniforms: shared as unknown as { [k: string]: THREE.IUniform },
    vertexShader,
    fragmentShader: fragmentShader.replace(
      'if (tex.a < 0.5) discard;',
      '', // keep soft alpha for water/glass
    ),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
  })

  return { opaque, transparent, uniforms: shared }
}
