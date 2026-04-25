// PF2e treasure-per-level tables. Pure lookup + simple arithmetic; no state.

import { budgetMultiplier, type Threat } from './encounter.js';

/** Total character-treasure-per-level for a 4-player party, in gp.
 *  Source: PF2e Core Rulebook Table 10-9. The party is expected to see
 *  roughly 4 encounters' worth of treasure per level, so a
 *  moderate-threat encounter's budget is this value / 4. */
export const TREASURE_PER_LEVEL_GP: Record<number, number> = {
  1: 175,
  2: 300,
  3: 500,
  4: 850,
  5: 1350,
  6: 2000,
  7: 2900,
  8: 4000,
  9: 5700,
  10: 8000,
  11: 11500,
  12: 16500,
  13: 25000,
  14: 36500,
  15: 54500,
  16: 82500,
  17: 128000,
  18: 208000,
  19: 355000,
  20: 490000,
};

/** Treasure budget (gp) a moderate-threat encounter should award at the
 *  given party level. Falls back to level 10 for out-of-table inputs so
 *  callers don't crash on unexpected levels. */
export function moderatePerEncounterGp(partyLevel: number): number {
  // Level 10 is always present in the table; the fallback is guaranteed non-undefined.

  return (TREASURE_PER_LEVEL_GP[partyLevel] ?? TREASURE_PER_LEVEL_GP[10]!) / 4;
}

/** Treasure budget (gp) for an encounter of the given XP threat at the
 *  given party level. The XP argument is the total XP computed from
 *  `creatureXp` over the roster. */
export function encounterTreasureBudgetGp(partyLevel: number, totalXp: number): number {
  return moderatePerEncounterGp(partyLevel) * budgetMultiplier(totalXp);
}

/** Convenience wrapper that accepts a threat label instead of raw XP,
 *  using the midpoint of each threat band as the representative XP. */
export function treasureBudgetByThreat(partyLevel: number, threat: Threat): number {
  const xp: Record<Threat, number> = {
    trivial: 30,
    low: 50,
    moderate: 80,
    severe: 120,
    extreme: 160,
  };
  return encounterTreasureBudgetGp(partyLevel, xp[threat]);
}
