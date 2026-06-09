/**
 * Model Lab: the training ground. Select a base agent, configure an evolutionary
 * run (population size, generations, matches per evaluation), and launch a
 * neuro-evolution session that breeds a stronger champion against the current
 * roster. Live generation-by-generation progress and a fitness log are shown.
 */

"use client"

import { useState } from "react"
import { useSim } from "@/lib/sim/store"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FlaskConical, Dna, Swords } from "lucide-react"

export function LabView() {
  const roster = useSim((s) => s.roster)
  const training = useSim((s) => s.training)
  const trainPopulation = useSim((s) => s.trainPopulation)
  const runQuickMatch = useSim((s) => s.runQuickMatch)

  const [baseId, setBaseId] = useState<string | undefined>(undefined)
  const [population, setPopulation] = useState(16)
  const [generations, setGenerations] = useState(8)
  const [matchesPer, setMatchesPer] = useState(1)

  const [qLeft, setQLeft] = useState<string | undefined>(undefined)
  const [qRight, setQRight] = useState<string | undefined>(undefined)
  const [qResult, setQResult] = useState<string | null>(null)

  const isRunning = training?.running ?? false
  const base = baseId ?? roster[0]?.id

  const launch = () => {
    if (!base) return
    void trainPopulation({ baseId: base, populationSize: population, generations, matchesPerEval: matchesPer })
  }

  const quick = () => {
    const l = qLeft ?? roster[0]?.id
    const r = qRight ?? roster[1]?.id
    if (!l || !r) return
    const res = runQuickMatch(l, r)
    if (res) {
      const winnerName = res.winnerId === res.leftId ? res.leftName : res.rightName
      setQResult(`${res.leftName} vs ${res.rightName} → ${winnerName} wins ${res.scoreline}`)
    }
  }

  const progress = training ? (training.generation / training.totalGenerations) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Model Lab</h1>
        <p className="text-sm text-muted-foreground">
          Breed stronger brains through neuro-evolution, or run instant headless matches.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolution trainer */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Dna className="size-4 text-primary" />
            <h2 className="font-medium">Evolution Trainer</h2>
          </div>

          <Field label="Base agent">
            <Select value={base ?? null} onValueChange={(v) => v && setBaseId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select base agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roster.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · {Math.round(a.rating)}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <SliderField label="Population" value={population} min={8} max={48} step={4} onChange={setPopulation} />
          <SliderField label="Generations" value={generations} min={2} max={30} step={1} onChange={setGenerations} />
          <SliderField label="Matches / eval" value={matchesPer} min={1} max={4} step={1} onChange={setMatchesPer} />

          <Button onClick={launch} disabled={isRunning || !base}>
            <FlaskConical data-icon="inline-start" />
            {isRunning ? "Training…" : "Start evolution"}
          </Button>

          {training && (
            <div className="flex flex-col gap-3 rounded-lg bg-secondary/40 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Generation {training.generation}/{training.totalGenerations}
                </span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="font-mono">best {training.bestFitness}</Badge>
                  <Badge variant="secondary" className="font-mono">avg {training.avgFitness}</Badge>
                </div>
              </div>
              <Progress value={progress} />
              <ScrollArea className="h-32 rounded-md border border-border bg-background/50 p-2">
                <div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                  {training.log.map((line, i) => (
                    <p key={i} className={i === 0 ? "text-foreground" : undefined}>{line}</p>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Quick match */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Swords className="size-4 text-primary" />
            <h2 className="font-medium">Instant Match (headless)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Simulate a full match instantly without animation — great for grinding records and ratings.
          </p>

          <Field label="Player A">
            <Select value={qLeft ?? roster[0]?.id ?? null} onValueChange={(v) => v && setQLeft(v)}>
              <SelectTrigger><SelectValue placeholder="Player A" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roster.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Player B">
            <Select value={qRight ?? roster[1]?.id ?? null} onValueChange={(v) => v && setQRight(v)}>
              <SelectTrigger><SelectValue placeholder="Player B" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roster.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Button variant="secondary" onClick={quick}>Simulate match</Button>

          {qResult && (
            <div className="rounded-lg bg-secondary/40 p-3 text-sm">{qResult}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function SliderField({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} aria-label={label} />
    </div>
  )
}
