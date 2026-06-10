import * as THREE from 'three'
import { TEXTURE_KEYS } from './blocks'

// Builds a procedural texture set. Each 16x16 block face is rendered to its own
// layer of a DataArrayTexture. Using an array texture (instead of a 2D atlas)
// lets us use RepeatWrapping per tile, which means greedy-meshed quads can tile
// a single block texture across many cells with NO bleeding and NO seams.

const TILE = 16

export interface Atlas {
  texture: THREE.DataArrayTexture
  layerOf: Record<string, number>
  count: number
  // crack overlay: a 2D texture strip of DESTROY_STAGES frames
  crackTexture: THREE.Texture
  crackStages: number
}

type Painter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rng: () => number,
) => void

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(x, y, TILE, TILE)
}

function noise(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rng: () => number,
  base: [number, number, number],
  variance: number,
  density = 1,
) {
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      if (rng() > density) continue
      const v = (rng() - 0.5) * variance
      const r = Math.max(0, Math.min(255, base[0] + v))
      const g = Math.max(0, Math.min(255, base[1] + v))
      const b = Math.max(0, Math.min(255, base[2] + v))
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      ctx.fillRect(x + px, y + py, 1, 1)
    }
  }
}

function speckle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rng: () => number,
  color: string,
  count: number,
  size = 2,
) {
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const px = Math.floor(rng() * (TILE - size))
    const py = Math.floor(rng() * (TILE - size))
    ctx.fillRect(x + px, y + py, size, size)
  }
}

const painters: Record<string, Painter> = {
  grass_top: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#6aa84f')
    noise(ctx, x, y, rng, [106, 168, 79], 40)
  },
  grass_side: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#8a5a3b')
    noise(ctx, x, y, rng, [138, 90, 59], 30)
    ctx.fillStyle = '#6aa84f'
    ctx.fillRect(x, y, TILE, 4)
    for (let i = 0; i < 12; i++) {
      const px = Math.floor(rng() * TILE)
      ctx.fillRect(x + px, y + 4, 1, 1 + Math.floor(rng() * 2))
    }
  },
  dirt: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#8a5a3b')
    noise(ctx, x, y, rng, [138, 90, 59], 35)
    speckle(ctx, x, y, rng, '#6e4630', 8, 2)
  },
  stone: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#8f8f8f')
    noise(ctx, x, y, rng, [143, 143, 143], 28)
    speckle(ctx, x, y, rng, '#7a7a7a', 6, 2)
  },
  cobble: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#7d7d7d')
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const shade = 100 + Math.floor(rng() * 60)
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`
        ctx.fillRect(x + gx * 4, y + gy * 4, 3, 3)
      }
    }
  },
  sand: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#e0d49a')
    noise(ctx, x, y, rng, [224, 212, 154], 22)
  },
  log_top: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#9c6b3f')
    ctx.strokeStyle = '#6e4a2a'
    for (let r = 2; r < 8; r += 2) {
      ctx.beginPath()
      ctx.arc(x + 8, y + 8, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  },
  log_side: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#6e4a2a')
    for (let i = 0; i < TILE; i++) {
      const v = 90 + Math.floor(rng() * 50)
      ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.65)},${Math.floor(v * 0.4)})`
      ctx.fillRect(x + i, y, 1, TILE)
    }
  },
  planks: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#bb8e54')
    ctx.fillStyle = '#9c7039'
    for (let i = 0; i < TILE; i += 4) ctx.fillRect(x, y + i, TILE, 1)
    noise(ctx, x, y, rng, [187, 142, 84], 18, 0.5)
  },
  leaves: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#3f7d2f')
    noise(ctx, x, y, rng, [63, 125, 47], 50)
    speckle(ctx, x, y, rng, '#2f5f22', 14, 1)
  },
  water: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#3a72d6')
    noise(ctx, x, y, rng, [58, 114, 214], 24)
  },
  snow: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#f4fbff')
    noise(ctx, x, y, rng, [244, 251, 255], 12)
  },
  coal_ore: (ctx, x, y, rng) => {
    painters.stone(ctx, x, y, rng)
    speckle(ctx, x, y, rng, '#222', 8, 3)
  },
  iron_ore: (ctx, x, y, rng) => {
    painters.stone(ctx, x, y, rng)
    speckle(ctx, x, y, rng, '#c98f6b', 7, 3)
  },
  gold_ore: (ctx, x, y, rng) => {
    painters.stone(ctx, x, y, rng)
    speckle(ctx, x, y, rng, '#f0c33a', 7, 3)
  },
  diamond_ore: (ctx, x, y, rng) => {
    painters.stone(ctx, x, y, rng)
    speckle(ctx, x, y, rng, '#5ff0e3', 7, 3)
  },
  glowstone: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#caa24a')
    speckle(ctx, x, y, rng, '#ffe89a', 18, 2)
  },
  glass: (ctx, x, y) => {
    ctx.clearRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(200,235,250,0.22)'
    ctx.fillRect(x, y, TILE, TILE)
    ctx.strokeStyle = '#cfeefb'
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
  },
  bedrock: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#2b2b2b')
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const s = 20 + Math.floor(rng() * 60)
        ctx.fillStyle = `rgb(${s},${s},${s})`
        ctx.fillRect(x + gx * 4, y + gy * 4, 4, 4)
      }
  },
  brick: (ctx, x, y) => {
    fill(ctx, x, y, '#a14b3a')
    ctx.fillStyle = '#cfcabb'
    for (let row = 0; row < 4; row++) {
      const yy = y + row * 4
      ctx.fillRect(x, yy, TILE, 1)
      const off = row % 2 === 0 ? 0 : 4
      for (let bx = off; bx <= TILE; bx += 8) ctx.fillRect(x + bx, yy, 1, 4)
    }
  },
  cactus: (ctx, x, y, rng) => {
    fill(ctx, x, y, '#3e7d3a')
    noise(ctx, x, y, rng, [62, 125, 58], 26)
    ctx.fillStyle = '#2c5a2a'
    ctx.fillRect(x + 2, y, 1, TILE)
    ctx.fillRect(x + TILE - 3, y, 1, TILE)
  },
  pumpkin_top: (ctx, x, y) => {
    fill(ctx, x, y, '#d97a1f')
    ctx.fillStyle = '#7a5a1a'
    ctx.fillRect(x + 6, y + 6, 4, 4)
  },
  pumpkin_side: (ctx, x, y) => {
    fill(ctx, x, y, '#d97a1f')
    ctx.fillStyle = '#b5611a'
    for (let i = 2; i < TILE; i += 4) ctx.fillRect(x + i, y, 1, TILE)
  },
}

