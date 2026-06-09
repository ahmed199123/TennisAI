/**
 * ============================================================================
 * ROSTER SEEDING
 * ============================================================================
 * Builds a starting cast of named agents — one per archetype plus a couple of
 * pre-evolved "champions" — so the app has something to play with on first load.
 * Each agent gets a distinct accent color and personality from its archetype.
 * ============================================================================
 */

import { Agent } from "../agent/agent"
import { ARCHETYPES } from "../agent/personality"

export const ACCENT_COLORS = [
  "#5b9cff", // blue
  "#ff9a3c", // orange
  "#3ddc97", // green
  "#e85d75", // rose
  "#c084fc", // violet
  "#ffd23c", // gold
  "#22d3ee", // cyan
  "#f472b6", // pink
]

const SEED_NAMES: Record<string, string> = {
  aggressor: "Vega Strike",
  wall: "Atlas Wall",
  tactician: "Kasparov V",
  artist: "Nova Mirage",
  iceberg: "Frost Zero",
  rookie: "Cadet One",
}

/** Build the default roster — deterministic seeds for reproducibility. */
export function seedRoster(): Agent[] {
  const agents: Agent[] = []
  ARCHETYPES.forEach((arc, i) => {
    const agent = Agent.create({
      name: SEED_NAMES[arc.id] ?? arc.name,
      archetypeId: arc.id,
      color: ACCENT_COLORS[i % ACCENT_COLORS.length],
      personality: { ...arc.personality },
      seed: 1000 + i * 137,
      generation: 0,
    })
    // give champions a small head-start on skill mastery
    if (arc.id === "tactician" || arc.id === "wall") {
      agent.meta.rating = 1320
      agent.skills.forEach((s) => (s.mastery = Math.min(1, s.mastery + 0.2)))
    }
    agents.push(agent)
  })
  return agents
}
