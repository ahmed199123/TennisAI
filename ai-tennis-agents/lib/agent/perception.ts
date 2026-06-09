/**
 * ============================================================================
 * PERCEPTION
 * ============================================================================
 * Translates raw match state into the 34-dimensional normalized input vector
 * the neural network consumes. This is the agent's "senses": its own body, the
 * ball kinematics, the opponent, the live prediction, the scouting report, and
 * the score context. Keeping this isolated means the input contract is auditable
 * in one place and the debugger can label every neuron.
 * ============================================================================
 */

import type { BallState, PlayerMatchState, ScoreState, Side, Vec2 } from "../types"
import { INPUT_SIZE } from "../neural/architecture"
import { COURT, clamp, dist } from "../physics/court"
import type { Agent } from "./agent"

export interface PerceptionContext {
  self: PlayerMatchState
  opp: PlayerMatchState
  ball: BallState
  score: ScoreState
  ourSide: Side
  rallyLength: number
  prediction: { target: Vec2; confidence: number } | null
}

/** Estimate ticks until the ball reaches the agent's intercept zone. */
function estimateTimeToReach(self: PlayerMatchState, ball: BallState): number {
  const speed = Math.hypot(ball.vel.x, ball.vel.y) || 0.001
  const d = dist(self.pos, ball.pos)
  return clamp(d / speed / 60, 0, 1)
}

export function buildPerception(agent: Agent, ctx: PerceptionContext): number[] {
  const { self, opp, ball, score, ourSide, rallyLength, prediction } = ctx
  const input = new Array<number>(INPUT_SIZE).fill(0)

  const ballDist = dist(self.pos, ball.pos)
  const oppDist = dist(opp.pos, ball.pos)

  const pointDiff = score.points[0] - score.points[1]
  const gameDiff = score.games[0] - score.games[1]
  const setDiff = score.sets[0] - score.sets[1]
  const sideSign = ourSide === "left" ? 1 : -1

  // 0-5 self
  input[0] = self.pos.x
  input[1] = self.pos.y
  input[2] = clamp(self.vel.x * 20, -1, 1)
  input[3] = clamp(self.vel.y * 20, -1, 1)
  input[4] = self.stamina
  input[5] = clamp(self.momentum, -1, 1)
  // 6-13 ball
  input[6] = ball.pos.x
  input[7] = ball.pos.y
  input[8] = clamp(ball.vel.x * 20, -1, 1)
  input[9] = clamp(ball.vel.y * 20, -1, 1)
  input[10] = clamp(ball.height * 3, 0, 1)
  input[11] = clamp(ball.spin, -1, 1)
  input[12] = clamp(ballDist, 0, 1)
  input[13] = estimateTimeToReach(self, ball)
  // 14-18 opponent
  input[14] = opp.pos.x
  input[15] = opp.pos.y
  input[16] = clamp(opp.vel.x * 20, -1, 1)
  input[17] = clamp(opp.vel.y * 20, -1, 1)
  input[18] = clamp(oppDist, 0, 1)
  // 19-21 prediction
  input[19] = prediction ? prediction.target.x : 0.5
  input[20] = prediction ? prediction.target.y : 0.5
  input[21] = prediction ? prediction.confidence : 0
  // 22-26 scouting
  const sc = agent.scouting.tendencies
  input[22] = sc.directionBias.left
  input[23] = sc.directionBias.center
  input[24] = sc.directionBias.right
  input[25] = sc.avgDepth
  input[26] = sc.predictability
  // 27-31 score context (sign-corrected so "ahead" is always positive)
  input[27] = clamp((pointDiff * sideSign) / 3, -1, 1)
  input[28] = clamp((gameDiff * sideSign) / 6, -1, 1)
  input[29] = clamp((setDiff * sideSign) / 2, -1, 1)
  input[30] = score.pressurePoint ? 1 : 0
  input[31] = score.server === ourSide ? 1 : 0
  // 32-33 misc
  input[32] = clamp(rallyLength / 20, 0, 1)
  input[33] = 1 // constant bias

  void COURT
  return input
}
