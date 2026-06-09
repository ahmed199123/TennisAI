/**
 * Roster view: a grid of every agent in the lab. Each card shows the agent's
 * archetype, accent, overall/skill ratings, win-loss record, invented-shot count,
 * and a personality preview. Cards open a detail view and offer clone / delete /
 * "send to arena" actions.
 */

"use client"

import { useSim, getAgent, type AgentSummary } from "@/lib/sim/store"
import { ARCHETYPE_INDEX } from "@/lib/agent/personality"
import { AgentCreator } from "./agent-creator"
import { TraitBars } from "@/components/shared/trait-bars"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Copy, Trash2, Sparkles } from "lucide-react"

export function RosterView() {
  const roster = useSim((s) => s.roster)
  const cloneAgent = useSim((s) => s.cloneAgent)
  const removeAgent = useSim((s) => s.removeAgent)
  const selectAgent = useSim((s) => s.selectAgent)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Roster</h1>
          <p className="text-sm text-muted-foreground">
            {roster.length} agents · each one a unique neural network and personality
          </p>
        </div>
        <AgentCreator />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roster.map((a) => (
          <AgentCard
            key={a.id}
            summary={a}
            onClone={() => cloneAgent(a.id, `${a.name} Copy`)}
            onRemove={() => removeAgent(a.id)}
            onInspect={() => selectAgent(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AgentCard({
  summary,
  onClone,
  onRemove,
  onInspect,
}: {
  summary: AgentSummary
  onClone: () => void
  onRemove: () => void
  onInspect: () => void
}) {
  const agent = getAgent(summary.id)
  const arch = ARCHETYPE_INDEX[summary.archetypeId]
  const total = summary.wins + summary.losses
  const winPct = total ? Math.round((summary.wins / total) * 100) : 0

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-lg text-sm font-bold"
            style={{ backgroundColor: summary.color, color: "#0b0f14" }}
          >
            {summary.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight">
            <p className="font-semibold">{summary.name}</p>
            <p className="text-xs text-muted-foreground">{arch?.name ?? summary.archetypeId}</p>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono">{Math.round(summary.rating)}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Overall" value={summary.overall} />
        <Stat label="Skill" value={`${Math.round(summary.skillRating * 100)}`} />
        <Stat label="Gen" value={summary.generation} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-mono text-foreground">{summary.wins}</span>W ·{" "}
          <span className="font-mono text-foreground">{summary.losses}</span>L
        </span>
        <span className="text-muted-foreground">{winPct}% win</span>
        {summary.inventedCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Sparkles className="size-3" /> {summary.inventedCount} invented
          </Badge>
        )}
      </div>

      {agent && <TraitBars personality={agent.personality} color={summary.color} compact />}

      <div className="mt-1 flex items-center gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onInspect}>
          Inspect
        </Button>
        <Button size="sm" variant="ghost" onClick={onClone} aria-label="Clone agent">
          <Copy />
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Delete agent">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-secondary/50 py-1.5">
      <p className="font-mono text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
