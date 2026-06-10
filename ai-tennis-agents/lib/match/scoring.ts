/**
 * ============================================================================
 * TENNIS SCORING
 * ============================================================================
 * Standard tennis scoring: points (0,15,30,40,Adv), games (win by 2, with a
 * tiebreak at 6-6), and sets (best of N). Also flags "pressure points" (break
 * points, set points, match points) which feed the neural perception and the
 * composure trait. Pure functions over a ScoreState so it is fully testable.
 * ============================================================================
 */

import type { ScoreState, Side } from "../types"

export interface MatchFormat {
  /** sets needed to win the match (e.g. 2 for best-of-3) */
  setsToWin: number
  /** games needed to win a set */
  gamesPerSet: number
  /** play a tiebreak at gamesPerSet-all */
  tiebreak: boolean
  /** points to win a tiebreak */
  tiebreakPoints: number
}

export const DEFAULT_FORMAT: MatchFormat = {
  setsToWin: 2,
  gamesPerSet: 6,
  tiebreak: true,
  tiebreakPoints: 7,
}

export const POINT_LABELS = ["0", "15", "30", "40"]

export function createScore(server: Side): ScoreState {
  return {
    points: [0, 0],
    games: [0, 0],
    sets: [0, 0],
    setHistory: [],
    server,
    pressurePoint: false,
    matchOver: false,
    winner: null,
  }
}

function sideIdx(side: Side): 0 | 1 {
  return side === "left" ? 0 : 1
}

/** Human readable point display, handling deuce / advantage and tiebreaks. */
export function displayPoints(score: ScoreState, inTiebreak: boolean): [string, string] {
  const [a, b] = score.points
  if (inTiebreak) return [String(a), String(b)]
  if (a >= 3 && b >= 3) {
    if (a === b) return ["40", "40"] // deuce
    return a > b ? ["Ad", "—"] : ["—", "Ad"]
  }
  return [POINT_LABELS[Math.min(a, 3)], POINT_LABELS[Math.min(b, 3)]]
}

/** Are we currently in a tiebreak game? */
export function isTiebreak(score: ScoreState, fmt: MatchFormat): boolean {
  return fmt.tiebreak && score.games[0] === fmt.gamesPerSet && score.games[1] === fmt.gamesPerSet
}

/**
 * Award a point to a side and cascade game/set/match resolution. Mutates and
 * returns a NEW score object (immutable update) plus event flags.
 */
export interface PointResult {
  score: ScoreState
  gameWon: Side | null
  setWon: Side | null
  matchWon: Side | null
}

export function awardPoint(prev: ScoreState, winner: Side, fmt: MatchFormat): PointResult {
  const score: ScoreState = {
    ...prev,
    points: [...prev.points] as [number, number],
    games: [...prev.games] as [number, number],
    sets: [...prev.sets] as [number, number],
    setHistory: prev.setHistory.map((s) => [...s] as [number, number]),
  }
  const w = sideIdx(winner)
  const l = w === 0 ? 1 : 0
  let gameWon: Side | null = null
  let setWon: Side | null = null
  let matchWon: Side | null = null

  const tiebreak = isTiebreak(prev, fmt)
  score.points[w]++

  if (tiebreak) {
    const need = fmt.tiebreakPoints
    if (score.points[w] >= need && score.points[w] - score.points[l] >= 2) {
      gameWon = winner
    }
  } else {
    // standard game: need >=4 points and win by 2
    if (score.points[w] >= 4 && score.points[w] - score.points[l] >= 2) {
      gameWon = winner
    }
  }

  if (gameWon) {
    score.points = [0, 0]
    score.games[w]++
    // alternate server each game
    score.server = score.server === "left" ? "right" : "left"

    const gw = score.games[w]
    const gl = score.games[l]
    const setDone =
      (gw >= fmt.gamesPerSet + 1 && gw - gl >= 2) ||
      (tiebreak && gw === fmt.gamesPerSet + 1) ||
      (gw === fmt.gamesPerSet && gl < fmt.gamesPerSet - 1)
    // simpler robust rule:
    const wonSet =
      (gw >= fmt.gamesPerSet && gw - gl >= 2) ||
      (fmt.tiebreak && gw === fmt.gamesPerSet + 1 && gl === fmt.gamesPerSet)
    void setDone

    if (wonSet) {
      setWon = winner
      score.setHistory.push([score.games[0], score.games[1]])
      score.sets[w]++
      score.games = [0, 0]
      if (score.sets[w] >= fmt.setsToWin) {
        matchWon = winner
        score.matchOver = true
        score.winner = winner
      }
    }
  }

  // recompute pressure flag for the upcoming point
  score.pressurePoint = computePressure(score, fmt)
  return { score, gameWon, setWon, matchWon }
}

/**
 * A point is "pressure" if winning/losing it would win a game on return (break
 * point), win a set, or win the match for either player.
 */
function computePressure(score: ScoreState, fmt: MatchFormat): boolean {
  if (score.matchOver) return false
  const [pa, pb] = score.points
  const onPoint = (a: number, b: number) => a >= 3 && a - b >= 1
  const breakish = onPoint(pa, pb) || onPoint(pb, pa)
  // set point: a player one game from the set and ahead on points
  const [ga, gb] = score.games
  const nearSetA = ga >= fmt.gamesPerSet - 1
  const nearSetB = gb >= fmt.gamesPerSet - 1
  return breakish && (nearSetA || nearSetB || score.sets[0] === fmt.setsToWin - 1 || score.sets[1] === fmt.setsToWin - 1)
    ? true
    : breakish && (ga >= 5 || gb >= 5)
}

/** Compact scoreboard string e.g. "6-4 3-6 5-4". */
export function scoreboardString(score: ScoreState): string {
  const sets = score.setHistory.map((s) => `${s[0]}-${s[1]}`)
  sets.push(`${score.games[0]}-${score.games[1]}`)
  return sets.join("  ")
}
