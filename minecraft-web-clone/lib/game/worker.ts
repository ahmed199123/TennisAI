/// <reference lib="webworker" />
// DOM-free worker: handles chunk generation (worldgen) and greedy meshing.
// Both modules it imports are pure and safe outside the main thread.

import { WorldGen } from './worldgen'
import { greedyMesh } from './meshing'

type GenMsg = { type: 'gen'; id: number; cx: number; cz: number; seed: number; worker: number }
type MeshMsg = { type: 'mesh'; id: number; padded: Uint16Array; worker: number }
type InMsg = GenMsg | MeshMsg

let gen: WorldGen | null = null
let genSeed = NaN

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  if (msg.type === 'gen') {
    if (!gen || genSeed !== msg.seed) {
      gen = new WorldGen(msg.seed)
      genSeed = msg.seed
    }
    const data = gen.generateChunk(msg.cx, msg.cz)
    ctx.postMessage(
      { type: 'gen', id: msg.id, cx: msg.cx, cz: msg.cz, data, worker: msg.worker },
      [data.buffer],
    )
    return
  }

  if (msg.type === 'mesh') {
    const result = greedyMesh(msg.padded)
    const transfer: ArrayBuffer[] = []
    const pack = (m: typeof result.opaque) => {
      if (!m) return null
      transfer.push(
        m.position.buffer,
        m.uv.buffer,
        m.color.buffer,
        m.layer.buffer,
        m.index.buffer,
      )
      return m
    }
    const opaque = pack(result.opaque)
    const transparent = pack(result.transparent)
    ctx.postMessage(
      { type: 'mesh', id: msg.id, opaque, transparent, worker: msg.worker },
      transfer as Transferable[],
    )
    return
  }
}
