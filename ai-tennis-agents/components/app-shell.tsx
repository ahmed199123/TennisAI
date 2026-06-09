/**
 * Top-level app shell: brand header + primary navigation between the four
 * workspaces (Arena, Roster, Lab, League). Navigation is view-state driven via
 * the lightweight UI store so everything stays a single-page client app.
 */

"use client"

import { cn } from "@/lib/utils"
import { Activity, Users, FlaskConical, Trophy, Cpu } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type View = "arena" | "roster" | "lab" | "league" | "debugger"

const NAV: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "arena", label: "Arena", icon: Activity },
  { id: "debugger", label: "Debugger", icon: Cpu },
  { id: "roster", label: "Roster", icon: Users },
  { id: "lab", label: "Model Lab", icon: FlaskConical },
  { id: "league", label: "League", icon: Trophy },
]

interface Props {
  view: View
  onViewChange: (v: View) => void
}

export function AppShell({ view, onViewChange }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">NeuroCourt</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Tennis Lab</p>
          </div>
        </div>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
