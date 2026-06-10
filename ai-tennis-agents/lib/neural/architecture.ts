/**
 * ============================================================================
 * BRAIN ARCHITECTURE SPEC
 * ============================================================================
 * Defines the fixed input / output contract of every agent's neural network so
 * brains from different lineages remain cross-compatible (can play each other,
 * crossover, and be compared in the lab). The hidden topology is deliberately
 * deep and wide to satisfy the "very very complex network" requirement.
 * ============================================================================
 */

import type { ActivationName } from "../types"

// ---------------------------------------------------------------------------
// INPUT VECTOR LAYOUT (sensory perception of the court)
// Each index is documented so the debugger can label live neuron values.
// ---------------------------------------------------------------------------

export const INPUT_LABELS: string[] = [
  "self.x", // 0  own normalized x position
  "self.y", // 1  own normalized y position
  "self.vx", // 2  own x velocity
  "self.vy", // 3  own y velocity
  "self.stamina", // 4  remaining energy
  "self.momentum", // 5  confidence swing
  "ball.x", // 6  ball x
  "ball.y", // 7  ball y
  "ball.vx", // 8  ball x velocity
  "ball.vy", // 9  ball y velocity
  "ball.height", // 10 ball height above court
  "ball.spin", // 11 incoming spin
  "ball.dist", // 12 distance from self to ball
  "ball.timeToReach", // 13 estimated ticks until intercept
  "opp.x", // 14 opponent x
  "opp.y", // 15 opponent y
  "opp.vx", // 16 opponent x velocity
  "opp.vy", // 17 opponent y velocity
  "opp.dist", // 18 distance from opponent to ball
  "pred.x", // 19 predicted opponent next target x
  "pred.y", // 20 predicted opponent next target y
  "pred.conf", // 21 predictor confidence
  "scout.dirLeft", // 22 opponent left tendency
  "scout.dirCenter", // 23 opponent center tendency
  "scout.dirRight", // 24 opponent right tendency
  "scout.depth", // 25 opponent avg depth
  "scout.predictability", // 26 how readable opponent is
  "score.pointDiff", // 27 point differential in game
  "score.gameDiff", // 28 game differential in set
  "score.setDiff", // 29 set differential
  "score.pressure", // 30 1 if pressure point
  "score.serving", // 31 1 if serving
  "ctx.rallyLen", // 32 normalized rally length
  "ctx.bias", // 33 constant bias input (always 1)
]

export const INPUT_SIZE = INPUT_LABELS.length

// ---------------------------------------------------------------------------
// OUTPUT VECTOR LAYOUT (motor intentions)
// ---------------------------------------------------------------------------

export const OUTPUT_LABELS: string[] = [
  "move.x", // 0  desired x movement direction [-1,1]
  "move.y", // 1  desired y movement direction [-1,1]
  "shot.commit", // 2  willingness to swing now [0,1]
  "shot.targetX", // 3  intended landing x [-1,1]
  "shot.targetY", // 4  intended landing depth [0,1]
  "shot.power", // 5  shot power [0,1]
  "shot.spin", // 6  spin intent [-1,1]
  "shot.aggression", // 7  attack vs rally bias
  "skill.select", // 8  which skill bucket to draw from
  "skill.trick", // 9  desire to attempt a trick / invented shot
  "mental.focus", // 10 commit extra focus (reduces error, costs stamina)
]

export const OUTPUT_SIZE = OUTPUT_LABELS.length

// ---------------------------------------------------------------------------
// HIDDEN TOPOLOGY — deep MLP. Roughly ~30k parameters per brain.
// ---------------------------------------------------------------------------

export const HIDDEN_LAYERS = [96, 96, 64, 48]

export function defaultArchitecture(): number[] {
  return [INPUT_SIZE, ...HIDDEN_LAYERS, OUTPUT_SIZE]
}

export function defaultActivations(): ActivationName[] {
  // one activation per weight layer (architecture.length - 1)
  return ["gelu", "gelu", "tanh", "leakyRelu", "tanh"]
}
