/**
 * ============================================================================
 * SCOUTING ENGINE (opponent modelling)
 * ============================================================================
 * Every agent runs a live scouting model of its current opponent. As the match
 * progresses it ingests each shot the opponent plays and incrementally updates a
 * statistical tendency profile: directional bias, depth, power, favourite
 * skills, serve placement, and how the opponent reacts under pressure.
 *
 * The model uses exponential moving averages so it tracks *recent* form — an
 * opponent that changes tactics gets re-learned. The `adaptability` personality
 * trait controls the EMA half-life: adaptable agents forget old patterns faster.
 * ============================================================================
 */

import type { ScoutingTendencies, ShotRecord } from "../types"

function emptyTendencies(): ScoutingTendencies {
  return {
    directionBias: { left: 0.33, center: 0.34, right: 0.33 },
    avgDepth: 0.5,
    avgPower: 0.5,
    favoriteSkills: [],
    predictability: 0,
    serveBias: { left: 0.33, center: 0.34, right: 0.33 },
    pressureWeakness: 0.3,
    sampleSize: 0,
  }
}

export class ScoutingModel {
  tendencies: ScoutingTendencies
  /** ring buffer of recent observed shots for sequence analysis */
  history: ShotRecord[] = []
  private maxHistory = 60
  private alpha: number
  private skillCounts: Record<string, number> = {}
  private pressureErrors = 0
  private pressurePoints = 0

  constructor(adaptability: number) {
    this.tendencies = emptyTendencies()
    // adaptable agents weight new data more heavily (faster forgetting)
    this.alpha = 0.04 + adaptability * 0.16
  }

  /** Ingest one observed opponent shot and update the model. */
  observe(shot: ShotRecord, underPressure: boolean, wasError: boolean) {
    this.history.push(shot)
    if (this.history.length > this.maxHistory) this.history.shift()

    const t = this.tendencies
    const a = this.alpha

    // directional EMA
    const dirTarget = { left: 0, center: 0, right: 0 }
    dirTarget[shot.direction] = 1
    if (shot.serve) {
      t.serveBias.left += a * (dirTarget.left - t.serveBias.left)
      t.serveBias.center += a * (dirTarget.center - t.serveBias.center)
      t.serveBias.right += a * (dirTarget.right - t.serveBias.right)
    } else {
      t.directionBias.left += a * (dirTarget.left - t.directionBias.left)
      t.directionBias.center += a * (dirTarget.center - t.directionBias.center)
      t.directionBias.right += a * (dirTarget.right - t.directionBias.right)
    }

    // depth / power EMA
    t.avgDepth += a * (shot.depth - t.avgDepth)
    t.avgPower += a * (shot.power - t.avgPower)

    // skill frequency
    this.skillCounts[shot.skillId] = (this.skillCounts[shot.skillId] ?? 0) + 1
    t.favoriteSkills = Object.entries(this.skillCounts)
      .map(([skillId, c]) => ({ skillId, freq: c }))
      .sort((x, y) => y.freq - x.freq)
      .slice(0, 4)

    // pressure tracking
    if (underPressure) {
      this.pressurePoints++
      if (wasError) this.pressureErrors++
      t.pressureWeakness = this.pressurePoints > 0 ? this.pressureErrors / this.pressurePoints : 0.3
    }

    t.sampleSize++
    t.predictability = this.computePredictability()
  }

  /**
   * Predictability = how concentrated the directional distribution is (low
   * entropy = predictable) combined with how repetitive the recent shot
   * sequence is. Range [0,1].
   */
  private computePredictability(): number {
    const d = this.tendencies.directionBias
    const probs = [d.left, d.center, d.right].filter((p) => p > 0)
    let entropy = 0
    for (const p of probs) entropy -= p * Math.log(p)
    const maxEntropy = Math.log(3)
    const concentration = 1 - entropy / maxEntropy

    // sequence repetition: how often the same skill repeats back-to-back
    let repeats = 0
    for (let i = 1; i < this.history.length; i++) {
      if (this.history[i].skillId === this.history[i - 1].skillId) repeats++
    }
    const repetition = this.history.length > 1 ? repeats / (this.history.length - 1) : 0

    const confidence = Math.min(1, this.tendencies.sampleSize / 20)
    return (concentration * 0.6 + repetition * 0.4) * confidence
  }

  /** Most likely direction the opponent will hit next given recent context. */
  mostLikelyDirection(serve: boolean): "left" | "center" | "right" {
    const bias = serve ? this.tendencies.serveBias : this.tendencies.directionBias
    if (bias.left >= bias.center && bias.left >= bias.right) return "left"
    if (bias.right >= bias.center && bias.right >= bias.left) return "right"
    return "center"
  }

  reset() {
    this.tendencies = emptyTendencies()
    this.history = []
    this.skillCounts = {}
    this.pressureErrors = 0
    this.pressurePoints = 0
  }
}
