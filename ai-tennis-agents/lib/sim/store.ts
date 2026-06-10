/**
 * ============================================================================
 * SIMULATION STORE (zustand)
 * ============================================================================
 * The single source of truth for the running app:
 *   - the roster of Agents (live class instances, kept out of React state)
 *   - the active MatchEngine and a serializable snapshot of its state
 *   - playback controls (play/pause/step/speed) driven by a rAF loop
 *   - live debug feeds (decision log, predictions, scouting, network trace)
 *   - match history + Elo league standings
 *
 * Heavy mutable objects (Agent, MatchEngine) are stored in a module-level
 * registry, NOT inside React state, so we never deep-clone networks on every
 * tick. React subscribes only to lightweight snapshots that we publish.
 * ============================================================================
 */

"use client"

import { create } from "zustand"
import { Agent } from "../agent/agent"
import { MatchEngine, defaultMatchConfig, type MatchState, type PointOutcome } from "../match/engine"
import type { DecisionLogEntry, MatchStats, Personality, ScoreState, Side, Genome } from "../types"
import { seedRoster, ACCENT_COLORS } from "./roster"
import { updateElo } from "./elo"
import { scoreboardString } from "../match/scoring"
import { simulateMatch, evaluateFitness } from "./simulate"
import { DEFAULT_EVOLUTION, evolveGeneration } from "../genetics/evolution"
import { ARCHETYPE_INDEX } from "../agent/personality"

// ---------------------------------------------------------------------------
// Non-reactive registry of heavy instances.
// ---------------------------------------------------------------------------

interface Registry {
  agents: Map<string, Agent>
  engine: MatchEngine | null
  raf: number | null
  acc: number
  lastTime: number
}

const registry: Registry = {
  agents: new Map(),
  engine: null,
  raf: null,
  acc: 0,
  lastTime: 0,
}

export function getAgent(id: string): Agent | undefined {
  return registry.agents.get(id)
}
export function getEngine(): MatchEngine | null {
  return registry.engine
}

// ---------------------------------------------------------------------------
// Public snapshot shapes (lightweight, serializable-ish).
// ---------------------------------------------------------------------------

export interface AgentSummary {
  id: string
  name: string
  color: string
  archetypeId: string
  generation: number
  rating: number
  overall: number
  skillRating: number
  wins: number
  losses: number
  parents: string[]
  inventedCount: number
}

export interface MatchHistoryEntry {
  id: string
  leftId: string
  rightId: string
  leftName: string
  rightName: string
  winnerId: string
  scoreline: string
  stats: MatchStats
  finishedAt: number
}

export interface MatchSnapshot {
  state: MatchState | null
  scoreboard: string
  stats: MatchStats | null
  decisionLog: DecisionLogEntry[]
  leftId: string | null
  rightId: string | null
  lastPoint: PointOutcome | null
  pointFlash: number
}

interface SimState {
  // roster
  roster: AgentSummary[]
  selectedAgentId: string | null

  // match
  match: MatchSnapshot
  running: boolean
  speed: number
  pointPause: boolean

  // history + league
  history: MatchHistoryEntry[]

  // actions
  initRoster: () => void
  addAgent: (agent: Agent) => void
  removeAgent: (id: string) => void
  selectAgent: (id: string | null) => void
  refreshRoster: () => void

  setupMatch: (leftId: string, rightId: string, seed?: number) => void
  play: () => void
  pause: () => void
  stepOnce: () => void
  setSpeed: (s: number) => void
  resetMatch: () => void

  // creation / training / league
  createAgent: (opts: { name: string; archetypeId: string; color: string; personality: Personality }) => string
  cloneAgent: (id: string, newName: string) => string | null
  renameAgent: (id: string, name: string) => void
  trainPopulation: (opts: TrainConfig) => Promise<void>
  training: TrainingProgress | null
  runQuickMatch: (leftId: string, rightId: string) => MatchHistoryEntry | null
}

export interface TrainConfig {
  baseId: string
  populationSize: number
  generations: number
  matchesPerEval: number
}

