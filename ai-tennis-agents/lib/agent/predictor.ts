/**
 * ============================================================================
 * PREDICTION ENGINE (anticipation)
 * ============================================================================
 * Predicts where the opponent will send the ball *before* they hit it, so the
 * agent can pre-position. Combines two signals:
 *
 *   1. Kinematic prediction — extrapolate the opponent's body position, facing,
 *      and the incoming ball geometry to estimate the most reachable targets.
 *   2. Statistical prediction — the ScoutingModel's learned directional bias.
 *
 * The blend weight is driven by the agent's `anticipation` trait and the
 * scouting model's confidence. The output feeds neural inputs 19-21 and also
 * directly nudges movement. Prediction accuracy is tracked for the debugger.
 * ============================================================================
 */

import type { BallState, PlayerMatchState, Side, Vec2 } from "../types"
import { ScoutingModel } from "./scouting"
import { COURT, clamp } from "../physics/court"

export interface Prediction {
  target: Vec2
  confidence: number
  /** breakdown for the debugger */
  kinematic: Vec2
  statistical: Vec2
  blend: number
}

export class Predictor {
  private anticipation: number
  /** rolling accuracy tracking */
  correct = 0
  total = 0

  constructor(anticipation: number) {
    this.anticipation = anticipation
  }

  /**
   * Predict the opponent's outgoing shot landing point on *our* half.
   * @param self   our player
   * @param opp    opponent player about to hit
   * @param ball   the ball traveling toward the opponent
   * @param scout  our scouting model of the opponent
   * @param ourSide which half we defend
   */
  predict(
    self: PlayerMatchState,
    opp: PlayerMatchState,
    ball: BallState,
    scout: ScoutingModel,
    ourSide: Side,
  ): Prediction {
    // --- kinematic component -------------------------------------------
    // Opponents tend to redirect toward the open court (away from where we are).
    const ourDefenseCenter = ourSide === "left" ? COURT.net / 2 : COURT.net + COURT.net / 2
    const openSideX = self.pos.x < 0.5 ? 0.72 : 0.28 // hit behind / away from us
    const kineticDepth = ourSide === "left" ? 0.12 : 0.88
    const kinematic: Vec2 = {
      x: clamp(openSideX + (opp.vel.x * 4), COURT.sideline, 1 - COURT.sideline),
      y: kineticDepth,
    }

    // --- statistical component -----------------------------------------
    const dir = scout.mostLikelyDirection(false)
    const statX = dir === "left" ? 0.22 : dir === "right" ? 0.78 : 0.5
    const statDepth = ourSide === "left" ? scout.tendencies.avgDepth * 0.4 : 1 - scout.tendencies.avgDepth * 0.4
    const statistical: Vec2 = { x: statX, y: statDepth }

    // --- blend ----------------------------------------------------------
    // more anticipation + more scouting confidence => trust statistics more
    const scoutConf = clamp(scout.tendencies.predictability, 0, 1)
    const blend = clamp(this.anticipation * 0.5 + scoutConf * 0.5, 0, 1)
    const target: Vec2 = {
      x: kinematic.x * (1 - blend) + statistical.x * blend,
      y: kinematic.y * (1 - blend) + statistical.y * blend,
    }
    void ourDefenseCenter

    const confidence = clamp(0.3 + this.anticipation * 0.3 + scoutConf * 0.4, 0, 1)
    return { target, confidence, kinematic, statistical, blend }
  }

  /** Record whether a previous prediction matched the actual landing point. */
  score(predicted: Vec2, actual: Vec2) {
    this.total++
    const dx = predicted.x - actual.x
    const dy = predicted.y - actual.y
    if (Math.sqrt(dx * dx + dy * dy) < 0.18) this.correct++
  }

  get accuracy(): number {
    return this.total > 0 ? this.correct / this.total : 0
  }

  reset() {
    this.correct = 0
    this.total = 0
  }
}
