/**
 * Compact horizontal bar list of an agent's 10 personality traits, colored by
 * the agent's accent. Reused in roster cards, the lab, and the debugger.
 */

"use client"

import type { Personality } from "@/lib/types"
import { PERSONALITY_KEYS, TRAIT_LABELS } from "@/lib/agent/personality"

interface Props {
  personality: Personality
  color: string
  compact?: boolean
}

export function TraitBars({ personality, color, compact }: Props) {
  const keys = compact ? PERSONALITY_KEYS.slice(0, 5) : PERSONALITY_KEYS
  return (
    <div className="flex flex-col gap-1.5">
      {keys.map((k) => {
        const v = personality[k]
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{TRAIT_LABELS[k]}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(v * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-7 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {Math.round(v * 100)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
