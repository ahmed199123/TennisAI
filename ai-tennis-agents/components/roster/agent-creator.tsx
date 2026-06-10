/**
 * Agent creator dialog. Start from an archetype preset, tweak the 10 personality
 * traits with sliders, pick a name and accent color, then spawn a brand-new
 * agent with a freshly initialized neural network.
 */

"use client"

import { useState } from "react"
import { useSim } from "@/lib/sim/store"
import { ARCHETYPES, PERSONALITY_KEYS, TRAIT_LABELS, TRAIT_DESCRIPTIONS } from "@/lib/agent/personality"
import type { Personality } from "@/lib/types"
import { ACCENT_COLORS } from "@/lib/sim/roster"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"

export function AgentCreator() {
  const createAgent = useSim((s) => s.createAgent)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("New Challenger")
  const [archetypeId, setArchetypeId] = useState(ARCHETYPES[0].id)
  const [color, setColor] = useState(ACCENT_COLORS[2])
  const [personality, setPersonality] = useState<Personality>({ ...ARCHETYPES[0].personality })

  const applyArchetype = (id: string) => {
    setArchetypeId(id)
    const arc = ARCHETYPES.find((a) => a.id === id)
    if (arc) setPersonality({ ...arc.personality })
  }

  const submit = () => {
    createAgent({ name: name.trim() || "Unnamed", archetypeId, color, personality })
    setOpen(false)
    setName("New Challenger")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            New Agent
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a new agent</DialogTitle>
          <DialogDescription>
            Pick a starting archetype, then fine-tune its personality. The neural network is initialized fresh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Accent color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={cn(
                      "size-7 rounded-full border-2 transition-transform",
                      color === c ? "scale-110 border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Archetype preset</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {ARCHETYPES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => applyArchetype(a.id)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-colors",
                    archetypeId === a.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-secondary/50",
                  )}
                >
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{a.tagline}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Label>Personality traits</Label>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {PERSONALITY_KEYS.map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" title={TRAIT_DESCRIPTIONS[k]}>{TRAIT_LABELS[k]}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(personality[k] * 100)}
                    </span>
                  </div>
                  <Slider
                    value={[personality[k]]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => setPersonality((p) => ({ ...p, [k]: Array.isArray(v) ? v[0] : v }))}
                    aria-label={TRAIT_LABELS[k]}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>Create agent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
