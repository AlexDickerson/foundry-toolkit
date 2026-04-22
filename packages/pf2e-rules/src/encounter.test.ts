import { describe, expect, it } from 'vitest';

import { budgetMultiplier, creatureXp, threatLabel } from './encounter.js';
import { TREASURE_PER_LEVEL_GP, encounterTreasureBudgetGp, moderatePerEncounterGp } from './treasure.js';

describe('creatureXp', () => {
  it('returns 0 for creatures five or more levels below the party', () => {
    expect(creatureXp(0, 5)).toBe(0);
    expect(creatureXp(-1, 5)).toBe(0);
    expect(creatureXp(1, 10)).toBe(0);
  });

  it('caps creatures five or more levels above the party at 200 XP', () => {
    expect(creatureXp(10, 5)).toBe(200);
    expect(creatureXp(15, 5)).toBe(200);
  });

  it('matches Table 10-1 for the core relative-level range', () => {
    // PL-4 through PL+4
    expect(creatureXp(1, 5)).toBe(10);
    expect(creatureXp(2, 5)).toBe(15);
    expect(creatureXp(3, 5)).toBe(20);
    expect(creatureXp(4, 5)).toBe(30);
    expect(creatureXp(5, 5)).toBe(40);
    expect(creatureXp(6, 5)).toBe(60);
    expect(creatureXp(7, 5)).toBe(80);
    expect(creatureXp(8, 5)).toBe(120);
    expect(creatureXp(9, 5)).toBe(160);
  });
});

describe('threatLabel', () => {
  it('bands XP totals per CRB Table 10-2', () => {
    expect(threatLabel(0)).toBe('trivial');
    expect(threatLabel(40)).toBe('trivial');
    expect(threatLabel(41)).toBe('low');
    expect(threatLabel(60)).toBe('low');
    expect(threatLabel(61)).toBe('moderate');
    expect(threatLabel(100)).toBe('moderate');
    expect(threatLabel(101)).toBe('severe');
    expect(threatLabel(140)).toBe('severe');
    expect(threatLabel(141)).toBe('extreme');
    expect(threatLabel(500)).toBe('extreme');
  });
});

describe('budgetMultiplier', () => {
  it('clamps to a 0.25 floor so trivial encounters still pay something', () => {
    expect(budgetMultiplier(0)).toBe(0.25);
    expect(budgetMultiplier(10)).toBe(0.25);
  });

  it('returns 1.0 at the moderate threshold (80 XP)', () => {
    expect(budgetMultiplier(80)).toBe(1);
  });

  it('scales linearly above moderate', () => {
    expect(budgetMultiplier(160)).toBe(2);
    expect(budgetMultiplier(40)).toBe(0.5);
  });
});

describe('treasure tables', () => {
  it('covers levels 1-20', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(TREASURE_PER_LEVEL_GP[lvl]).toBeGreaterThan(0);
    }
  });

  it('moderatePerEncounterGp is 1/4 of the per-level value', () => {
    expect(moderatePerEncounterGp(5)).toBe(TREASURE_PER_LEVEL_GP[5] / 4);
  });

  it('falls back to level 10 for out-of-table inputs', () => {
    expect(moderatePerEncounterGp(99)).toBe(TREASURE_PER_LEVEL_GP[10] / 4);
  });

  it('encounterTreasureBudgetGp composes multiplier × moderate budget', () => {
    // At 160 XP (severe-range budget multiplier = 2) for a level 5 party,
    // the budget should be 2 × (1350 / 4) = 675 gp.
    expect(encounterTreasureBudgetGp(5, 160)).toBe(675);
  });
});
