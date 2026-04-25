// PF2e encounter XP + threat math. Core Rulebook Table 10-1 (relative-level
// → XP) and the standard moderate-encounter thresholds. Pure functions; no
// state, no deps.

export type Threat = 'trivial' | 'low' | 'moderate' | 'severe' | 'extreme';

/** Relative-level → XP for one creature against a given party level.
 *  Creatures more than four levels below the party contribute 0; more
 *  than four above are capped at extreme (200 XP, matching the capped
 *  encounter-contributor row from the official table).
 *
 *  Source: PF2e Core Rulebook Table 10-1. */
export function creatureXp(creatureLevel: number, partyLevel: number): number {
  const d = creatureLevel - partyLevel;
  if (d <= -5) return 0;
  if (d >= 5) return 200;
  // d is in [-4, 4] after the guards above, so index [0, 8] is always valid.

  return [10, 15, 20, 30, 40, 60, 80, 120, 160][d + 4]!;
}

/** XP → threat-tier label. Thresholds match CRB Table 10-2. */
export function threatLabel(totalXp: number): Threat {
  if (totalXp <= 40) return 'trivial';
  if (totalXp <= 60) return 'low';
  if (totalXp <= 100) return 'moderate';
  if (totalXp <= 140) return 'severe';
  return 'extreme';
}

/** Multiplier against the moderate-encounter treasure budget. Continuous
 *  rather than bucketed so tuned encounters (70 XP, 110 XP) produce
 *  proportional rewards instead of snapping to a threshold. Clamped to a
 *  0.25 floor so trivial fights still produce something when paired with
 *  a generous budget. */
export function budgetMultiplier(totalXp: number): number {
  return Math.max(0.25, totalXp / 80);
}
