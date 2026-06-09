/**
 * Playback controls for the live match: play/pause, single-step, reset, and a
 * speed slider. Also shows the live rally length and tick counter.
 */

"use client"

import { useSim } from "@/lib/sim/store"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, StepForward, RotateCcw } from "lucide-react"

export function MatchControls() {
  const running = useSim((s) => s.running)
  const speed = useSim((s) => s.speed)
  const play = useSim((s) => s.play)
  const pause = useSim((s) => s.pause)
  const stepOnce = useSim((s) => s.stepOnce)
  const setSpeed = useSim((s) => s.setSpeed)
  const resetMatch = useSim((s) => s.resetMatch)
  const state = useSim((s) => s.match.state)
  const over = state?.phase === "matchOver"

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {running ? (
          <Button size="sm" variant="secondary" onClick={pause}>
            <Pause data-icon="inline-start" />
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={play} disabled={over}>
            <Play data-icon="inline-start" />
            Play
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={stepOnce} disabled={running || over}>
          <StepForward data-icon="inline-start" />
          Step
        </Button>
        <Button size="sm" variant="ghost" onClick={resetMatch}>
          <RotateCcw data-icon="inline-start" />
          Reset
        </Button>
      </div>

      <div className="flex min-w-44 flex-1 items-center gap-3">
        <span className="text-xs text-muted-foreground">Speed</span>
        <Slider
          value={[speed]}
          min={0.25}
          max={8}
          step={0.25}
          onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)}
          aria-label="Simulation speed"
        />
        <span className="w-10 font-mono text-xs tabular-nums text-foreground">{speed.toFixed(2)}x</span>
      </div>

      <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
        <span>rally {state?.rallyLength ?? 0}</span>
        <span>tick {state?.tick ?? 0}</span>
      </div>
    </div>
  )
}
