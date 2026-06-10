/**
 * ============================================================================
 * MATCH ENGINE — the simulation core
 * ============================================================================
 * Orchestrates a full point/game/set/match between two Agents. Every tick it:
 *
 *   1. Builds each relevant agent's perception vector.
 *   2. Runs a traced neural forward pass (the "decision").
 *   3. Translates the 11-d motor output into concrete movement + shot intent,
 *      filtered through personality and the chosen skill.
 *   4. Steps ball + player physics (flight, spin curve, bounce, net, bounds).
 *   5. Resolves points, updates the scoreboard, reinforces skills, and feeds
 *      the scouting + prediction models.
 *
 * It emits a rich stream of decision logs, shot events, and live statistics so
 * the debugger dashboard can show exactly what each brain is "thinking".
 * ============================================================================
 */

import type {
  BallState,
  PlayerMatchState,
  ScoreState,
  Side,
  Vec2,
  MatchPhase,
  DecisionLogEntry,
  MatchStats,
  ShotRecord,
  SkillInstance,
} from "../types"
import { Agent } from "../agent/agent"
import { buildPerception, type PerceptionContext } from "../agent/perception"
import type { Prediction } from "../agent/predictor"
import { OUTPUT_LABELS } from "../neural/architecture"
import { createScore, awardPoint, isTiebreak, type MatchFormat, DEFAULT_FORMAT } from "./scoring"
import {
  COURT,
  PHYSICS,
  baselineY,
  attackDirection,
  defendingHalf,
  dist,
  clamp,
  lerp,
  inBounds,
  laneOf,
} from "../physics/court"

// ---------------------------------------------------------------------------
// Public state container
// ---------------------------------------------------------------------------

export interface MatchState {
  phase: MatchPhase
  ball: BallState
  players: Record<Side, PlayerMatchState>
  score: ScoreState
  rallyLength: number
  tick: number
  /** the side that must strike the ball next (null while in flight to nobody) */
  awaiting: Side | null
  lastWinReason: string | null
}

export interface MatchConfig {
  format: MatchFormat
  /** deterministic seed for reproducible matches */
  seed: number
  /** speed multiplier applied to physics (1 = realtime) */
  speed: number
}

export function defaultMatchConfig(seed = 12345): MatchConfig {
  return { format: DEFAULT_FORMAT, seed, speed: 1 }
}

export interface PointOutcome {
  winner: Side
  reason: "winner" | "unforced-error" | "out" | "net" | "ace" | "double-fault"
  rallyLength: number
}

export interface EngineHooks {
  onDecision?: (entry: DecisionLogEntry) => void
  onPoint?: (outcome: PointOutcome, score: ScoreState) => void
  onMatchOver?: (winner: Side, score: ScoreState) => void
}

function emptyStats(): MatchStats {
  return {
    winners: [0, 0],
    unforcedErrors: [0, 0],
    aces: [0, 0],
    rallies: 0,
    longestRally: 0,
    totalShots: [0, 0],
    distanceCovered: [0, 0],
    predictionsCorrect: [0, 0],
    predictionsTotal: [0, 0],
    skillUsage: [{}, {}],
  }
}

function sideIdx(side: Side): 0 | 1 {
  return side === "left" ? 0 : 1
}

