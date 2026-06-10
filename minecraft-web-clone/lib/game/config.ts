// Centralized, organized game settings. Mutable at runtime; subscribe for live updates.

export interface GameConfig {
  render: {
    renderDistance: number // chunks
    fov: number // degrees
    pixelRatio: number // cap
    fogEnabled: boolean
    fogDensity: number
  }
  graphics: {
    greedyMeshing: boolean
    ambientOcclusion: boolean
    smoothLighting: boolean
  }
  controls: {
    mouseSensitivity: number
    invertY: boolean
  }
  gameplay: {
    reach: number // block interaction distance
    creativeInstantBreak: boolean
  }
  performance: {
    workerCount: number
    chunkBuildBudget: number // chunk meshes built per frame on main thread
    chunkGenBudget: number // gen requests dispatched per frame
  }
  world: {
    seed: number
  }
  time: {
    dayNightCycle: boolean
    daySpeed: number // ticks per second
  }
}

export const DEFAULT_CONFIG: GameConfig = {
  render: {
    renderDistance: 8,
    fov: 75,
    pixelRatio: 2,
    fogEnabled: true,
    fogDensity: 0.0045,
  },
  graphics: {
    greedyMeshing: true,
    ambientOcclusion: true,
    smoothLighting: true,
  },
  controls: {
    mouseSensitivity: 1,
    invertY: false,
  },
  gameplay: {
    reach: 6,
    creativeInstantBreak: false,
  },
  performance: {
    workerCount: Math.max(2, Math.min(8, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4)),
    chunkBuildBudget: 4,
    chunkGenBudget: 6,
  },
  world: {
    seed: 1337,
  },
  time: {
    dayNightCycle: true,
    daySpeed: 20,
  },
}

type Listener = (cfg: GameConfig) => void

class ConfigStore {
  private cfg: GameConfig = structuredClone(DEFAULT_CONFIG)
  private listeners = new Set<Listener>()

  get(): GameConfig {
    return this.cfg
  }

  // Apply a partial patch (deep-merged one level per section) and notify.
  patch(section: keyof GameConfig, values: Partial<GameConfig[keyof GameConfig]>) {
    this.cfg = {
      ...this.cfg,
      [section]: { ...(this.cfg[section] as object), ...(values as object) },
    }
    this.emit()
  }

  reset() {
    this.cfg = structuredClone(DEFAULT_CONFIG)
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const l of this.listeners) l(this.cfg)
  }
}

export const config = new ConfigStore()
