/**
 * ============================================================================
 * COURT GEOMETRY & PHYSICS CONSTANTS
 * ============================================================================
 * All match logic works in a normalized court space so brains are resolution
 * independent. The renderer maps this normalized space to pixels.
 *
 * Coordinate system (top-down view):
 *   x in [0,1] : left edge -> right edge (the width / sideline axis)
 *   y in [0,1] : far baseline (0) -> near baseline (1)
 *   net is at y = 0.5
 *   left player defends y in [0, 0.5], right player defends y in [0.5, 1]
 * ============================================================================
 */

import type { Side, Vec2 } from "../types"

export const COURT = {
  width: 1,
  length: 1,
  net: 0.5,
  /** singles sideline inset from the absolute edge */
  sideline: 0.08,
  /** service line distance from the net */
  serviceLine: 0.18,
  /** baseline inset where players rally from */
  baselineInset: 0.04,
}

export const PHYSICS = {
  /** ticks per simulated second */
  tickRate: 60,
  /** ball horizontal drag per tick */
  drag: 0.992,
  /** gravity applied to ball height each tick */
  gravity: 0.0009,
  /** bounce energy retention */
  restitution: 0.74,
  /** how much spin curves the ball trajectory */
  spinCurve: 0.0012,
  /** base player movement speed (normalized units / tick) */
  playerSpeed: 0.012,
  /** how close the player must be to the ball to hit it */
  reach: 0.06,
  /** max ball speed clamp */
  maxBallSpeed: 0.05,
  /** stamina drained per unit distance moved */
  staminaMoveCost: 0.0008,
  /** stamina regained per tick when not moving hard */
  staminaRegen: 0.0004,
}

/** Which y-half a side defends. */
export function defendingHalf(side: Side): [number, number] {
  return side === "left" ? [0, COURT.net] : [COURT.net, 1]
}

/** The baseline y a side serves / resets to. */
export function baselineY(side: Side): number {
  return side === "left" ? COURT.baselineInset : 1 - COURT.baselineInset
}

/** Direction (sign) that moves the ball toward the opponent for a given side. */
export function attackDirection(side: Side): number {
  return side === "left" ? 1 : -1
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Is a normalized point inside the singles court bounds? */
export function inBounds(p: Vec2): boolean {
  return p.x >= COURT.sideline && p.x <= 1 - COURT.sideline && p.y >= 0 && p.y <= 1
}

/** Classify a target x into a court direction lane. */
export function laneOf(x: number): "left" | "center" | "right" {
  if (x < 0.38) return "left"
  if (x > 0.62) return "right"
  return "center"
}
