/**
 * ============================================================================
 * ELO RATING
 * ============================================================================
 * Standard Elo update used by the league/tournament system to rank agents.
 * ============================================================================
 */

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function updateElo(ratingA: number, ratingB: number, scoreA: number, k = 32): [number, number] {
  const expA = expectedScore(ratingA, ratingB)
  const expB = 1 - expA
  const newA = ratingA + k * (scoreA - expA)
  const newB = ratingB + k * (1 - scoreA - expB)
  return [Math.round(newA), Math.round(newB)]
}
