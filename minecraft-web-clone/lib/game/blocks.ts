// Block type registry. Each block has up to 3 face texture keys (top/side/bottom).

export type BlockId = number

export const AIR: BlockId = 0

export interface BlockDef {
  id: BlockId
  name: string
  // texture keys resolved into atlas indices
  top: string
  side: string
  bottom: string
  solid: boolean
  transparent: boolean // skip neighbour face culling against this
  liquid?: boolean
  light?: number // 0..15 light emitted
  color: string // hotbar swatch
}

// Ordered list. Index in this array (after AIR) maps to id.
const defs: Omit<BlockDef, 'id'>[] = [
  {
    name: 'Grass',
    top: 'grass_top',
    side: 'grass_side',
    bottom: 'dirt',
    solid: true,
    transparent: false,
    color: '#6aa84f',
  },
  {
    name: 'Dirt',
    top: 'dirt',
    side: 'dirt',
    bottom: 'dirt',
    solid: true,
    transparent: false,
    color: '#8a5a3b',
  },
  {
    name: 'Stone',
    top: 'stone',
    side: 'stone',
    bottom: 'stone',
    solid: true,
    transparent: false,
    color: '#8f8f8f',
  },
  {
    name: 'Cobblestone',
    top: 'cobble',
    side: 'cobble',
    bottom: 'cobble',
    solid: true,
    transparent: false,
    color: '#7d7d7d',
  },
  {
    name: 'Sand',
    top: 'sand',
    side: 'sand',
    bottom: 'sand',
    solid: true,
    transparent: false,
    color: '#e0d49a',
  },
  {
    name: 'Wood',
    top: 'log_top',
    side: 'log_side',
    bottom: 'log_top',
    solid: true,
    transparent: false,
    color: '#9c6b3f',
  },
  {
    name: 'Planks',
    top: 'planks',
    side: 'planks',
    bottom: 'planks',
    solid: true,
    transparent: false,
    color: '#bb8e54',
  },
  {
    name: 'Leaves',
    top: 'leaves',
    side: 'leaves',
    bottom: 'leaves',
    solid: true,
    transparent: true,
    color: '#3f7d2f',
  },
  {
    name: 'Water',
    top: 'water',
    side: 'water',
    bottom: 'water',
    solid: false,
    transparent: true,
    liquid: true,
    color: '#3a72d6',
  },
  {
    name: 'Snow',
    top: 'snow',
    side: 'snow',
    bottom: 'snow',
    solid: true,
    transparent: false,
    color: '#f4fbff',
  },
  {
    name: 'Coal Ore',
    top: 'coal_ore',
    side: 'coal_ore',
    bottom: 'coal_ore',
    solid: true,
    transparent: false,
    color: '#3a3a3a',
  },
  {
    name: 'Iron Ore',
    top: 'iron_ore',
    side: 'iron_ore',
    bottom: 'iron_ore',
    solid: true,
    transparent: false,
    color: '#c9a98b',
  },
  {
    name: 'Gold Ore',
    top: 'gold_ore',
    side: 'gold_ore',
    bottom: 'gold_ore',
    solid: true,
    transparent: false,
    color: '#d9b24a',
  },
  {
    name: 'Diamond Ore',
    top: 'diamond_ore',
    side: 'diamond_ore',
    bottom: 'diamond_ore',
    solid: true,
    transparent: false,
    color: '#4ad9cf',
  },
  {
    name: 'Glowstone',
    top: 'glowstone',
    side: 'glowstone',
    bottom: 'glowstone',
    solid: true,
    transparent: false,
    light: 15,
    color: '#f5d97a',
  },
  {
    name: 'Glass',
    top: 'glass',
    side: 'glass',
    bottom: 'glass',
    solid: true,
    transparent: true,
    color: '#cfeefb',
  },
  {
    name: 'Bedrock',
    top: 'bedrock',
    side: 'bedrock',
    bottom: 'bedrock',
    solid: true,
    transparent: false,
    color: '#2b2b2b',
  },
  {
    name: 'Brick',
    top: 'brick',
    side: 'brick',
    bottom: 'brick',
    solid: true,
    transparent: false,
    color: '#a14b3a',
  },
  {
    name: 'Cactus',
    top: 'cactus',
    side: 'cactus',
    bottom: 'cactus',
    solid: true,
    transparent: false,
    color: '#3e7d3a',
  },
  {
    name: 'Pumpkin',
    top: 'pumpkin_top',
    side: 'pumpkin_side',
    bottom: 'pumpkin_top',
    solid: true,
    transparent: false,
    color: '#d97a1f',
  },
]

export const BLOCKS: BlockDef[] = [
  {
    id: 0,
    name: 'Air',
    top: '',
    side: '',
    bottom: '',
    solid: false,
    transparent: true,
    color: 'transparent',
  },
  ...defs.map((d, i) => ({ ...d, id: i + 1 })),
]

// Named ids for world gen convenience
export const ID = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  WOOD: 6,
  PLANKS: 7,
  LEAVES: 8,
  WATER: 9,
  SNOW: 10,
  COAL: 11,
  IRON: 12,
  GOLD: 13,
  DIAMOND: 14,
  GLOWSTONE: 15,
  GLASS: 16,
  BEDROCK: 17,
  BRICK: 18,
  CACTUS: 19,
  PUMPKIN: 20,
} as const

export function isSolid(id: BlockId): boolean {
  return BLOCKS[id]?.solid ?? false
}
export function isTransparent(id: BlockId): boolean {
  return BLOCKS[id]?.transparent ?? true
}
export function isLiquid(id: BlockId): boolean {
  return BLOCKS[id]?.liquid ?? false
}

// All distinct texture keys
export const TEXTURE_KEYS = Array.from(
  new Set(
    BLOCKS.flatMap((b) => [b.top, b.side, b.bottom]).filter((k) => k !== ''),
  ),
)

// Worker-safe texture layer lookup (no DOM). Matches atlas layer ordering.
const TEXTURE_LAYER: Record<string, number> = {}
TEXTURE_KEYS.forEach((k, i) => {
  TEXTURE_LAYER[k] = i
})

export function textureLayer(key: string): number {
  return TEXTURE_LAYER[key] ?? 0
}

// Precomputed per-block face layers [top, side, bottom] for fast meshing.
export const FACE_LAYERS: Int16Array = (() => {
  const arr = new Int16Array(BLOCKS.length * 3)
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i]
    arr[i * 3 + 0] = b.top ? textureLayer(b.top) : 0
    arr[i * 3 + 1] = b.side ? textureLayer(b.side) : 0
    arr[i * 3 + 2] = b.bottom ? textureLayer(b.bottom) : 0
  }
  return arr
})()

// Fast boolean tables indexed by block id.
export const TRANSPARENT_TABLE: Uint8Array = (() => {
  const arr = new Uint8Array(BLOCKS.length)
  for (let i = 0; i < BLOCKS.length; i++) arr[i] = BLOCKS[i].transparent ? 1 : 0
  return arr
})()

export const LIQUID_TABLE: Uint8Array = (() => {
  const arr = new Uint8Array(BLOCKS.length)
  for (let i = 0; i < BLOCKS.length; i++) arr[i] = BLOCKS[i].liquid ? 1 : 0
  return arr
})()
