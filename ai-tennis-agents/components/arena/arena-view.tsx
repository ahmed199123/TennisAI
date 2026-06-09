/**
 * Arena view: the live match screen. Lets the user pick the two competitors,
 * then shows the court canvas alongside the scoreboard, playback controls,
 * and live match statistics.
 */

"use client"

import { useEffect, useMemo } from "react"
import { useSim } from "@/lib/sim/store"
import { CourtCanvas } from "./court-canvas"
import { Scoreboard } from "./scoreboard"
import { MatchControls } from "./match-controls"
import { MatchStatsPanel } from "./match-stats-panel"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Swords } from "lucide-react"

export function ArenaView() {
  const roster = useSim((s) => s.roster)
  const match = useSim((s) => s.match)
  const setupMatch = useSim((s) => s.setupMatch)
  const pause = useSim((s) => s.pause)

  const leftId = match.leftId
  const rightId = match.rightId

  const left = useMemo(() => roster.find((a) => a.id === leftId) ?? null, [roster, leftId])
  const right = useMemo(() => roster.find((a) => a.id === rightId) ?? null, [roster, rightId])

  // auto-setup a default matchup once a roster exists
  useEffect(() => {
    if (!match.state && roster.length >= 2) {
      setupMatch(roster[0].id, roster[1].id)
    }
  }, [roster, match.state, setupMatch])

  const pick = (side: "left" | "right", id: string) => {
    pause()
    const l = side === "left" ? id : (leftId ?? roster[0]?.id)
    const r = side === "right" ? id : (rightId ?? roster[1]?.id)
    if (l && r) setupMatch(l, r)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* matchup selector */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <SideSelect
          label="Left player"
          color={left?.color}
          value={leftId}
          roster={roster}
          onPick={(id) => pick("left", id)}
        />
        <div className="flex items-center gap-2 pb-2 text-muted-foreground">
          <Swords className="size-4" />
          <span className="text-xs font-medium uppercase tracking-wider">vs</span>
        </div>
        <SideSelect
          label="Right player"
          color={right?.color}
          value={rightId}
          roster={roster}
          onPick={(id) => pick("right", id)}
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            if (leftId && rightId) setupMatch(rightId, leftId)
          }}
        >
          Swap sides
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-card md:aspect-[16/10]">
            <CourtCanvas left={left} right={right} />
          </div>
          <MatchControls />
        </div>
        <div className="flex flex-col gap-4">
          <Scoreboard left={left} right={right} />
          <MatchStatsPanel left={left} right={right} />
        </div>
      </div>
    </div>
  )
}

function SideSelect({
  label,
  color,
  value,
  roster,
  onPick,
}: {
  label: string
  color?: string
  value: string | null
  roster: { id: string; name: string; rating: number }[]
  onPick: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
        {label}
      </span>
      <Select value={value ?? null} onValueChange={(v) => v && onPick(v)}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Select player" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {roster.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {Math.round(a.rating)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
