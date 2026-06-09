/**
 * ============================================================================
 * AGENT — a complete tennis-playing AI
 * ============================================================================
 * Bundles together:
 *   - a deep neural network (the "brain")
 *   - a personality trait vector
 *   - a learnable skill arsenal (incl. self-invented shots)
 *   - a live scouting model of the current opponent
 *   - a prediction/anticipation module
 *   - lifetime + per-match statistics
 *
 * The agent is fully serializable so models can be saved, named, cloned,
 * mutated, and entered into tournaments. It also exposes a rich debug snapshot.
 * ============================================================================
 */

import type {
  ForwardTrace,
  Genome,
  Personality,
  SkillInstance,
  Vec2,
} from "../types"
import { NeuralNetwork, makeRng } from "../neural/network"
import { defaultActivations, defaultArchitecture } from "../neural/architecture"
import {
  PERSONALITY_KEYS,
  genesToPersonality,
  personalityToGenes,
  randomPersonality,
} from "./personality"
import { BASE_SKILLS, freshSkillSet, inventSkill } from "./skills"
import { ScoutingModel } from "./scouting"
import { Predictor } from "./predictor"

export interface AgentRecord {
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  gamesWon: number
  gamesLost: number
  matchesPlayed: number
}

export interface AgentMeta {
  id: string
  name: string
  archetypeId: string
  color: string
  generation: number
  /** lineage / parent ids for the family tree */
  parents: string[]
  createdAt: number
  /** ELO-style rating maintained by the league */
  rating: number
}

export interface SerializedAgent {
  meta: AgentMeta
  personality: Personality
  network: ReturnType<NeuralNetwork["serialize"]>
  skills: { defId: string; mastery: number; uses: number; winners: number; errors: number; invented?: boolean }[]
  invented: SkillInstance["def"][]
  record: AgentRecord
}

let agentCounter = 0
function nextAgentId(): string {
  agentCounter++
  return `agent_${Date.now().toString(36)}_${agentCounter}`
}

export class Agent {
  meta: AgentMeta
  personality: Personality
  network: NeuralNetwork
  skills: SkillInstance[]
  scouting: ScoutingModel
  predictor: Predictor
  record: AgentRecord

  // --- volatile per-tick debug state -----------------------------------
  lastTrace: ForwardTrace | null = null
  lastOutput: number[] = []
  lastPrediction: Vec2 | null = null
  lastConfidence = 0
  lastReasons: string[] = []
  private rng: () => number

  constructor(opts: {
    meta: AgentMeta
    personality: Personality
    network: NeuralNetwork
    skills?: SkillInstance[]
    record?: AgentRecord
    seed?: number
  }) {
    this.meta = opts.meta
    this.personality = opts.personality
    this.network = opts.network
    this.skills = opts.skills ?? freshSkillSet(BASE_SKILLS.map(() => 0.5))
    this.scouting = new ScoutingModel(this.personality.adaptability)
    this.predictor = new Predictor(this.personality.anticipation)
    this.record = opts.record ?? {
      wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, matchesPlayed: 0,
    }
    this.rng = makeRng(opts.seed ?? Math.floor(Math.random() * 1e9))
  }

  // -----------------------------------------------------------------------
  // Factory helpers
  // -----------------------------------------------------------------------