function otherSide(side: Side): Side {
  return side === "left" ? "right" : "left"
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class MatchEngine {
  left: Agent
  right: Agent
  config: MatchConfig
  state: MatchState
  stats: MatchStats
  hooks: EngineHooks

  /** rolling decision log (capped) */
  decisionLog: DecisionLogEntry[] = []
  private maxLog = 200

  /** per-side live prediction cache for the debugger */
  predictions: Record<Side, Prediction | null> = { left: null, right: null }
  /** per-side last selected skill for the debugger */
  lastSkill: Record<Side, SkillInstance | null> = { left: null, right: null }

  private rng: () => number
  private pointStartServer: Side
  private pendingPredictionTarget: Record<Side, Vec2 | null> = { left: null, right: null }

  constructor(left: Agent, right: Agent, config: MatchConfig, hooks: EngineHooks = {}) {
    this.left = left
    this.right = right
    this.config = config
    this.hooks = hooks
    this.stats = emptyStats()
    this.rng = mulberry(config.seed)
    left.resetForMatch()
    right.resetForMatch()
    this.pointStartServer = "left"
    this.state = this.freshState("left")
  }

  agentFor(side: Side): Agent {
    return side === "left" ? this.left : this.right
  }

  private freshState(server: Side): MatchState {
    const score = this.state?.score ?? createScore(server)
    return {
      phase: "serve",
      ball: this.idleBall(server),
      players: {
        left: this.freshPlayer("left"),
        right: this.freshPlayer("right"),
      },
      score: { ...score, server },
      rallyLength: 0,
      tick: this.state?.tick ?? 0,
      awaiting: server,
      lastWinReason: null,
    }
  }

  private freshPlayer(side: Side): PlayerMatchState {
    return {
      side,
      pos: { x: 0.5, y: baselineY(side) },
      vel: { x: 0, y: 0 },
      stamina: 1,
      swingTimer: 0,
      lastSkillId: null,
      momentum: this.state?.players?.[side]?.momentum ?? 0,
    }
  }

  private idleBall(server: Side): BallState {
    return {
      pos: { x: 0.5, y: baselineY(server) },
      vel: { x: 0, y: 0 },
      height: 0,
      vh: 0,
      spin: 0,
      lastHitBy: null,
      bounces: 0,
      inPlay: false,
    }
  }

  // -----------------------------------------------------------------------
  // Main tick
  // -----------------------------------------------------------------------

  /** Advance one physics tick. Returns the (mutated) state. */
  step(): MatchState {
    const s = this.state
    s.tick++

    if (s.phase === "matchOver") return s

    if (s.phase === "serve") {
      this.doServe()
    } else if (s.phase === "rally") {
      this.updatePlayers()
      this.updateBall()
      this.tryStrike()
    } else if (s.phase === "pointOver") {
      // handled externally via nextPoint(); stay parked.
    }
    return s
  }

  // -----------------------------------------------------------------------
  // Serve
  // -----------------------------------------------------------------------

  private doServe() {
    const server = this.state.score.server
    const agent = this.agentFor(server)
    const opp = this.agentFor(otherSide(server))

    const ctx = this.contextFor(server)
    const output = agent.think(buildPerception(agent, ctx))
    this.recordDecision(server, output, "serve")

    const skillRating = agent.skillRating
    const energy = this.state.players[server].stamina
    const skill = agent.selectSkill(output[8], output[9], energy, skillRating)
    this.lastSkill[server] = skill

    // Serve placement: bias toward lines via personality risk + neural targetX.
    const targetX = clamp(0.5 + output[3] * 0.45, COURT.sideline, 1 - COURT.sideline)
    const depthY = serveDepth(server)
    const power = clamp(output[5] * 0.6 + skill.def.power * 0.4 + agent.personality.aggression * 0.1, 0.2, 1)

    this.launch(server, { x: targetX, y: depthY }, power, skill.def.spin, skill, true)
    this.state.phase = "rally"
    this.state.rallyLength = 1
    this.state.awaiting = otherSide(server)
    this.stats.totalShots[sideIdx(server)]++
    bumpSkill(this.stats, server, skill.def.id)

    // Opponent forms a prediction of where the serve is going.
    this.refreshPrediction(otherSide(server))
    void opp
  }

  // -----------------------------------------------------------------------
  // Player movement + decisions
  // -----------------------------------------------------------------------

  private updatePlayers() {
    for (const side of ["left", "right"] as Side[]) {
      const agent = this.agentFor(side)
      const player = this.state.players[side]
      const ctx = this.contextFor(side)
      const output = agent.think(buildPerception(agent, ctx))

      // Movement intent from outputs 0,1 — but anticipation nudges toward the
      // predicted ball target when this side is the receiver.
      let mx = output[0]
      let my = output[1]
      const pred = this.predictions[side]
      if (this.state.awaiting === side && pred) {
        const toPredX = (pred.target.x - player.pos.x)
        const toPredY = (pred.target.y - player.pos.y)
        const w = agent.personality.anticipation * pred.confidence
        mx = lerp(mx, Math.sign(toPredX) * Math.min(1, Math.abs(toPredX) * 6), w)
        my = lerp(my, Math.sign(toPredY) * Math.min(1, Math.abs(toPredY) * 6), w)
      }

      const speed = PHYSICS.playerSpeed * (0.6 + agent.personality.footwork * 0.6) *
        (0.5 + player.stamina * 0.5) * this.config.speed
      const mag = Math.hypot(mx, my) || 1
      const vx = (mx / mag) * speed
      const vy = (my / mag) * speed

      player.vel = { x: vx, y: vy }
      player.pos.x = clamp(player.pos.x + vx, COURT.sideline - 0.02, 1 - COURT.sideline + 0.02)
      const [loY, hiY] = defendingHalf(side)
      player.pos.y = clamp(player.pos.y + vy, loY - 0.04, hiY + 0.04)

      // stamina: drain by movement, regen when near-still.
      const moved = Math.hypot(vx, vy)
      const drain = moved * PHYSICS.staminaMoveCost / Math.max(0.2, agent.personality.stamina)
      player.stamina = clamp(player.stamina - drain + PHYSICS.staminaRegen * (1 - moved / speed), 0, 1)
      this.stats.distanceCovered[sideIdx(side)] += moved
      if (player.swingTimer > 0) player.swingTimer--
    }
  }

  // -----------------------------------------------------------------------
  // Ball physics
  // -----------------------------------------------------------------------

  private updateBall() {
    const ball = this.state.ball
    if (!ball.inPlay) return

    // spin curve (lateral drift) + horizontal travel
    ball.vel.x += ball.spin * PHYSICS.spinCurve
    ball.pos.x += ball.vel.x * this.config.speed
    ball.pos.y += ball.vel.y * this.config.speed

    // vertical arc
    ball.vh -= PHYSICS.gravity * this.config.speed
    ball.height += ball.vh * this.config.speed

    // drag
    ball.vel.x *= PHYSICS.drag
    ball.vel.y *= PHYSICS.drag

    // net crossing check
    if (this.crossedNet()) {
      if (ball.height < netHeightAt()) {
        this.endPoint(otherSide(ball.lastHitBy ?? "left"), "net")
        return
      }
    }

    // bounce
    if (ball.height <= 0) {
      ball.height = 0
      this.bounce()
    }
  }

  private crossedNet(): boolean {
    const ball = this.state.ball
    const prevY = ball.pos.y - ball.vel.y * this.config.speed
    return (prevY < COURT.net && ball.pos.y >= COURT.net) ||
      (prevY > COURT.net && ball.pos.y <= COURT.net)
  }

  private bounce() {
    const ball = this.state.ball
    if (!inBounds(ball.pos)) {
      this.endPoint(otherSide(ball.lastHitBy ?? "left"), "out")
      return
    }
    ball.bounces++
    if (ball.bounces >= 2) {
      // double bounce: the side that should have returned loses.
      const loser = this.state.awaiting ?? otherSide(ball.lastHitBy ?? "left")
      this.endPoint(otherSide(loser), ball.lastHitBy === otherSide(loser) ? "winner" : "winner")
      return
    }
    ball.vh = Math.abs(ball.vh) * PHYSICS.restitution
    ball.height = 0.001
    ball.vel.x *= 0.9
    ball.vel.y *= 0.9
  }

  // -----------------------------------------------------------------------
  // Striking the ball
  // -----------------------------------------------------------------------

  private tryStrike() {
    const ball = this.state.ball
    if (!ball.inPlay) return
    const receiver = this.state.awaiting
    if (!receiver) return

    // Only the receiver can strike, and only when the ball is on their half,
    // reachable, and low enough to make contact.
    const onHalf = receiver === "left" ? ball.pos.y <= COURT.net : ball.pos.y >= COURT.net
    if (!onHalf) return

    const player = this.state.players[receiver]
    const reach = PHYSICS.reach * (0.7 + this.agentFor(receiver).personality.footwork * 0.6)
    const d = dist(player.pos, ball.pos)
    if (d > reach || ball.height > 0.25) return

    // Contact! Record prediction accuracy for the receiver.
    const predTarget = this.pendingPredictionTarget[receiver]
    if (predTarget) {
      this.agentFor(receiver).predictor.score(predTarget, { ...ball.pos })
      this.stats.predictionsTotal[sideIdx(receiver)]++
      if (dist(predTarget, ball.pos) < 0.18) this.stats.predictionsCorrect[sideIdx(receiver)]++
    }

    const agent = this.agentFor(receiver)
    const ctx = this.contextFor(receiver)
    const output = agent.think(buildPerception(agent, ctx))
    this.recordDecision(receiver, output, "rally")

    const skill = agent.selectSkill(output[8], output[9], player.stamina, agent.skillRating)
    this.lastSkill[receiver] = skill

    // shot target from neural outputs, sign-corrected toward opponent half.
    const dir = attackDirection(receiver)
    const targetX = clamp(0.5 + output[3] * 0.48, COURT.sideline, 1 - COURT.sideline)
    const depth = clamp(0.55 + output[4] * 0.4, 0.5, 0.96)
    const targetY = receiver === "left" ? lerp(COURT.net, 1, depth) : lerp(COURT.net, 0, depth)

    // Did the shot succeed, or is it an unforced error? Driven by skill
    // accuracy, distance stretched, stamina, focus, consistency, pressure.
    const stretch = clamp(d / reach, 0, 1)
    const focus = output[10]
    const pressurePenalty = this.state.score.pressurePoint
      ? (1 - agent.personality.composure) * 0.25
      : 0
    const errorChance = clamp(
      (1 - skill.def.accuracy) * 0.6 +
        skill.def.risk * (0.4 + output[7] * 0.4) +
        stretch * 0.2 +
        (1 - player.stamina) * 0.15 +
        pressurePenalty -
        agent.personality.consistency * 0.2 -
        focus * 0.12 -
        skill.mastery * 0.15,
      0.01,
      0.95,
    )

    this.stats.totalShots[sideIdx(receiver)]++
    bumpSkill(this.stats, receiver, skill.def.id)
    player.swingTimer = 8
    player.lastSkillId = skill.def.id

    // Opponent observes our shot for scouting.
    const record: ShotRecord = {
      fromX: player.pos.x,
      fromY: player.pos.y,
      toX: targetX,
      toY: targetY,
      power: output[5],
      spin: skill.def.spin,
      skillId: skill.def.id,
      direction: laneOf(targetX),
      depth,
      serve: false,
    }
    this.agentFor(otherSide(receiver)).scouting.observe(
      record,
      this.state.score.pressurePoint,
      this.rng() < errorChance,
    )

    if (this.rng() < errorChance) {
      // Unforced error.
      agent.reinforceSkill(skill.def.id, "error")
      this.stats.unforcedErrors[sideIdx(receiver)]++
      this.endPoint(otherSide(receiver), "unforced-error")
      return
    }

    const power = clamp(output[5] * 0.7 + skill.def.power * 0.3, 0.2, 1)
    this.launch(receiver, { x: targetX, y: targetY }, power, skill.def.spin, skill, false)
    this.state.rallyLength++
    this.state.awaiting = otherSide(receiver)
    agent.reinforceSkill(skill.def.id, "neutral")

    // The new receiver forms a prediction for the incoming shot.
    this.refreshPrediction(otherSide(receiver))
  }

  // -----------------------------------------------------------------------
  // Launch a ball from a player toward a target
  // -----------------------------------------------------------------------

  private launch(side: Side, target: Vec2, power: number, spin: number, skill: SkillInstance, serve: boolean) {
    const ball = this.state.ball
    const from = this.state.players[side].pos
    const dx = target.x - from.x
    const dy = target.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const speed = clamp(PHYSICS.maxBallSpeed * (0.4 + power * 0.6), 0.01, PHYSICS.maxBallSpeed)

    ball.pos = { x: from.x, y: from.y }
    ball.vel = { x: (dx / len) * speed, y: (dy / len) * speed }
    ball.height = serve ? 0.08 : 0.05
    ball.vh = (serve ? 0.012 : 0.016) + power * 0.006 - Math.abs(spin) * 0.004
    ball.spin = spin
    ball.lastHitBy = side
    ball.bounces = 0
    ball.inPlay = true
    void skill
  }

  // -----------------------------------------------------------------------
  // Point / match resolution
  // -----------------------------------------------------------------------

  private endPoint(winner: Side, reason: PointOutcome["reason"]) {
    const s = this.state
    s.phase = "pointOver"
    s.ball.inPlay = false
    s.lastWinReason = reason

    // stats: winners / aces
    if (reason === "winner") this.stats.winners[sideIdx(winner)]++
    if (reason === "ace") {
      this.stats.aces[sideIdx(winner)]++
      this.stats.winners[sideIdx(winner)]++
    }
    this.stats.rallies++
    this.stats.longestRally = Math.max(this.stats.longestRally, s.rallyLength)

    // skill reinforcement for the point winner's last shot
    const winnerAgent = this.agentFor(winner)
    if (winnerAgent.skills.length && reason !== "out" && reason !== "net") {
      const last = this.state.players[winner].lastSkillId
      if (last) winnerAgent.reinforceSkill(last, "winner")
    }

    // momentum swing
    s.players[winner].momentum = clamp(s.players[winner].momentum + 0.12, -1, 1)
    s.players[otherSide(winner)].momentum = clamp(s.players[otherSide(winner)].momentum - 0.12, -1, 1)

    const result = awardPoint(s.score, winner, this.config.format)
    s.score = result.score

    if (result.gameWon) this.applyGameStats(result.gameWon)

    this.hooks.onPoint?.({ winner, reason, rallyLength: s.rallyLength }, s.score)

    if (result.matchWon) {
      s.phase = "matchOver"
      this.applyMatchResult(result.matchWon)
      this.hooks.onMatchOver?.(result.matchWon, s.score)
    }
  }

  private applyGameStats(winner: Side) {
    this.agentFor(winner).record.gamesWon++
    this.agentFor(otherSide(winner)).record.gamesLost++
  }

  private applyMatchResult(winner: Side) {
    const w = this.agentFor(winner)
    const l = this.agentFor(otherSide(winner))
    w.record.wins++
    l.record.losses++
    w.record.matchesPlayed++
    l.record.matchesPlayed++
    w.record.setsWon += this.state.score.sets[sideIdx(winner)]
    w.record.setsLost += this.state.score.sets[sideIdx(otherSide(winner))]
    l.record.setsWon += this.state.score.sets[sideIdx(otherSide(winner))]
    l.record.setsLost += this.state.score.sets[sideIdx(winner)]
  }

  /** Reset positions and start the next point. Call after phase === pointOver. */
  nextPoint() {
    if (this.state.phase === "matchOver") return
    const server = this.state.score.server
    const score = this.state.score
    const momentum = {
      left: this.state.players.left.momentum,
      right: this.state.players.right.momentum,
    }
    this.state = this.freshState(server)
    this.state.score = score
    this.state.players.left.momentum = momentum.left
    this.state.players.right.momentum = momentum.right
    this.pointStartServer = server
  }

  isOver(): boolean {
    return this.state.phase === "matchOver" || this.state.score.matchOver
  }

  // -----------------------------------------------------------------------
  // Helpers: perception context, prediction, logging
  // -----------------------------------------------------------------------

  private contextFor(side: Side): PerceptionContext {
    const self = this.state.players[side]
    const opp = this.state.players[otherSide(side)]
    return {
      self,
      opp,
      ball: this.state.ball,
      score: this.state.score,
      ourSide: side,
      rallyLength: this.state.rallyLength,
      prediction: this.predictions[side]
        ? { target: this.predictions[side]!.target, confidence: this.predictions[side]!.confidence }
        : null,
    }
  }

  private refreshPrediction(side: Side) {
    const agent = this.agentFor(side)
    const self = this.state.players[side]
    const opp = this.state.players[otherSide(side)]
    const pred = agent.predictor.predict(self, opp, this.state.ball, agent.scouting, side)
    this.predictions[side] = pred
    this.pendingPredictionTarget[side] = { ...pred.target }
    agent.lastPrediction = { ...pred.target }
    agent.lastConfidence = pred.confidence
  }

  private recordDecision(side: Side, output: number[], action: string) {
    const agent = this.agentFor(side)
    const reasons: string[] = [...agent.lastReasons]
    agent.lastReasons = []
    if (output[7] > 0.6) reasons.push("attacking")
    else if (output[7] < 0.3) reasons.push("rallying / resetting")
    if (output[9] > 0.7) reasons.push("seeking trick shot")
    if (this.state.score.pressurePoint) reasons.push("pressure point")
    if (this.predictions[side]) reasons.push(`anticipating ${laneOf(this.predictions[side]!.target.x)}`)

    const entry: DecisionLogEntry = {
      tick: this.state.tick,
      side,
      action: `${action}: ${OUTPUT_LABELS[2]}=${output[2].toFixed(2)} pow=${output[5].toFixed(2)}`,
      skillId: this.lastSkill[side]?.def.id ?? null,
      rawOutput: output.slice(),
      prediction: this.predictions[side]?.target ?? null,
      confidence: clamp(Math.abs(output[2]) * 0.5 + (this.predictions[side]?.confidence ?? 0) * 0.5, 0, 1),
      reasons,
    }
    this.decisionLog.push(entry)
    if (this.decisionLog.length > this.maxLog) this.decisionLog.shift()
    this.hooks.onDecision?.(entry)
  }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Net height in the same vertical units the ball height uses. */
function netHeightAt(): number {
  return 0.03
}

/** Serve target depth (into the opposite service box-ish area). */
function serveDepth(server: Side): number {
  return server === "left" ? COURT.net + COURT.serviceLine : COURT.net - COURT.serviceLine
}

function bumpSkill(stats: MatchStats, side: Side, skillId: string) {
  const map = stats.skillUsage[sideIdx(side)]
  map[skillId] = (map[skillId] ?? 0) + 1
}

/** Local PRNG so the engine's stochastic resolution is reproducible. */
function mulberry(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// keep these referenced (used across the file / exported contract)
void isTiebreak
