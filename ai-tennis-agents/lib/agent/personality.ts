/**
 * ============================================================================
 * PERSONALITY SYSTEM
 * ============================================================================
 * Personality is a 10-dimensional trait vector. It biases how raw neural output
 * translates into actions, governs learning speed, and is itself an evolvable
 * gene block. This file holds the ordered key list, archetype presets, and the
 * conversion helpers between Personality objects and gene arrays.
 * ============================================================================
 */

import type { Personality, PersonalityTrait } from "../types"

/** Canonical ordering used everywhere personality is flattened to genes. */
export const PERSONALITY_KEYS: PersonalityTrait[] = [
  "aggression",
  "patience",
  "risk",
  "creativity",
  "composure",
  "stamina",
  "footwork",
  "anticipation",
  "adaptability",
  "consistency",
]

export const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  aggression: "Aggression",
  patience: "Patience",
  risk: "Risk Taking",
  creativity: "Creativity",
  composure: "Composure",
  stamina: "Stamina",
  footwork: "Footwork",
  anticipation: "Anticipation",
  adaptability: "Adaptability",
  consistency: "Consistency",
}

export const TRAIT_DESCRIPTIONS: Record<PersonalityTrait, string> = {
  aggression: "How hard and how often the agent attacks rather than rallies.",
  patience: "Willingness to grind out long, neutral rallies.",
  risk: "Tendency to attempt low-percentage, high-reward shots.",
  creativity: "Likelihood of inventing and deploying trick shots.",
  composure: "Resistance to choking on break, set, and match points.",
  stamina: "How slowly fatigue accumulates over a long match.",
  footwork: "Movement quality and effective court coverage.",
  anticipation: "Trust placed in the opponent-prediction module.",
  adaptability: "How fast the scouting model reshapes its strategy.",
  consistency: "Reduces random unforced-error noise on every shot.",
}

export function personalityToGenes(p: Personality): number[] {
  return PERSONALITY_KEYS.map((k) => p[k])
}

export function genesToPersonality(genes: number[]): Personality {
  const p = {} as Personality
  PERSONALITY_KEYS.forEach((k, i) => {
    p[k] = genes[i] ?? 0.5
  })
  return p
}

export function randomPersonality(rng: () => number): Personality {
  const p = {} as Personality
  PERSONALITY_KEYS.forEach((k) => {
    p[k] = 0.2 + rng() * 0.6
  })
  return p
}

// ---------------------------------------------------------------------------
// Archetype presets — used as starting points in the agent creator.
// ---------------------------------------------------------------------------

export interface Archetype {
  id: string
  name: string
  tagline: string
  personality: Personality
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "aggressor",
    name: "The Aggressor",
    tagline: "First-strike tennis, big cuts, short points.",
    personality: {
      aggression: 0.92, patience: 0.25, risk: 0.78, creativity: 0.55, composure: 0.6,
      stamina: 0.55, footwork: 0.6, anticipation: 0.5, adaptability: 0.45, consistency: 0.5,
    },
  },
  {
    id: "wall",
    name: "The Wall",
    tagline: "Endless retrieval, attrition, zero free points.",
    personality: {
      aggression: 0.2, patience: 0.95, risk: 0.15, creativity: 0.3, composure: 0.8,
      stamina: 0.92, footwork: 0.88, anticipation: 0.65, adaptability: 0.6, consistency: 0.9,
    },
  },
  {
    id: "tactician",
    name: "The Tactician",
    tagline: "Reads the opponent, exploits patterns, plays chess.",
    personality: {
      aggression: 0.5, patience: 0.7, risk: 0.45, creativity: 0.6, composure: 0.78,
      stamina: 0.65, footwork: 0.7, anticipation: 0.95, adaptability: 0.95, consistency: 0.72,
    },
  },
  {
    id: "artist",
    name: "The Artist",
    tagline: "Improviser who invents shots nobody has seen.",
    personality: {
      aggression: 0.6, patience: 0.5, risk: 0.85, creativity: 0.98, composure: 0.55,
      stamina: 0.6, footwork: 0.75, anticipation: 0.6, adaptability: 0.7, consistency: 0.45,
    },
  },
  {
    id: "iceberg",
    name: "The Iceberg",
    tagline: "Unshakeable under pressure, thrives in the clutch.",
    personality: {
      aggression: 0.55, patience: 0.75, risk: 0.4, creativity: 0.45, composure: 0.99,
      stamina: 0.8, footwork: 0.72, anticipation: 0.7, adaptability: 0.65, consistency: 0.85,
    },
  },
  {
    id: "rookie",
    name: "The Rookie",
    tagline: "Raw, inconsistent, everything to learn.",
    personality: {
      aggression: 0.45, patience: 0.4, risk: 0.5, creativity: 0.4, composure: 0.35,
      stamina: 0.5, footwork: 0.45, anticipation: 0.3, adaptability: 0.4, consistency: 0.35,
    },
  },
]

export const ARCHETYPE_INDEX: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
)