  static create(opts: {
    name: string
    archetypeId: string
    color: string
    personality: Personality
    seed?: number
    generation?: number
    parents?: string[]
  }): Agent {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9)
    const network = NeuralNetwork.create(defaultArchitecture(), defaultActivations(), seed)
    const meta: AgentMeta = {
      id: nextAgentId(),
      name: opts.name,
      archetypeId: opts.archetypeId,
      color: opts.color,
      generation: opts.generation ?? 0,
      parents: opts.parents ?? [],
      createdAt: Date.now(),
      rating: 1200,
    }
    return new Agent({ meta, personality: opts.personality, network, seed })
  }

  static random(name: string, color: string, seed?: number): Agent {
    const s = seed ?? Math.floor(Math.random() * 1e9)
    const rng = makeRng(s)
    return Agent.create({
      name,
      archetypeId: "custom",
      color,
      personality: randomPersonality(rng),
      seed: s,
    })
  }

  // -----------------------------------------------------------------------
  // Genome interface (for the genetics engine)
  // -----------------------------------------------------------------------

  toGenome(): Genome {
    return {
      weights: this.network.toGenes(),
      personality: personalityToGenes(this.personality),
      skillAffinity: this.skills.map((s) => s.mastery),
      mutationRate: 0.08,
    }
  }

  static fromGenome(
    genome: Genome,
    base: { name: string; color: string; generation: number; parents: string[]; archetypeId: string },
  ): Agent {
    const network = new NeuralNetwork(defaultArchitecture(), defaultActivations())
    network.loadGenes(genome.weights)
    const personality = genesToPersonality(genome.personality)
    const meta: AgentMeta = {
      id: nextAgentId(),
      name: base.name,
      archetypeId: base.archetypeId,
      color: base.color,
      generation: base.generation,
      parents: base.parents,
      createdAt: Date.now(),
      rating: 1200,
    }
    const skills = freshSkillSet(genome.skillAffinity)
    return new Agent({ meta, personality, network, skills })
  }

  // -----------------------------------------------------------------------
  // Decision making
  // -----------------------------------------------------------------------

  /** Run a traced forward pass and cache debug state. Returns raw output. */
  think(input: number[]): number[] {
    const { output, trace } = this.network.forwardTrace(input)
    this.lastTrace = trace
    this.lastOutput = output
    return output
  }

  /**
   * Choose a skill given the network's skill-selection signal, the agent's
   * arsenal, available energy, and creativity (which may invent a new shot).
   */
  selectSkill(skillSignal: number, trickDesire: number, energy: number, skillRating: number): SkillInstance {
    // Creativity-driven invention: occasionally fabricate a new trick shot.
    if (
      trickDesire > 0.7 &&
      this.personality.creativity > 0.6 &&
      this.rng() < this.personality.creativity * 0.04 &&
      energy > 0.3
    ) {
      const pool = this.skills.filter((s) => s.def.category === "trick" || s.def.category === "groundstroke")
      if (pool.length >= 2) {
        const a = pool[Math.floor(this.rng() * pool.length)].def
        const b = pool[Math.floor(this.rng() * pool.length)].def
        const def = inventSkill(a, b, this.rng)
        const instance: SkillInstance = { def, mastery: 0.3, uses: 0, winners: 0, errors: 0 }
        this.skills.push(instance)
        this.lastReasons.push(`Invented new shot: ${def.name}`)
        return instance
      }
    }

    // Otherwise pick from unlocked skills weighted by the signal + mastery.
    const usable = this.skills.filter(
      (s) => s.def.unlockAt <= skillRating && s.def.cost <= energy + 0.05,
    )
    const candidates = usable.length ? usable : this.skills
    // map signal [0,1] across the candidate list, biased by mastery & trick desire
    const scored = candidates.map((s) => {
      let score = s.mastery
      if (s.def.category === "trick") score += trickDesire * 0.5
      score += (1 - Math.abs(skillSignal - s.mastery)) * 0.3
      return { s, score: score + this.rng() * 0.15 }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0].s
  }

  /** Average mastery across the arsenal — a rough skill-rating proxy [0,1]. */
  get skillRating(): number {
    if (!this.skills.length) return 0
    return this.skills.reduce((a, s) => a + s.mastery, 0) / this.skills.length
  }

  /** Overall power index used for matchmaking display [0,100]. */
  get overall(): number {
    const p = this.personality
    const traitAvg = PERSONALITY_KEYS.reduce((a, k) => a + p[k], 0) / PERSONALITY_KEYS.length
    return Math.round((traitAvg * 0.55 + this.skillRating * 0.45) * 100)
  }

  // -----------------------------------------------------------------------
  // Learning hooks (called by the match engine after each point)
  // -----------------------------------------------------------------------

  /** Reinforce a skill's mastery based on outcome. */
  reinforceSkill(skillId: string, outcome: "winner" | "error" | "neutral") {
    const s = this.skills.find((x) => x.def.id === skillId)
    if (!s) return
    s.uses++
    const lr = 0.02 + this.personality.consistency * 0.03
    if (outcome === "winner") {
      s.winners++
      s.mastery = Math.min(1, s.mastery + lr)
    } else if (outcome === "error") {
      s.errors++
      s.mastery = Math.max(0.1, s.mastery - lr * 0.7)
    } else {
      s.mastery = Math.min(1, s.mastery + lr * 0.2)
    }
  }

  /** Reset volatile match-scoped state (scouting + predictor) for a new match. */
  resetForMatch() {
    this.scouting = new ScoutingModel(this.personality.adaptability)
    this.predictor = new Predictor(this.personality.anticipation)
    this.lastTrace = null
    this.lastOutput = []
    this.lastPrediction = null
    this.lastReasons = []
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  serialize(): SerializedAgent {
    return {
      meta: { ...this.meta },
      personality: { ...this.personality },
      network: this.network.serialize(),
      skills: this.skills
        .filter((s) => !s.def.invented)
        .map((s) => ({
          defId: s.def.id,
          mastery: s.mastery,
          uses: s.uses,
          winners: s.winners,
          errors: s.errors,
        })),
      invented: this.skills.filter((s) => s.def.invented).map((s) => s.def),
      record: { ...this.record },
    }
  }

  static deserialize(data: SerializedAgent): Agent {
    const network = NeuralNetwork.deserialize(data.network)
    const skills: SkillInstance[] = data.skills.map((s) => {
      const def = BASE_SKILLS.find((d) => d.id === s.defId) ?? BASE_SKILLS[0]
      return { def, mastery: s.mastery, uses: s.uses, winners: s.winners, errors: s.errors }
    })
    for (const def of data.invented ?? []) {
      skills.push({ def, mastery: 0.4, uses: 0, winners: 0, errors: 0 })
    }
    return new Agent({
      meta: { ...data.meta },
      personality: { ...data.personality },
      network,
      skills,
      record: { ...data.record },
    })
  }

  clone(newName?: string): Agent {
    const data = this.serialize()
    const agent = Agent.deserialize(data)
    agent.meta.id = nextAgentId()
    if (newName) agent.meta.name = newName
    return agent
  }
}
