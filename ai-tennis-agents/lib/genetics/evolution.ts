/**
 * ============================================================================
 * GENETICS ENGINE (neuro-evolution)
 * ============================================================================
 * Mutation, crossover, fitness-proportionate + tournament selection, and a full
 * generational step. Operates on flat gene vectors so it works uniformly across
 * neural weights, personality genes, and skill-affinity genes. Mutation rates
 * are self-adapting (each genome carries its own rate which itself mutates).
 * ============================================================================
 */

import type { EvolutionConfig, Genome } from "../types"
import { gaussian } from "../neural/network"

export const DEFAULT_EVOLUTION: EvolutionConfig = {
  populationSize: 24,
  eliteCount: 3,
  mutationRate: 0.08,
  mutationScale: 0.2,
  crossoverRate: 0.75,
  tournamentSize: 4,
}

/** Clamp helper. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/**
 * Gaussian mutation over a gene array. Each gene mutates with probability
 * `rate`, adding noise scaled by `scale`. Returns a new array.
 */
export function mutateGenes(genes: number[], rate: number, scale: number, rng: () => number): number[] {
  const out = new Array<number>(genes.length)
  for (let i = 0; i < genes.length; i++) {
    if (rng() < rate) {
      out[i] = genes[i] + gaussian(rng, 0, scale)
    } else {
      out[i] = genes[i]
    }
  }
  return out
}

/** Mutate genes constrained to [0,1] (personality / affinity). */
export function mutateBounded(genes: number[], rate: number, scale: number, rng: () => number): number[] {
  const out = new Array<number>(genes.length)
  for (let i = 0; i < genes.length; i++) {
    out[i] = rng() < rate ? clamp(genes[i] + gaussian(rng, 0, scale), 0, 1) : genes[i]
  }
  return out
}

/**
 * Uniform + blend crossover. With probability `rate` each gene is averaged
 * (blend), otherwise it is inherited from one parent (uniform). This mixes
 * fine-grained interpolation with discrete inheritance for diversity.
 */
export function crossover(a: number[], b: number[], rate: number, rng: () => number): number[] {
  const len = Math.min(a.length, b.length)
  const child = new Array<number>(len)
  for (let i = 0; i < len; i++) {
    if (rng() < rate) {
      const t = rng()
      child[i] = a[i] * t + b[i] * (1 - t) // blend
    } else {
      child[i] = rng() < 0.5 ? a[i] : b[i] // uniform
    }
  }
  return child
}

/** Tournament selection: pick the best of k random contenders. */
export function tournamentSelect(
  population: Genome[],
  fitness: number[],
  k: number,
  rng: () => number,
): Genome {
  let bestIdx = Math.floor(rng() * population.length)
  for (let i = 1; i < k; i++) {
    const idx = Math.floor(rng() * population.length)
    if (fitness[idx] > fitness[bestIdx]) bestIdx = idx
  }
  return population[bestIdx]
}

/** Mate two genomes into one child genome with self-adapting mutation rate. */
export function mate(parentA: Genome, parentB: Genome, config: EvolutionConfig, rng: () => number): Genome {
  // self-adapting mutation rate: child inherits blended rate then perturbs it
  const inheritedRate = (parentA.mutationRate + parentB.mutationRate) / 2
  const childRate = clamp(inheritedRate * Math.exp(gaussian(rng, 0, 0.15)), 0.01, 0.5)

  const weights = mutateGenes(
    crossover(parentA.weights, parentB.weights, config.crossoverRate, rng),
    childRate,
    config.mutationScale,
    rng,
  )
  const personality = mutateBounded(
    crossover(parentA.personality, parentB.personality, config.crossoverRate, rng),
    childRate,
    0.08,
    rng,
  )
  const skillAffinity = mutateBounded(
    crossover(parentA.skillAffinity, parentB.skillAffinity, config.crossoverRate, rng),
    childRate,
    0.1,
    rng,
  )

  return { weights, personality, skillAffinity, mutationRate: childRate }
}

export interface GenerationResult {
  nextPopulation: Genome[]
  /** index of the elite genomes carried over unchanged */
  eliteIndices: number[]
  bestFitness: number
  avgFitness: number
  diversity: number
}

/**
 * Produce the next generation from a scored population. Elites are carried over
 * untouched, the remainder is produced through tournament selection + mating.
 */
export function evolveGeneration(
  population: Genome[],
  fitness: number[],
  config: EvolutionConfig,
  rng: () => number,
): GenerationResult {
  const ranked = population
    .map((g, i) => ({ g, f: fitness[i], i }))
    .sort((a, b) => b.f - a.f)

  const next: Genome[] = []
  const eliteIndices: number[] = []
  for (let e = 0; e < config.eliteCount && e < ranked.length; e++) {
    next.push(cloneGenome(ranked[e].g))
    eliteIndices.push(ranked[e].i)
  }

  while (next.length < config.populationSize) {
    const pa = tournamentSelect(population, fitness, config.tournamentSize, rng)
    const pb = tournamentSelect(population, fitness, config.tournamentSize, rng)
    next.push(mate(pa, pb, config, rng))
  }

  const best = ranked[0].f
  const avg = fitness.reduce((a, b) => a + b, 0) / fitness.length
  return {
    nextPopulation: next,
    eliteIndices,
    bestFitness: best,
    avgFitness: avg,
    diversity: geneticDiversity(population),
  }
}

export function cloneGenome(g: Genome): Genome {
  return {
    weights: g.weights.slice(),
    personality: g.personality.slice(),
    skillAffinity: g.skillAffinity.slice(),
    mutationRate: g.mutationRate,
  }
}

/**
 * Population diversity = mean pairwise weight distance on a sampled subset.
 * Used by the lab to detect premature convergence.
 */
export function geneticDiversity(population: Genome[]): number {
  if (population.length < 2) return 0
  const sample = Math.min(population.length, 8)
  let total = 0
  let count = 0
  for (let i = 0; i < sample; i++) {
    for (let j = i + 1; j < sample; j++) {
      const a = population[i].weights
      const b = population[j].weights
      const len = Math.min(a.length, b.length, 200)
      let d = 0
      for (let k = 0; k < len; k++) d += Math.abs(a[k] - b[k])
      total += d / len
      count++
    }
  }
  return count ? total / count : 0
}
