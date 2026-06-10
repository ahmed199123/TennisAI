"use client"

import { useEffect, useState } from "react"
import { AppShell, type View } from "@/components/app-shell"
import { ArenaView } from "@/components/arena/arena-view"
import { RosterView } from "@/components/roster/roster-view"
import { LabView } from "@/components/lab/lab-view"
import { LeagueView } from "@/components/league/league-view"
import { useSim } from "@/lib/sim/store"

export default function Page() {
  const [view, setView] = useState<View>("arena")
  const initRoster = useSim((s) => s.initRoster)

  useEffect(() => {
    initRoster()
  }, [initRoster])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppShell view={view} onViewChange={setView} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {view === "arena" && <ArenaView />}
        {view === "roster" && <RosterView />}
        {view === "lab" && <LabView />}
        {view === "league" && <LeagueView />}
      </main>
    </div>
  )
}
