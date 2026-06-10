/**
 * Court canvas renderer. Draws the top-down tennis court, both players (with
 * their accent colors, stamina rings, and swing flashes), the ball with a
 * motion trail, and each agent's live prediction marker. Pure canvas, redrawn
 * from the latest match snapshot every animation frame.
 */

"use client"

import { useEffect, useRef } from "react"
import { useSim, getEngine } from "@/lib/sim/store"
import type { AgentSummary } from "@/lib/sim/store"

interface Props {
  left: AgentSummary | null
  right: AgentSummary | null
}

export function CourtCanvas({ left, right }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trailRef = useRef<{ x: number; y: number }[]>([])
  const state = useSim((s) => s.match.state)

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

      // court padding
      const pad = 24
      const cw = W - pad * 2
      const ch = H - pad * 2
      const toX = (nx: number) => pad + nx * cw
      const toY = (ny: number) => pad + ny * ch

      // surface
      ctx.fillStyle = "oklch(0.34 0.05 230)"
      roundRect(ctx, pad, pad, cw, ch, 6)
      ctx.fill()

      // outer + singles lines
      ctx.strokeStyle = "rgba(255,255,255,0.85)"
      ctx.lineWidth = 2
      ctx.strokeRect(toX(0.08), toY(0), cw * 0.84, ch)
      // baselines already by rect; service lines
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(toX(0.08), toY(0.32))
      ctx.lineTo(toX(0.92), toY(0.32))
      ctx.moveTo(toX(0.08), toY(0.68))
      ctx.lineTo(toX(0.92), toY(0.68))
      // center service line
      ctx.moveTo(toX(0.5), toY(0.32))
      ctx.lineTo(toX(0.5), toY(0.68))
      ctx.stroke()

      // net
      ctx.strokeStyle = "rgba(255,255,255,0.95)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(toX(0.04), toY(0.5))
      ctx.lineTo(toX(0.96), toY(0.5))
      ctx.stroke()
      ctx.strokeStyle = "rgba(255,255,255,0.25)"
      ctx.lineWidth = 1
      for (let i = 0; i <= 40; i++) {
        const x = toX(0.04 + (0.92 * i) / 40)
        ctx.beginPath()
        ctx.moveTo(x, toY(0.5) - 4)
        ctx.lineTo(x, toY(0.5) + 4)
        ctx.stroke()
      }

      const s = getEngine()?.state ?? state
      if (s) {
        // prediction markers
        const engine = getEngine()
        if (engine) {
          drawPrediction(ctx, engine.predictions.left, toX, toY, left?.color ?? "#5b9cff")
          drawPrediction(ctx, engine.predictions.right, toX, toY, right?.color ?? "#ff9a3c")
        }

        // players
        drawPlayer(ctx, s.players.left, toX, toY, left?.color ?? "#5b9cff")
        drawPlayer(ctx, s.players.right, toX, toY, right?.color ?? "#ff9a3c")

        // ball + trail
        if (s.ball.inPlay) {
          const bx = toX(s.ball.pos.x)
          const by = toY(s.ball.pos.y)
          trailRef.current.push({ x: bx, y: by })
          if (trailRef.current.length > 14) trailRef.current.shift()
        } else {
          trailRef.current = []
        }
        const trail = trailRef.current
        for (let i = 0; i < trail.length; i++) {
          const t = trail[i]
          const a = (i + 1) / trail.length
          ctx.fillStyle = `rgba(255, 240, 120, ${a * 0.5})`
          ctx.beginPath()
          ctx.arc(t.x, t.y, 2 + a * 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
        if (s.ball.inPlay) {
          const bx = toX(s.ball.pos.x)
          const by = toY(s.ball.pos.y)
          const lift = s.ball.height * ch * 0.6
          // shadow
          ctx.fillStyle = "rgba(0,0,0,0.35)"
          ctx.beginPath()
          ctx.ellipse(bx, by, 5, 3, 0, 0, Math.PI * 2)
          ctx.fill()
          // ball
          ctx.fillStyle = "#f5f33c"
          ctx.beginPath()
          ctx.arc(bx, by - lift, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = "rgba(0,0,0,0.4)"
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [left, right, state])

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg"
      aria-label="Live tennis match court view"
      role="img"
    />
  )
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: { pos: { x: number; y: number }; stamina: number; swingTimer: number },
  toX: (n: number) => number,
  toY: (n: number) => number,
  color: string,
) {
  const x = toX(p.pos.x)
  const y = toY(p.pos.y)
  // stamina ring
  ctx.strokeStyle = "rgba(255,255,255,0.18)"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, p.stamina))
  ctx.stroke()
  // swing flash
  if (p.swingTimer > 0) {
    ctx.fillStyle = `${hexToRgba(color, 0.25)}`
    ctx.beginPath()
    ctx.arc(x, y, 20, 0, Math.PI * 2)
    ctx.fill()
  }
  // body
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawPrediction(
  ctx: CanvasRenderingContext2D,
  pred: { target: { x: number; y: number }; confidence: number } | null,
  toX: (n: number) => number,
  toY: (n: number) => number,
  color: string,
) {
  if (!pred) return
  const x = toX(pred.target.x)
  const y = toY(pred.target.y)
  ctx.strokeStyle = hexToRgba(color, 0.4 + pred.confidence * 0.4)
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.arc(x, y, 10 + pred.confidence * 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x - 5, y)
  ctx.lineTo(x + 5, y)
  ctx.moveTo(x, y - 5)
  ctx.lineTo(x, y + 5)
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