export interface TrainingProgress {
  generation: number
  totalGenerations: number
  bestFitness: number
  avgFitness: number
  bestName: string
  running: boolean
  log: string[]
}

// snapshot publishers ---------------------------------------------------------

function summarize(agent: Agent): AgentSummary {
  return {
    id: agent.meta.id,
    name: agent.meta.name,
    color: agent.meta.color,
    archetypeId: agent.meta.archetypeId,
    generation: agent.meta.generation,
    rating: agent.meta.rating,
    overall: agent.overall,
    skillRating: agent.skillRating,
    wins: agent.record.wins,
    losses: agent.record.losses,
    parents: agent.meta.parents,
    inventedCount: agent.skills.filter((s) => s.def.invented).length,
  }
}

function rosterSummaries(): AgentSummary[] {
  return Array.from(registry.agents.values())
    .map(summarize)
    .sort((a, b) => b.rating - a.rating)
}

export const useSim = create<SimState>((set, get) => ({
  roster: [],
  selectedAgentId: null,
  match: {
    state: null,
    scoreboard: "",
    stats: null,
    decisionLog: [],
    leftId: null,
    rightId: null,
    lastPoint: null,
    pointFlash: 0,
  },
  running: false,
  speed: 1,
  pointPause: false,
  training: null,
  history: [],

  initRoster: () => {
    if (registry.agents.size > 0) {
      set({ roster: rosterSummaries() })
      return
    }
    const agents = seedRoster()
    agents.forEach((a) => registry.agents.set(a.meta.id, a))
    set({ roster: rosterSummaries(), selectedAgentId: agents[0]?.meta.id ?? null })
  },

  addAgent: (agent) => {
    registry.agents.set(agent.meta.id, agent)
    set({ roster: rosterSummaries() })
  },

  removeAgent: (id) => {
    registry.agents.delete(id)
    const sel = get().selectedAgentId === id ? null : get().selectedAgentId
    set({ roster: rosterSummaries(), selectedAgentId: sel })
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  refreshRoster: () => set({ roster: rosterSummaries() }),

  setupMatch: (leftId, rightId, seed) => {
    const left = registry.agents.get(leftId)
    const right = registry.agents.get(rightId)
    if (!left || !right) return
    stopLoop()
    const config = defaultMatchConfig(seed ?? Math.floor(Math.random() * 1e6))
    config.speed = 1
    const engine = new MatchEngine(left, right, config, {
      onPoint: (outcome, score) => {
        publishMatch(set, { lastPoint: outcome, pointFlash: Date.now() })
        void score
      },
      onMatchOver: (winner, score) => {
        finalizeMatch(set, get, winner, score)
      },
    })
    registry.engine = engine
    set({
      running: false,
      match: {
        state: engine.state,
        scoreboard: scoreboardString(engine.state.score),
        stats: engine.stats,
        decisionLog: [],
        leftId,
        rightId,
        lastPoint: null,
        pointFlash: 0,
      },
    })
    publishMatch(set, {})
  },

  play: () => {
    if (!registry.engine || registry.engine.isOver()) return
    set({ running: true })
    startLoop(set, get)
  },

  pause: () => {
    set({ running: false })
    stopLoop()
  },

  stepOnce: () => {
    const engine = registry.engine
    if (!engine) return
    // advance until the next meaningful change (a few ticks) or point boundary
    if (engine.state.phase === "pointOver") engine.nextPoint()
    for (let i = 0; i < 4; i++) engine.step()
    publishMatch(set, {})
  },

  setSpeed: (s) => {
    set({ speed: s })
    if (registry.engine) registry.engine.config.speed = s
  },

  resetMatch: () => {
    const { leftId, rightId } = get().match
    if (leftId && rightId) get().setupMatch(leftId, rightId)
  },

  createAgent: ({ name, archetypeId, color, personality }) => {
    const agent = Agent.create({ name, archetypeId, color, personality })
    registry.agents.set(agent.meta.id, agent)
    set({ roster: rosterSummaries(), selectedAgentId: agent.meta.id })
    return agent.meta.id
  },

  cloneAgent: (id, newName) => {
    const src = registry.agents.get(id)
    if (!src) return null
    const clone = src.clone(newName)
    registry.agents.set(clone.meta.id, clone)
    set({ roster: rosterSummaries() })
    return clone.meta.id
  },

  renameAgent: (id, name) => {
    const a = registry.agents.get(id)
    if (!a) return
    a.meta.name = name
    set({ roster: rosterSummaries() })
  },

  runQuickMatch: (leftId, rightId) => {
    const left = registry.agents.get(leftId)
    const right = registry.agents.get(rightId)
    if (!left || !right) return null
    const res = simulateMatch(left, right, Math.floor(Math.random() * 1e6))
    const winnerAgent = res.winner === "left" ? left : right
    const scoreLeft = res.winner === "left" ? 1 : 0
    const [nl, nr] = updateElo(left.meta.rating, right.meta.rating, scoreLeft)
    left.meta.rating = nl
    right.meta.rating = nr
    if (res.winner === "left") { left.record.wins++; right.record.losses++ }
    else { right.record.wins++; left.record.losses++ }
    left.record.matchesPlayed++
    right.record.matchesPlayed++
    const entry: MatchHistoryEntry = {
      id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      leftId, rightId,
      leftName: left.meta.name, rightName: right.meta.name,
      winnerId: winnerAgent.meta.id,
      scoreline: res.score,
      stats: res.stats,
      finishedAt: Date.now(),
    }
    set((s) => ({ history: [entry, ...s.history].slice(0, 50), roster: rosterSummaries() }))
    return entry
  },

  trainPopulation: async ({ baseId, populationSize, generations, matchesPerEval }) => {
    const base = registry.agents.get(baseId)
    if (!base) return
    const config = { ...DEFAULT_EVOLUTION, populationSize }
    const rng = (() => {
      let s = (Date.now() >>> 0) || 1
      return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5
        return ((s >>> 0) % 1_000_000) / 1_000_000
      }
    })()

    // build initial population by mutating the base genome
    const baseGenome = base.toGenome()
    let population: Genome[] = [baseGenome]
    for (let i = 1; i < populationSize; i++) {
      population.push({
        weights: baseGenome.weights.map((w) => w + (rng() - 0.5) * 0.4),
        personality: baseGenome.personality.map((p) => Math.max(0, Math.min(1, p + (rng() - 0.5) * 0.2))),
        skillAffinity: baseGenome.skillAffinity.map((p) => Math.max(0, Math.min(1, p + (rng() - 0.5) * 0.2))),
        mutationRate: 0.08,
      })
    }

    // opponents panel = current roster (snapshot of live agents)
    const opponents = Array.from(registry.agents.values()).slice(0, 4)
    const arch = ARCHETYPE_INDEX[base.meta.archetypeId] ?? null

    set({
      training: {
        generation: 0, totalGenerations: generations, bestFitness: -Infinity,
        avgFitness: 0, bestName: base.meta.name, running: true, log: [`Seeded ${populationSize} variants from ${base.meta.name}`],
      },
    })

    let bestGenome = baseGenome
    let bestFitnessOverall = -Infinity

    for (let gen = 0; gen < generations; gen++) {
      // evaluate
      const fitness: number[] = []
      for (let i = 0; i < population.length; i++) {
        const candidate = Agent.fromGenome(population[i], {
          name: `cand_${i}`, color: base.meta.color, generation: gen,
          parents: [base.meta.id], archetypeId: base.meta.archetypeId,
        })
        const { fitness: f } = evaluateFitness(candidate, opponents, matchesPerEval, gen * 7919 + i * 131)
        fitness.push(f)
        if (f > bestFitnessOverall) { bestFitnessOverall = f; bestGenome = population[i] }
      }

      const result = evolveGeneration(population, fitness, config, rng)
      const avg = result.avgFitness

      set((s) => ({
        training: s.training
          ? {
              ...s.training,
              generation: gen + 1,
              bestFitness: Math.round(result.bestFitness * 10) / 10,
              avgFitness: Math.round(avg * 10) / 10,
              log: [
                `Gen ${gen + 1}/${generations} · best ${result.bestFitness.toFixed(1)} · avg ${avg.toFixed(1)} · diversity ${result.diversity.toFixed(3)}`,
                ...s.training.log,
              ].slice(0, 40),
            }
          : null,
      }))

      population = result.nextPopulation
      // yield to the event loop so the UI can paint between generations
      await new Promise((r) => setTimeout(r, 0))
    }

    // materialize the champion as a new named agent
    const champion = Agent.fromGenome(bestGenome, {
      name: `${base.meta.name} G${generations}`,
      color: ACCENT_COLORS[registry.agents.size % ACCENT_COLORS.length],
      generation: (base.meta.generation ?? 0) + generations,
      parents: [base.meta.id],
      archetypeId: base.meta.archetypeId,
    })
    champion.meta.rating = 1240
    registry.agents.set(champion.meta.id, champion)
    void arch

    set((s) => ({
      roster: rosterSummaries(),
      selectedAgentId: champion.meta.id,
      training: s.training
        ? { ...s.training, running: false, bestName: champion.meta.name, log: [`Champion saved: ${champion.meta.name}`, ...s.training.log] }
        : null,
    }))
  },
}))

