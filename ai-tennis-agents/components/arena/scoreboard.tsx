/**
 * Live scoreboard: sets/games/points for both players, server indicator,
 * pressure-point flag, and the rolling scoreline string.
 */

"use client"

import { useSim } from "@/lib/sim/store"
import type { AgentSummary } from "@/lib/sim/store"
import { displayPoints, isTiebreak, DEFAULT_FORMAT } from "@/lib/match/scoring"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface Props {
  left: AgentSummary | null
  right: AgentSummary | null
}

export function Scoreboard({ left, right }: Props) {
  const state = useSim((s) => s.match.state)
  const scoreboard = useSim((s) => s.match.scoreboard)
  if (!state || !left || !right) return null

  const score = state.score
  const tb = isTiebreak(score, DEFAULT_FORMAT)
  const [pa, pb] = displayPoints(score, tb)

  const Row = ({ side, agent, points }: { side: "left" | "right"; agent: AgentSummary; points: string }) => {
    const idx = side === "left" ? 0 : 1
    const serving = score.server === side
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="size-3 rounded-full" style={{ backgroundColor: agent.color }} aria-hidden />
        <span className="flex-1 truncate font-medium">{agent.name}</span>
        {serving && state.ball.inPlay === false && (
          <span className="size-1.5 rounded-full bg-primary" aria-label="serving" />
        )}
        <div className="flex items-center gap-2 font-mono tabular-nums">
          {score.setHistory.map((s, i) => (
            <span key={i} className="w-5 text-center text-muted-foreground">{s[idx]}</span>
          ))}
          <span className="w-5 text-center">{score.games[idx]}</span>
          <span className="w-7 rounded bg-secondary text-center text-foreground">{points}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Scoreboard</span>
        {score.pressurePoint && !score.matchOver && (
          <Badge variant="destructive" className="text-[10px]">PRESSURE POINT</Badge>
        )}
        {score.matchOver && <Badge className="text-[10px]">FINAL</Badge>}
        {tb && <Badge variant="secondary" className="text-[10px]">TIEBREAK</Badge>}
      </div>
      <div className="divide-y divide-border">
        <Row side="left" agent={left} points={pa} />
        <Row side="right" agent={right} points={pb} />
      </div>
      <div className={cn("mt-2 border-t border-border pt-2 text-center font-mono text-xs text-muted-foreground")}>
        {scoreboard || "0-0"}
      </div>
    </div>
  )
}
