import { describe, expect, it } from 'vitest';
import { evaluateAll } from './evaluator';
import { parsePrerequisite } from './parser';
import type { CharacterContext } from './types';
import type { ProficiencyRank } from '../api/types';

function makeCtx(overrides: Partial<CharacterContext> = {}): CharacterContext {
  return {
    level: 1,
    skillRanks: new Map(),
    abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    features: new Set(),
    ...overrides,
  };
}

function skillMap(entries: [string, number][]): Map<string, ProficiencyRank> {
  return new Map(entries as [string, ProficiencyRank][]);
}

// ---------------------------------------------------------------------------
// Parser unit tests — verify structural output before evaluator runs
// ---------------------------------------------------------------------------

describe('parsePrerequisite: new pattern shapes', () => {
  it('parses "trained in at least one skill" → skill-rank-any', () => {
    expect(parsePrerequisite('trained in at least one skill')).toEqual([{ kind: 'skill-rank-any', min: 1 }]);
  });

  it('parses "trained in any skill" → skill-rank-any', () => {
    expect(parsePrerequisite('trained in any skill')).toEqual([{ kind: 'skill-rank-any', min: 1 }]);
  });

  it('parses "expert in any skill" → skill-rank-any with min 2', () => {
    expect(parsePrerequisite('expert in any skill')).toEqual([{ kind: 'skill-rank-any', min: 2 }]);
  });

  it('parses "master in Occultism or Religion" → skill-rank-any-of', () => {
    expect(parsePrerequisite('master in Occultism or Religion')).toEqual([
      { kind: 'skill-rank-any-of', skills: ['occultism', 'religion'], min: 3 },
    ]);
  });

  it('parses "expert in Arcana, Nature, Occultism, or Religion" → skill-rank-any-of', () => {
    expect(parsePrerequisite('expert in Arcana, Nature, Occultism, or Religion')).toEqual([
      { kind: 'skill-rank-any-of', skills: ['arcana', 'nature', 'occultism', 'religion'], min: 2 },
    ]);
  });

  it('parses "trained in Arcana or Nature" → skill-rank-any-of', () => {
    expect(parsePrerequisite('trained in Arcana or Nature')).toEqual([
      { kind: 'skill-rank-any-of', skills: ['arcana', 'nature'], min: 1 },
    ]);
  });

  it('still parses single-skill "trained in Athletics" → skill-rank', () => {
    expect(parsePrerequisite('trained in Athletics')).toEqual([{ kind: 'skill-rank', skill: 'athletics', min: 1 }]);
  });

  it('still handles semicolon-separated multi-prereq strings', () => {
    const preds = parsePrerequisite('trained in Athletics; Strength 14');
    expect(preds).toHaveLength(2);
    expect(preds[0]).toEqual({ kind: 'skill-rank', skill: 'athletics', min: 1 });
    expect(preds[1]).toEqual({ kind: 'ability', ability: 'str', min: 14 });
  });
});

// ---------------------------------------------------------------------------
// Assurance — "trained in at least one skill"
// ---------------------------------------------------------------------------

describe('Assurance: "trained in at least one skill"', () => {
  const PREREQ = 'trained in at least one skill';

  it('passes when character is trained in Athletics', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 1]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is expert in any skill (expert satisfies trained)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['medicine', 2]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is legendary in any skill', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['stealth', 4]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when all skills are untrained (rank 0)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([
        ['athletics', 0],
        ['acrobatics', 0],
        ['arcana', 0],
        ['diplomacy', 0],
      ]),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('returns unknown when skill map is empty (context has no data)', () => {
    const ctx = makeCtx({ skillRanks: new Map() });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Assured Identification — "expert in Arcana, Nature, Occultism, or Religion"
// ---------------------------------------------------------------------------

describe('Assured Identification: "expert in Arcana, Nature, Occultism, or Religion"', () => {
  const PREREQ = 'expert in Arcana, Nature, Occultism, or Religion';

  it('passes when character is expert in Religion only', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([
        ['religion', 2],
        ['arcana', 0],
        ['nature', 0],
        ['occultism', 0],
      ]),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is master in Arcana (exceeds expert)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([
        ['arcana', 3],
        ['nature', 0],
        ['occultism', 0],
        ['religion', 0],
      ]),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character is expert in Crafting only (not in the list)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([
        ['crafting', 2],
        ['arcana', 0],
        ['nature', 0],
        ['occultism', 0],
        ['religion', 0],
      ]),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character is trained (rank 1) in all four listed skills', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([
        ['arcana', 1],
        ['nature', 1],
        ['occultism', 1],
        ['religion', 1],
      ]),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Break Curse — "master in Occultism or Religion"
// ---------------------------------------------------------------------------

describe('Break Curse: "master in Occultism or Religion"', () => {
  const PREREQ = 'master in Occultism or Religion';

  it('passes when character is master in Occultism', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 3], ['religion', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is legendary in Religion (exceeds master)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 0], ['religion', 4]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character is expert in Religion (one rank short)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 0], ['religion', 2]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character is expert in Occultism', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 2], ['religion', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when both Occultism and Religion are untrained', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 0], ['religion', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Rank ordering: trained(1) < expert(2) < master(3) < legendary(4)
// ---------------------------------------------------------------------------

describe('rank ordering edge cases', () => {
  it('trained (1) satisfies a "trained in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 1]]) });
    expect(evaluateAll(parsePrerequisite('trained in Occultism'), ctx)).toBe('meets');
  });

  it('expert (2) satisfies a "trained in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 2]]) });
    expect(evaluateAll(parsePrerequisite('trained in Occultism'), ctx)).toBe('meets');
  });

  it('legendary (4) satisfies a "trained in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 4]]) });
    expect(evaluateAll(parsePrerequisite('trained in Occultism'), ctx)).toBe('meets');
  });

  it('untrained (0) fails a "trained in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['occultism', 0]]) });
    expect(evaluateAll(parsePrerequisite('trained in Occultism'), ctx)).toBe('fails');
  });

  it('expert (2) fails a "master in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['religion', 2]]) });
    expect(evaluateAll(parsePrerequisite('master in Religion'), ctx)).toBe('fails');
  });

  it('master (3) satisfies a "master in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['religion', 3]]) });
    expect(evaluateAll(parsePrerequisite('master in Religion'), ctx)).toBe('meets');
  });

  it('legendary (4) satisfies a "master in X" prereq', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['religion', 4]]) });
    expect(evaluateAll(parsePrerequisite('master in Religion'), ctx)).toBe('meets');
  });

  it('skill-rank-any respects rank threshold (trained-any with expert skill)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['nature', 2]]) });
    expect(evaluateAll(parsePrerequisite('trained in at least one skill'), ctx)).toBe('meets');
  });

  it('skill-rank-any fails correctly when threshold is master and only expert skills exist', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['nature', 2], ['arcana', 1]]) });
    expect(evaluateAll(parsePrerequisite('master in any skill'), ctx)).toBe('fails');
  });

  it('skill-rank-any passes when one skill meets the master threshold', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['nature', 3], ['arcana', 1]]) });
    expect(evaluateAll(parsePrerequisite('master in any skill'), ctx)).toBe('meets');
  });
});
