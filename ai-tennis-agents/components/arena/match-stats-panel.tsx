/**
 * Live match statistics: winners, unforced errors, aces, total shots, distance
 * covered, and prediction accuracy — shown head-to-head for both players.
 */

"use client"

import { useSim } from "@/lib/sim/store"
import type { AgentSummary } from "@/lib/sim/store"

interface Props {
  left: AgentSummary | null
  right: AgentSummary | null
}

export function MatchStatsPanel({ left, right }: Props) {
  const stats = useSim((s) => s.match.stats)
  if (!stats || !left || !right) return null

  const rows: { label: string; l: string | number; r: string | number }[] = [
    { label: "Winners", l: stats.winners[0], r: stats.winners[1] },
    { label: "Unforced Errors", l: stats.unforcedErrors[0], r: stats.unforcedErrors[1] },
    { label: "Aces", l: stats.aces[0], r: stats.aces[1] },
    { label: "Total Shots", l: stats.totalShots[0], r: stats.totalShots[1] },
    {
      label: "Distance",
      l: stats.distanceCovered[0].toFixed(1),
      r: stats.distanceCovered[1].toFixed(1),
    },
    {
      label: "Prediction Acc.",
      l: pct(stats.predictionsCorrect[0], stats.predictionsTotal[0]),
      r: pct(stats.predictionsCorrect[1], stats.predictionsTotal[1]),
    },
  ]

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: left.color }}>{left.name}</span>
        <span className="uppercase tracking-wider text-muted-foreground">Match Stats</span>
        <span className="font-medium" style={{ color: right.color }}>{right.name}</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-3 items-center text-sm">
            <span className="text-left font-mono tabular-nums">{row.l}</span>
            <span className="text-center text-xs text-muted-foreground">{row.label}</span>
            <span className="text-right font-mono tabular-nums">{row.r}</span>
          </div>
        ))}
        <div className="grid grid-cols-3 items-center border-t border-border pt-2 text-sm">
          <span className="text-left font-mono text-muted-foreground">—</span>
          <span className="text-center text-xs text-muted-foreground">
            Longest Rally: {stats.longestRally}
          </span>
          <span className="text-right font-mono text-muted-foreground">—</span>
        </div>
      </div>
    </div>
  )
}

function pct(c: number, t: number): string {
  if (t === 0) return "—"
  return `${Math.round((c / t) * 100)}%`
}
