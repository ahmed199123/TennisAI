/**
 * ============================================================================
 * CORE TYPE DEFINITIONS
 * ============================================================================
 * Central type registry for the entire AI Tennis simulation. Every subsystem
 * (neural, genetics, physics, agent, match, sim) imports from here so that the
 * data contracts stay consistent across the whole codebase.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Neural network
// ---------------------------------------------------------------------------

export type ActivationName = "relu" | "leakyRelu" | "tanh" | "sigmoid" | "linear" | "gelu"

export interface LayerConfig {
  /** number of input features for this layer */
  inputs: number
  /** number of neurons (outputs) for this layer */
  outputs: number
  /** activation applied to the layer output */
  activation: ActivationName
}

export interface SerializedLayer {
  inputs: number
  outputs: number
  activation: ActivationName
  /** flat row-major weight matrix of size outputs * inputs */
  weights: number[]
  /** bias vector of size outputs */
  biases: number[]
}

export interface SerializedNetwork {
  architecture: number[]
  activations: ActivationName[]
  layers: SerializedLayer[]
}

/** Snapshot of a single forward pass for the debugger. */
export interface ForwardTrace {
  /** activations for every layer including the input layer at index 0 */
  layerActivations: number[][]
  /** pre-activation values (z) for every computed layer */
  layerPreActivations: number[][]
  /** wall-clock micro timing of the pass in ms */
  elapsedMs: number
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

/**
 * Personality traits live in the [0,1] range. They bias how the raw neural
 * output is translated into concrete actions and how the agent learns.
 */
export interface Personality {
  aggression: number // how hard / how often it attacks
  patience: number // willingness to play long rallies
  risk: number // tendency to attempt low-percentage winners
  creativity: number // likelihood of inventing / using trick shots
  composure: number // resistance to pressure (break/set points)
  stamina: number // how slowly fatigue accumulates
  footwork: number // movement quality / court coverage
  anticipation: number // weight given to the predictor module
  adaptability: number // how fast the scouting model shifts strategy
  consistency: number // reduces unforced error noise
}

export type PersonalityTrait = keyof Personality

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export type SkillCategory = "groundstroke" | "serve" | "defensive" | "trick" | "movement" | "mental"

export interface SkillDefinition {
  id: string
  name: string
  category: SkillCategory
  description: string
  /** base power multiplier applied to the shot */
  power: number
  /** base accuracy [0,1] */
  accuracy: number
  /** spin imparted, negative = slice, positive = topspin */
  spin: number
  /** energy cost per use */
  cost: number
  /** risk of unforced error [0,1] */
  risk: number
  /** minimum skill rating required to attempt it */
  unlockAt: number
  /** true for skills the agent invented itself */
  invented?: boolean
}

export interface SkillInstance {
  def: SkillDefinition
  /** mastery the agent has with this skill [0,1] */
  mastery: number
  /** times the skill has been used */
  uses: number
  /** times it produced a winner */
  winners: number
  /** times it produced an error */
  errors: number
}

// ---------------------------------------------------------------------------
// Genetics
// ---------------------------------------------------------------------------

export interface Genome {
  /** flat list of every network weight + bias, gene by gene */
  weights: number[]
  /** personality genes in fixed order matching PERSONALITY_KEYS */
  personality: number[]
  /** skill affinity genes, one per base skill id */
  skillAffinity: number[]
  /** mutation rate this individual carries (self-adapting) */
  mutationRate: number
}

export interface EvolutionConfig {
  populationSize: number
  eliteCount: number
  mutationRate: number
  mutationScale: number
  crossoverRate: number
  tournamentSize: number
}

// ---------------------------------------------------------------------------
// Scouting / opponent modelling
// ---------------------------------------------------------------------------

export interface ShotRecord {
  /** normalized contact x on the court [-1,1] */
  fromX: number
  fromY: number
  /** normalized target landing point */
  toX: number
  toY: number
  power: number
  spin: number
  skillId: string
  /** which side of court the receiver had to move to */
  direction: "left" | "center" | "right"
  /** depth of the shot 0 (short) -> 1 (deep) */
  depth: number
  serve: boolean
}

export interface ScoutingTendencies {
  /** probability distribution over shot directions */
  directionBias: { left: number; center: number; right: number }
  /** average shot depth */
  avgDepth: number
  /** average power */
  avgPower: number
  /** preferred skills by frequency */
  favoriteSkills: { skillId: string; freq: number }[]
  /** how predictable the opponent is [0,1], 1 = totally predictable */
  predictability: number
  /** observed serve placement bias */
  serveBias: { left: number; center: number; right: number }
  /** how much pressure rattles them (error rate under pressure) */
  pressureWeakness: number
  /** total observations backing this report */
  sampleSize: number
}

// ---------------------------------------------------------------------------
// Match / physics
// ---------------------------------------------------------------------------

export type Side = "left" | "right"

export interface BallState {
  pos: Vec2
  vel: Vec2
  /** height above the court surface */
  height: number
  /** vertical velocity for the bounce arc */
  vh: number
  spin: number
  /** which side last hit it */
  lastHitBy: Side | null
  /** how many times it bounced on the current side */
  bounces: number
  inPlay: boolean
}

export interface PlayerMatchState {
  side: Side
  pos: Vec2
  vel: Vec2
  stamina: number
  /** current swing windup timer */
  swingTimer: number
  lastSkillId: string | null
  /** momentum [-1,1], confidence swing */
  momentum: number
}

export interface ScoreState {
  /** points within current game, tennis style index 0-3 then advantage */
  points: [number, number]
  games: [number, number]
  sets: [number, number]
  /** completed set scores */
  setHistory: [number, number][]
  server: Side
  /** is the current point a break/set/match point */
  pressurePoint: boolean
  matchOver: boolean
  winner: Side | null
}

export type MatchPhase = "serve" | "rally" | "pointOver" | "matchOver"

// ---------------------------------------------------------------------------
// Decision logging (debugger)
// ---------------------------------------------------------------------------

export interface DecisionLogEntry {
  tick: number
  side: Side
  /** human readable summary of the action */
  action: string
  skillId: string | null
  /** the network's raw output vector */
  rawOutput: number[]
  /** predicted opponent target before the shot */
  prediction: Vec2 | null
  /** confidence of the decision [0,1] */
  confidence: number
  /** reasoning tags surfaced to the UI */
  reasons: string[]
}

// ---------------------------------------------------------------------------
// Match statistics
// ---------------------------------------------------------------------------

export interface MatchStats {
  winners: [number, number]
  unforcedErrors: [number, number]
  aces: [number, number]
  rallies: number
  longestRally: number
  totalShots: [number, number]
  distanceCovered: [number, number]
  predictionsCorrect: [number, number]
  predictionsTotal: [number, number]
  skillUsage: [Record<string, number>, Record<string, number>]
}
