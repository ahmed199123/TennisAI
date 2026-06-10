import type { MeshArrays } from './meshing'

// Manages a pool of Web Workers and load-balances generation + meshing jobs.
// Uses round-robin dispatch with a pending-count heuristic so the least-busy
// worker gets new work. Falls back to synchronous main-thread execution if
// Workers are unavailable (e.g. during SSR or unsupported environments).

export interface GenResult {
  cx: number
  cz: number
  data: Uint16Array
}

export interface MeshResultArrays {
  opaque: MeshArrays | null
  transparent: MeshArrays | null
}

type Pending =
  | { kind: 'gen'; resolve: (r: GenResult) => void }
  | { kind: 'mesh'; resolve: (r: MeshResultArrays) => void }

export class WorkerPool {
  private workers: Worker[] = []
  private pendingCount: number[] = []
  private jobs = new Map<number, Pending>()
  private nextId = 1
  private rr = 0
  private fallback = false

  constructor(count: number, seed: number) {
    this.seed = seed
    if (typeof Worker === 'undefined') {
      this.fallback = true
      return
    }
    for (let i = 0; i < count; i++) {
      try {
        const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e) => this.onMessage(e)
        this.workers.push(w)
        this.pendingCount.push(0)
      } catch {
        this.fallback = true
        break
      }
    }
    if (this.workers.length === 0) this.fallback = true
  }

  private seed: number

  get usingWorkers() {
    return !this.fallback
  }

  private pickWorker(): number {
    // least-busy, tie-broken by round-robin
    let best = 0
    let bestCount = Infinity
    for (let i = 0; i < this.workers.length; i++) {
      const idx = (this.rr + i) % this.workers.length
      if (this.pendingCount[idx] < bestCount) {
        bestCount = this.pendingCount[idx]
        best = idx
      }
    }
    this.rr = (best + 1) % this.workers.length
    return best
  }

  private onMessage(e: MessageEvent) {
    const msg = e.data
    const job = this.jobs.get(msg.id)
    if (!job) return
    this.jobs.delete(msg.id)
    // decrement the worker that produced this
    if (typeof msg.worker === 'number') this.pendingCount[msg.worker]--

    if (msg.type === 'gen' && job.kind === 'gen') {
      job.resolve({ cx: msg.cx, cz: msg.cz, data: msg.data })
    } else if (msg.type === 'mesh' && job.kind === 'mesh') {
      job.resolve({ opaque: msg.opaque, transparent: msg.transparent })
    }
  }

  generate(cx: number, cz: number): Promise<GenResult> {
    if (this.fallback) {
      return import('./worldgen').then(({ WorldGen }) => {
        const gen = new WorldGen(this.seed)
        return { cx, cz, data: gen.generateChunk(cx, cz) }
      })
    }
    const id = this.nextId++
    const wi = this.pickWorker()
    this.pendingCount[wi]++
    return new Promise<GenResult>((resolve) => {
      this.jobs.set(id, { kind: 'gen', resolve })
      // attach worker index so onMessage can decrement; worker echoes it back
      const w = this.workers[wi]
      w.postMessage({ type: 'gen', id, cx, cz, seed: this.seed, worker: wi })
    })
  }

  mesh(padded: Uint16Array): Promise<MeshResultArrays> {
    if (this.fallback) {
      return import('./meshing').then(({ greedyMesh }) => greedyMesh(padded))
    }
    const id = this.nextId++
    const wi = this.pickWorker()
    this.pendingCount[wi]++
    return new Promise<MeshResultArrays>((resolve) => {
      this.jobs.set(id, { kind: 'mesh', resolve })
      const w = this.workers[wi]
      w.postMessage({ type: 'mesh', id, padded, worker: wi }, [padded.buffer])
    })
  }

  dispose() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.jobs.clear()
  }
}
