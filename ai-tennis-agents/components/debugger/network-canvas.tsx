/**
 * Live neural network visualizer. Draws every layer of an agent's brain as
 * columns of neurons, colors each neuron by its current activation (from the
 * latest forward-pass trace), and draws the weighted connections between layers
 * (green = positive weight, red = negative, opacity = magnitude). Updates every
 * animation frame from the running engine so you can literally watch the brain
 * fire while it plays.
 */

"use client"

import { useEffect, useRef } from "react"
import { getAgent } from "@/lib/sim/store"

interface Props {
  agentId: string | null
  accent: string
}

export function NetworkCanvas({ agentId, accent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf = 0

    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const agent = agentId ? getAgent(agentId) : null
      if (!agent) {
        raf = requestAnimationFrame(render)
        return
      }

      const arch = agent.network.architecture // e.g. [24, 32, 24, 16, 11]
      const trace = agent.lastTrace
      const layers = agent.network.layers

      const padX = 36
      const padY = 24
      const colW = (W - padX * 2) / (arch.length - 1)
      const maxNeuronsShown = 16

      // node positions per layer
      const positions: { x: number; y: number; act: number }[][] = []
      for (let l = 0; l < arch.length; l++) {
        const count = Math.min(arch[l], maxNeuronsShown)
        const acts = trace?.layerActivations[l] ?? []
        const col: { x: number; y: number; act: number }[] = []
        const gap = (H - padY * 2) / Math.max(1, count - 1 || 1)
        for (let n = 0; n < count; n++) {
          const x = padX + l * colW
          const y = count === 1 ? H / 2 : padY + n * gap
          col.push({ x, y, act: acts[n] ?? 0 })
        }
        positions.push(col)
      }

      // edges
      for (let l = 0; l < positions.length - 1; l++) {
        const from = positions[l]
        const to = positions[l + 1]
        const layer = layers[l]
        if (!layer) continue
        const shownIn = from.length
        const shownOut = to.length
        for (let j = 0; j < shownOut; j++) {
          for (let i = 0; i < shownIn; i++) {
            const w = layer.weights[j * layer.inputs + i] ?? 0
            const mag = Math.min(1, Math.abs(w))
            if (mag < 0.08) continue
            const signalled = Math.abs(from[i].act) > 0.05
            const alpha = mag * (signalled ? 0.5 : 0.12)
            ctx.strokeStyle = w >= 0
              ? `rgba(80, 200, 140, ${alpha})`
              : `rgba(230, 90, 110, ${alpha})`
            ctx.lineWidth = mag * 1.4
            ctx.beginPath()
            ctx.moveTo(from[i].x, from[i].y)
            ctx.lineTo(to[j].x, to[j].y)
            ctx.stroke()
          }
        }
      }

      // nodes
      for (let l = 0; l < positions.length; l++) {
        for (const node of positions[l]) {
          const a = Math.max(-1, Math.min(1, node.act))
          const intensity = Math.abs(a)
          ctx.beginPath()
          ctx.arc(node.x, node.y, 5 + intensity * 3, 0, Math.PI * 2)
          if (a >= 0) {
            ctx.fillStyle = `rgba(120, 220, 160, ${0.25 + intensity * 0.75})`
          } else {
            ctx.fillStyle = `rgba(235, 110, 130, ${0.25 + intensity * 0.75})`
          }
          ctx.fill()
          ctx.strokeStyle = "rgba(255,255,255,0.15)"
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // layer labels
      ctx.fillStyle = "rgba(255,255,255,0.4)"
      ctx.font = "10px ui-monospace, monospace"
      ctx.textAlign = "center"
      const labels = ["in", ...arch.slice(1, -1).map((_, i) => `h${i + 1}`), "out"]
      for (let l = 0; l < arch.length; l++) {
        ctx.fillText(`${labels[l]} (${arch[l]})`, padX + l * colW, H - 6)
      }
      void accent
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [agentId, accent])

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      role="img"
      aria-label="Live neural network activation visualization"
    />
  )
}