// ---------------------------------------------------------------------------
// Animation loop (module scope, drives the engine).
// ---------------------------------------------------------------------------

function startLoop(set: SetFn, get: GetFn) {
  stopLoop()
  registry.lastTime = performance.now()
  const tick = () => {
    const engine = registry.engine
    if (!engine) return
    const speed = get().speed

    // run a batch of physics steps proportional to speed
    const steps = Math.max(1, Math.round(speed * 2))
    for (let i = 0; i < steps; i++) {
      if (engine.state.phase === "pointOver") {
        // small pause between points handled by frame counter
        engine.nextPoint()
      }
      if (engine.isOver()) break
      engine.step()
    }

    publishMatch(set, {})

    if (engine.isOver()) {
      set({ running: false })
      stopLoop()
      return
    }
    registry.raf = requestAnimationFrame(tick)
  }
  registry.raf = requestAnimationFrame(tick)
}

function stopLoop() {
  if (registry.raf != null) {
    cancelAnimationFrame(registry.raf)
    registry.raf = null
  }
}

// ---------------------------------------------------------------------------
// Snapshot publishing
// ---------------------------------------------------------------------------

type SetFn = (partial: Partial<SimState> | ((s: SimState) => Partial<SimState>)) => void
type GetFn = () => SimState

function publishMatch(set: SetFn, extra: Partial<MatchSnapshot>) {
  const engine = registry.engine
  if (!engine) return
  set((s) => ({
    match: {
      ...s.match,
      state: { ...engine.state, players: { ...engine.state.players }, ball: { ...engine.state.ball } },
      scoreboard: scoreboardString(engine.state.score),
      stats: { ...engine.stats },
      decisionLog: engine.decisionLog.slice(-60),
      ...extra,
    },
  }))
}

function finalizeMatch(set: SetFn, get: GetFn, winner: Side, score: ScoreState) {
  const engine = registry.engine
  if (!engine) return
  const left = engine.left
  const right = engine.right
  const winnerAgent = winner === "left" ? left : right

  // Elo update
  const scoreLeft = winner === "left" ? 1 : 0
  const [nl, nr] = updateElo(left.meta.rating, right.meta.rating, scoreLeft)
  left.meta.rating = nl
  right.meta.rating = nr

  const entry: MatchHistoryEntry = {
    id: `m_${Date.now()}`,
    leftId: left.meta.id,
    rightId: right.meta.id,
    leftName: left.meta.name,
    rightName: right.meta.name,
    winnerId: winnerAgent.meta.id,
    scoreline: scoreboardString(score),
    stats: { ...engine.stats },
    finishedAt: Date.now(),
  }

  set((s) => ({
    history: [entry, ...s.history].slice(0, 50),
    roster: rosterSummaries(),
  }))
}
