/**
 * ============================================================================
 * SKILL CATALOG
 * ============================================================================
 * The base library of shots every agent can draw from, plus helpers for the
 * "skill invention" system where high-creativity agents generate brand new
 * trick shots at runtime by recombining and exaggerating base shot parameters.
 * ============================================================================
 */

import type { SkillDefinition, SkillInstance } from "../types"

export const BASE_SKILLS: SkillDefinition[] = [
  // -- groundstrokes -------------------------------------------------------
  {
    id: "flat_drive",
    name: "Flat Drive",
    category: "groundstroke",
    description: "A penetrating flat groundstroke with pace and minimal margin.",
    power: 0.85,
    accuracy: 0.78,
    spin: 0.05,
    cost: 0.02,
    risk: 0.22,
    unlockAt: 0,
  },
  {
    id: "topspin_rally",
    name: "Topspin Rally Ball",
    category: "groundstroke",
    description: "Heavy topspin shot that clears the net with margin and dips in.",
    power: 0.6,
    accuracy: 0.9,
    spin: 0.7,
    cost: 0.018,
    risk: 0.08,
    unlockAt: 0,
  },
  {
    id: "inside_out",
    name: "Inside-Out Forehand",
    category: "groundstroke",
    description: "Runs around the backhand to crack a cross-court forehand.",
    power: 0.82,
    accuracy: 0.72,
    spin: 0.35,
    cost: 0.03,
    risk: 0.28,
    unlockAt: 0.25,
  },
  // -- serves --------------------------------------------------------------
  {
    id: "flat_serve",
    name: "Flat Serve",
    category: "serve",
    description: "Maximum-pace first serve aimed at the lines.",
    power: 0.95,
    accuracy: 0.6,
    spin: 0.0,
    cost: 0.04,
    risk: 0.35,
    unlockAt: 0,
  },
  {
    id: "kick_serve",
    name: "Kick Serve",
    category: "serve",
    description: "Heavy topspin serve that bounces high and safe.",
    power: 0.62,
    accuracy: 0.85,
    spin: 0.8,
    cost: 0.03,
    risk: 0.12,
    unlockAt: 0.2,
  },
  {
    id: "slice_serve",
    name: "Slice Serve",
    category: "serve",
    description: "Curving slice serve that pulls the returner wide.",
    power: 0.7,
    accuracy: 0.8,
    spin: -0.6,
    cost: 0.03,
    risk: 0.18,
    unlockAt: 0.3,
  },
  // -- defensive -----------------------------------------------------------
  {
    id: "slice_defense",
    name: "Defensive Slice",
    category: "defensive",
    description: "Low skidding slice used to reset the point under pressure.",
    power: 0.4,
    accuracy: 0.92,
    spin: -0.7,
    cost: 0.015,
    risk: 0.06,
    unlockAt: 0,
  },
  {
    id: "lob",
    name: "Defensive Lob",
    category: "defensive",
    description: "High floating ball to buy time and push opponent back.",
    power: 0.45,
    accuracy: 0.82,
    spin: 0.3,
    cost: 0.02,
    risk: 0.16,
    unlockAt: 0.15,
  },
  // -- trick / aggressive --------------------------------------------------
  {
    id: "drop_shot",
    name: "Drop Shot",
    category: "trick",
    description: "Delicate touch shot that dies just over the net.",
    power: 0.25,
    accuracy: 0.7,
    spin: -0.5,
    cost: 0.025,
    risk: 0.34,
    unlockAt: 0.35,
  },
  {
    id: "tweener",
    name: "Tweener",
    category: "trick",
    description: "Between-the-legs trick shot pulled off on the run.",
    power: 0.55,
    accuracy: 0.45,
    spin: 0.2,
    cost: 0.05,
    risk: 0.6,
    unlockAt: 0.6,
  },
  {
    id: "swinging_volley",
    name: "Swinging Volley",
    category: "trick",
    description: "Aggressive out-of-the-air swing to steal time.",
    power: 0.8,
    accuracy: 0.62,
    spin: 0.4,
    cost: 0.035,
    risk: 0.4,
    unlockAt: 0.5,
  },
  // -- movement / mental are virtual (no shot) but kept for completeness ---
]

export const SKILL_INDEX: Record<string, SkillDefinition> = Object.fromEntries(
  BASE_SKILLS.map((s) => [s.id, s]),
)

/** Build fresh skill instances (with zero mastery) for a new agent. */
export function freshSkillSet(affinity: number[]): SkillInstance[] {
  return BASE_SKILLS.map((def, i) => ({
    def,
    mastery: 0.2 + (affinity[i] ?? 0.5) * 0.3,
    uses: 0,
    winners: 0,
    errors: 0,
  }))
}

let inventedCounter = 0

/**
 * Invent a brand-new trick shot by recombining two base shots and exaggerating
 * a parameter. High-creativity agents call this during matches to expand their
 * arsenal — satisfying the "invents new, hard moves" requirement.
 */
export function inventSkill(parentA: SkillDefinition, parentB: SkillDefinition, rng: () => number): SkillDefinition {
  inventedCounter++
  const blend = (a: number, b: number) => a * 0.5 + b * 0.5
  const exaggerate = 1 + rng() * 0.4
  const adjectives = ["Phantom", "Comet", "Mirage", "Vortex", "Eclipse", "Specter", "Tempest", "Quantum"]
  const nouns = ["Strike", "Curl", "Snap", "Slash", "Arc", "Whip", "Bolt", "Fang"]
  const name = `${adjectives[Math.floor(rng() * adjectives.length)]} ${nouns[Math.floor(rng() * nouns.length)]}`
  return {
    id: `invented_${inventedCounter}_${Math.floor(rng() * 1e6)}`,
    name,
    category: "trick",
    description: `A self-invented shot fusing ${parentA.name} and ${parentB.name}.`,
    power: Math.min(1, blend(parentA.power, parentB.power) * exaggerate),
    accuracy: Math.max(0.3, blend(parentA.accuracy, parentB.accuracy) / exaggerate),
    spin: blend(parentA.spin, parentB.spin) * (rng() > 0.5 ? 1 : -1),
    cost: blend(parentA.cost, parentB.cost) * 1.3,
    risk: Math.min(0.85, blend(parentA.risk, parentB.risk) * exaggerate),
    unlockAt: 0.55,
    invented: true,
  }
}
