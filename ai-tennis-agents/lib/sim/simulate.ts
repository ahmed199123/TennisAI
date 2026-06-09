/**
 * Headless match simulation — runs a full match with no rendering, as fast as
 * the CPU allows, with a hard tick cap so a stalled rally can never hang the
 * training loop. Used by the Model Lab (evolution) and quick-match utilities.
 */

import { Agent } from "../agent/agent"
import { MatchEngine, defaultMatchConfig, type PointOutcome } from "../match/engine"
import type { MatchStats, Side } from "../types"

export interface SimResult {
  winner: Side
  stats: MatchStats
  ticks: number
  score: string
}

const MAX_TICKS = 200_000

/** Simulate a complete match headlessly and return the winner + stats. */
export function simulateMatch(left: Agent, right: Agent, seed: number): SimResult {
  const engine = new MatchEngine(left, right, defaultMatchConfig(seed))
  let ticks = 0
  let lastPoint: PointOutcome | null = null
  void lastPoint
  while (!engine.isOver() && ticks < MAX_TICKS) {
    if (engine.state.phase === "pointOver") engine.nextPoint()
    engine.step()
    ticks++
  }
  const winner: Side = engine.state.score.sets[0] > engine.state.score.sets[1] ? "left" : "right"
  return {
    winner,
    stats: engine.stats,
    ticks,
    score: `${engine.state.score.sets[0]}-${engine.state.score.sets[1]}`,
  }
}

/**
 * Fitness evaluation for a candidate against a panel of opponents. Rewards
 * winning, point differential, winners, prediction accuracy, and skill use,
 * while penalizing unforced errors. Returns a single scalar fitness.
 */
export function evaluateFitness(
  candidate: Agent,
  opponents: Agent[],
  matchesPer: number,
  seedBase: number,
): { fitness: number; wins: number; played: number } {
  let fitness = 0
  let wins = 0
  let played = 0
  for (let o = 0; o < opponents.length; o++) {
    for (let m = 0; m < matchesPer; m++) {
      const seed = seedBase + o * 1000 + m * 17
      const res = simulateMatch(candidate, opponents[o], seed)
      played++
      const idx = 0 // candidate is always "left"
      const opp = 1
      if (res.winner === "left") {
        wins++
        fitness += 100
      }
      fitness += (res.stats.winners[idx] - res.stats.winners[opp]) * 2
      fitness -= res.stats.unforcedErrors[idx] * 1.5
      const predTotal = res.stats.predictionsTotal[idx]
      if (predTotal > 0) {
        fitness += (res.stats.predictionsCorrect[idx] / predTotal) * 20
      }
      fitness += res.stats.aces[idx] * 3
    }
  }
  return { fitness: fitness / Math.max(1, played), wins, played }
}
