/**
 * Decision log + live output breakdown for one side of the match. Shows the
 * rolling stream of neural decisions (action, chosen skill, confidence, reasoning
 * tags) and a bar breakdown of the 11 raw motor outputs from the most recent
 * forward pass, labeled by what each output controls.
 */

"use client"

import { useSim } from "@/lib/sim/store"
import { OUTPUT_LABELS } from "@/lib/neural/architecture"
import type { Side } from "@/lib/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface Props {
  side: Side
  accent: string
  name: string
}

export function DecisionLog({ side, accent, name }: Props) {
  const log = useSim((s) => s.match.decisionLog)
  const sideLog = log.filter((e) => e.side === side).slice(-12).reverse()
  const latest = sideLog[0]

  return (
    <div className="flex flex-col gap-3">
      {/* output vector */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Motor Output
          </span>
          {latest && (
            <Badge variant="outline" className="font-mono text-[10px]">
              conf {Math.round(latest.confidence * 100)}%
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {(latest?.rawOutput ?? new Array(OUTPUT_LABELS.length).fill(0)).map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[10px] text-muted-foreground">
                {OUTPUT_LABELS[i] ?? `o${i}`}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    backgroundColor: accent,
                    left: v >= 0 ? "50%" : `${50 + v * 50}%`,
                    width: `${Math.abs(v) * 50}%`,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
              </div>
              <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {v.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* decision stream */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
          <span className="text-xs font-medium">{name} · decision stream</span>
        </div>
        <ScrollArea className="h-56">
          <div className="flex flex-col gap-2 pr-2">
            {sideLog.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Press play in the Arena to stream decisions.
              </p>
            )}
            {sideLog.map((e, i) => (
              <div key={`${e.tick}-${i}`} className="rounded-md bg-secondary/40 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-foreground">{e.action}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">t{e.tick}</span>
                </div>
                {e.skillId && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">shot: {e.skillId}</p>
                )}
                {e.reasons.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.reasons.map((r, ri) => (
                      <Badge key={ri} variant="outline" className="text-[9px]">{r}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