const DESTROY_STAGES = 10

let cached: Atlas | null = null

export function buildAtlas(): Atlas {
  if (cached) return cached

  const count = TEXTURE_KEYS.length
  const layerOf: Record<string, number> = {}

  // Per-tile canvas to render each texture, then copy pixels into array buffer.
  const tileCanvas = document.createElement('canvas')
  tileCanvas.width = TILE
  tileCanvas.height = TILE
  const tctx = tileCanvas.getContext('2d')!
  tctx.imageSmoothingEnabled = false

  const data = new Uint8Array(TILE * TILE * 4 * count)

  TEXTURE_KEYS.forEach((key, layer) => {
    layerOf[key] = layer
    tctx.clearRect(0, 0, TILE, TILE)
    const rng = mulberry32(layer * 9973 + 17)
    const painter = painters[key]
    if (painter) painter(tctx, 0, 0, rng)
    else fill(tctx, 0, 0, '#ff00ff')
    const img = tctx.getImageData(0, 0, TILE, TILE)
    data.set(img.data, layer * TILE * TILE * 4)
  })

  const texture = new THREE.DataArrayTexture(data, TILE, TILE, count)
  texture.format = THREE.RGBAFormat
  texture.type = THREE.UnsignedByteType
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.needsUpdate = true

  // crack overlay strip (DESTROY_STAGES frames horizontally)
  const crackCanvas = document.createElement('canvas')
  crackCanvas.width = TILE * DESTROY_STAGES
  crackCanvas.height = TILE
  const cctx = crackCanvas.getContext('2d')!
  cctx.imageSmoothingEnabled = false
  for (let s = 0; s < DESTROY_STAGES; s++) {
    const ox = s * TILE
    const rng = mulberry32(s * 131 + 7)
    cctx.strokeStyle = 'rgba(0,0,0,0.85)'
    cctx.lineWidth = 1
    const cracks = 1 + s
    for (let i = 0; i < cracks; i++) {
      let px = Math.floor(rng() * TILE)
      let py = Math.floor(rng() * TILE)
      cctx.beginPath()
      cctx.moveTo(ox + px, py)
      const segs = 2 + Math.floor(rng() * 3)
      for (let j = 0; j < segs; j++) {
        px = Math.max(0, Math.min(TILE, px + Math.floor((rng() - 0.5) * 8)))
        py = Math.max(0, Math.min(TILE, py + Math.floor((rng() - 0.5) * 8)))
        cctx.lineTo(ox + px, py)
      }
      cctx.stroke()
    }
  }
  const crackTexture = new THREE.CanvasTexture(crackCanvas)
  crackTexture.magFilter = THREE.NearestFilter
  crackTexture.minFilter = THREE.NearestFilter
  crackTexture.colorSpace = THREE.SRGBColorSpace
  crackTexture.generateMipmaps = false
  crackTexture.flipY = false

  cached = { texture, layerOf, count, crackTexture, crackStages: DESTROY_STAGES }
  return cached
}
