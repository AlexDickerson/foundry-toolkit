import { describe, expect, it } from 'vitest';
import { evaluateAll } from './evaluator';
import { parsePrerequisite } from './parser';
import type { CharacterContext } from './types';
import type { ProficiencyRank } from '@/features/characters/types';

function makeCtx(overrides: Partial<CharacterContext> = {}): CharacterContext {
  return {
    level: 1,
    skillRanks: new Map(),
    abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    features: new Set(),
    // undefined = incomplete/sparse context; absent lore skills treated as 'unknown'.
    // Pass new Set() (possibly empty) to opt into definitive lore evaluation.
    loreSkillSlugs: undefined,
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

// ---------------------------------------------------------------------------
// A Home in Every Port — "Charisma +3" (ability modifier notation)
// ---------------------------------------------------------------------------

describe('A Home in Every Port: "Charisma +3"', () => {
  const PREREQ = 'Charisma +3';

  it('parses to ability predicate with score threshold 16 (10 + 2*3)', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([{ kind: 'ability', ability: 'cha', min: 16 }]);
  });

  it('passes when character has Charisma mod +3 (score 16)', () => {
    const ctx = makeCtx({ abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 3 } });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character has Charisma mod +4 (exceeds threshold)', () => {
    const ctx = makeCtx({ abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 4 } });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character has Charisma mod +2 (score 14, one short)', () => {
    const ctx = makeCtx({ abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 2 } });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character has Charisma mod 0', () => {
    const ctx = makeCtx({ abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('"Strength +2" parses correctly to min score 14', () => {
    expect(parsePrerequisite('Strength +2')).toEqual([{ kind: 'ability', ability: 'str', min: 14 }]);
  });
});

// ---------------------------------------------------------------------------
// Bloodsense — "master in Perception" (Perception lives outside sys.skills)
// ---------------------------------------------------------------------------

describe('Bloodsense: "master in Perception"', () => {
  const PREREQ = 'master in Perception';

  it('passes when character is master in Perception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['perception', 3]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is legendary in Perception (exceeds master)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['perception', 4]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character is expert in Perception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['perception', 2]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character is untrained in Perception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['perception', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Caravan Leader — "Pick Up the Pace" (feat name prerequisite)
// ---------------------------------------------------------------------------

describe('Caravan Leader: "Pick Up the Pace" feat prereq', () => {
  const PREREQ = 'Pick Up the Pace';

  it('parses to a feat predicate', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([{ kind: 'feat', name: 'Pick Up the Pace' }]);
  });

  it('passes when character has the feat', () => {
    const ctx = makeCtx({ features: new Set(['pick up the pace']) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character does not have the feat', () => {
    const ctx = makeCtx({ features: new Set() });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character has other feats but not this one', () => {
    const ctx = makeCtx({ features: new Set(['fleet', 'assurance']) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('feat name lookup is case-insensitive (evaluator lowercases the name)', () => {
    // The evaluator calls pred.name.toLowerCase() before the Set lookup,
    // so "Pick Up the Pace" and "pick up the pace" both resolve to 'meets'
    // when the character has the feat stored in lowercase.
    const ctx = makeCtx({ features: new Set(['pick up the pace']) });
    expect(evaluateAll(parsePrerequisite('Pick Up the Pace'), ctx)).toBe('meets');
  });
});

// ---------------------------------------------------------------------------
// Doublespeak — "master at Deception" (uses "at" instead of "in")
// ---------------------------------------------------------------------------

describe('Doublespeak: "master at Deception"', () => {
  const PREREQ = 'master at Deception';

  it('parses correctly despite "at" keyword', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([{ kind: 'skill-rank', skill: 'deception', min: 3 }]);
  });

  it('passes when character is master in Deception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 3]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when character is legendary in Deception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 4]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when character is expert in Deception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 2]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character is trained in Deception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 1]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('"expert at Arcana" also works', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['arcana', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert at Arcana'), ctx)).toBe('meets');
  });
});

// ---------------------------------------------------------------------------
// Half-Truths / Tumbling Theft / Vicious Critique — "rank in S1 and S2"
// ---------------------------------------------------------------------------

describe('"rank in S1 and S2" AND-list prereqs', () => {
  it('parses "expert in Deception and Diplomacy" → two skill-rank predicates', () => {
    expect(parsePrerequisite('expert in Deception and Diplomacy')).toEqual([
      { kind: 'skill-rank', skill: 'deception', min: 2 },
      { kind: 'skill-rank', skill: 'diplomacy', min: 2 },
    ]);
  });

  it('parses "trained in Crafting and Intimidation" → two skill-rank predicates', () => {
    expect(parsePrerequisite('trained in Crafting and Intimidation')).toEqual([
      { kind: 'skill-rank', skill: 'crafting', min: 1 },
      { kind: 'skill-rank', skill: 'intimidation', min: 1 },
    ]);
  });

  // Half-Truths — "expert in Deception and Diplomacy"
  it('Half-Truths: passes when expert in both Deception and Diplomacy', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 2], ['diplomacy', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert in Deception and Diplomacy'), ctx)).toBe('meets');
  });

  it('Half-Truths: fails when only expert in Deception', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 2], ['diplomacy', 0]]) });
    expect(evaluateAll(parsePrerequisite('expert in Deception and Diplomacy'), ctx)).toBe('fails');
  });

  it('Half-Truths: fails when only expert in Diplomacy', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 0], ['diplomacy', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert in Deception and Diplomacy'), ctx)).toBe('fails');
  });

  it('Half-Truths: fails when expert in neither', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 1], ['diplomacy', 1]]) });
    expect(evaluateAll(parsePrerequisite('expert in Deception and Diplomacy'), ctx)).toBe('fails');
  });

  it('Half-Truths: passes when master in both (exceeds expert)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['deception', 3], ['diplomacy', 3]]) });
    expect(evaluateAll(parsePrerequisite('expert in Deception and Diplomacy'), ctx)).toBe('meets');
  });

  // Tumbling Theft — "expert in Acrobatics and Thievery"
  it('Tumbling Theft: passes when expert in Acrobatics and Thievery', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['acrobatics', 2], ['thievery', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert in Acrobatics and Thievery'), ctx)).toBe('meets');
  });

  it('Tumbling Theft: fails when expert in only one skill', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['acrobatics', 2], ['thievery', 1]]) });
    expect(evaluateAll(parsePrerequisite('expert in Acrobatics and Thievery'), ctx)).toBe('fails');
  });

  // Vicious Critique — "trained in Crafting and Intimidation"
  it('Vicious Critique: passes when trained in both Crafting and Intimidation', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 1], ['intimidation', 1]]) });
    expect(evaluateAll(parsePrerequisite('trained in Crafting and Intimidation'), ctx)).toBe('meets');
  });

  it('Vicious Critique: fails when untrained in Intimidation', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 1], ['intimidation', 0]]) });
    expect(evaluateAll(parsePrerequisite('trained in Crafting and Intimidation'), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Master or Apprentice — "master in Crafting, Performance, or a Lore skill"
// ---------------------------------------------------------------------------

describe('Master or Apprentice: "master in Crafting, Performance, or a Lore skill"', () => {
  const PREREQ = 'master in Crafting, Performance, or a Lore skill';

  it('parses to skill-rank-any-of-or-lore', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([
      { kind: 'skill-rank-any-of-or-lore', skills: ['crafting', 'performance'], min: 3 },
    ]);
  });

  it('passes when master in Crafting', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 3], ['performance', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when master in Performance', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 0], ['performance', 3]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when master in a lore skill (Herbalism Lore)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['performance', 0], ['herbalism lore', 3]]),
      loreSkillSlugs: new Set(['herbalism lore']),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when expert in all three (one short of master)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 2], ['performance', 2], ['herbalism lore', 2]]),
      loreSkillSlugs: new Set(['herbalism lore']),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('fails when character has no lore skills and neither crafting nor performance at master', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 2], ['performance', 0]]),
      loreSkillSlugs: new Set(), // definitive: no lore skills
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('unknown when specific skills are missing from the map (lore check also fails)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['herbalism lore', 2]]), loreSkillSlugs: new Set(['herbalism lore']) });
    // crafting and performance missing from map (not lore keys) → anyUnknown; lore rank too low → unknown
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Temperature Adjustment — "master in Crafting, Herbalism Lore, or Medicine"
// (Specific lore skill name — not the wildcard; needs slug normalisation)
// ---------------------------------------------------------------------------

describe('Temperature Adjustment: "master in Crafting, Herbalism Lore, or Medicine"', () => {
  const PREREQ = 'master in Crafting, Herbalism Lore, or Medicine';

  it('parses to skill-rank-any-of (Herbalism Lore is specific, not the wildcard)', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([
      { kind: 'skill-rank-any-of', skills: ['crafting', 'herbalism lore', 'medicine'], min: 3 },
    ]);
  });

  it('passes when master in Crafting', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 3], ['herbalism lore', 0], ['medicine', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when master in Herbalism Lore (slug-normalised from "herbalism-lore")', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 0], ['herbalism lore', 3], ['medicine', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when master in Medicine', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 0], ['herbalism lore', 0], ['medicine', 3]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when expert in all three', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 2], ['herbalism lore', 2], ['medicine', 2]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Lore skill patterns — "trained in Lore", specific lore, hyphenated names
// ---------------------------------------------------------------------------

describe('"trained in Lore" / "expert in Lore" — bare Lore wildcard', () => {
  it('parses "trained in Lore" → skill-rank-any-lore', () => {
    expect(parsePrerequisite('trained in Lore')).toEqual([{ kind: 'skill-rank-any-lore', min: 1 }]);
  });

  it('parses "expert in Lore" → skill-rank-any-lore with min 2', () => {
    expect(parsePrerequisite('expert in Lore')).toEqual([{ kind: 'skill-rank-any-lore', min: 2 }]);
  });

  // Experienced Professional
  it('Experienced Professional: passes when character has any lore skill trained', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['warfare lore', 1]]),
      loreSkillSlugs: new Set(['warfare lore']),
    });
    expect(evaluateAll(parsePrerequisite('trained in Lore'), ctx)).toBe('meets');
  });

  it('Experienced Professional: fails when lore skill is untrained (rank 0)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['warfare lore', 0]]),
      loreSkillSlugs: new Set(['warfare lore']),
    });
    expect(evaluateAll(parsePrerequisite('trained in Lore'), ctx)).toBe('fails');
  });

  it('Experienced Professional: fails when lore data is complete but character has no lore skills', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 1]]), loreSkillSlugs: new Set() });
    expect(evaluateAll(parsePrerequisite('trained in Lore'), ctx)).toBe('fails');
  });

  it('Experienced Professional: unknown when lore skill data unavailable (sparse context)', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 1]]) }); // loreSkillSlugs = undefined
    expect(evaluateAll(parsePrerequisite('trained in Lore'), ctx)).toBe('unknown');
  });

  // Unmistakable Lore
  it('Unmistakable Lore: passes when character has any lore skill at expert', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['legal lore', 2]]),
      loreSkillSlugs: new Set(['legal lore']),
    });
    expect(evaluateAll(parsePrerequisite('expert in Lore'), ctx)).toBe('meets');
  });

  it('Unmistakable Lore: fails when lore skill is only trained', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['legal lore', 1]]),
      loreSkillSlugs: new Set(['legal lore']),
    });
    expect(evaluateAll(parsePrerequisite('expert in Lore'), ctx)).toBe('fails');
  });
});

describe('Specific lore skill prereqs', () => {
  // Battle Planner — "expert in Warfare Lore"
  it('Battle Planner: parses correctly and passes when expert in Warfare Lore', () => {
    expect(parsePrerequisite('expert in Warfare Lore')).toEqual([
      { kind: 'skill-rank', skill: 'warfare lore', min: 2 },
    ]);
    const ctx = makeCtx({ skillRanks: skillMap([['warfare lore', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert in Warfare Lore'), ctx)).toBe('meets');
  });

  it('Battle Planner: fails when only trained in Warfare Lore', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['warfare lore', 1]]) });
    expect(evaluateAll(parsePrerequisite('expert in Warfare Lore'), ctx)).toBe('fails');
  });

  // Contract Negotiator — "trained in Legal Lore"
  it('Contract Negotiator: passes when trained in Legal Lore', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['legal lore', 1]]) });
    expect(evaluateAll(parsePrerequisite('trained in Legal Lore'), ctx)).toBe('meets');
  });

  // Ravening's Desperation — "trained in Zevgavizeb Lore"
  it("Ravening's Desperation: passes when trained in Zevgavizeb Lore", () => {
    const ctx = makeCtx({ skillRanks: skillMap([['zevgavizeb lore', 1]]) });
    expect(evaluateAll(parsePrerequisite('trained in Zevgavizeb Lore'), ctx)).toBe('meets');
  });

  // What's That up Your Sleeve — "expert in Gambling Lore"
  it("What's That up Your Sleeve: passes when expert in Gambling Lore", () => {
    const ctx = makeCtx({ skillRanks: skillMap([['gambling lore', 2]]) });
    expect(evaluateAll(parsePrerequisite('expert in Gambling Lore'), ctx)).toBe('meets');
  });

  it("What's That up Your Sleeve: fails when only trained in Gambling Lore", () => {
    const ctx = makeCtx({ skillRanks: skillMap([['gambling lore', 1]]) });
    expect(evaluateAll(parsePrerequisite('expert in Gambling Lore'), ctx)).toBe('fails');
  });
});

describe('Hyphenated lore skill names in prereq strings', () => {
  // Myth Hunter — "trained in Hero-God Lore or Legendary Beast Lore"
  it('Myth Hunter: parses to skill-rank-any-of with normalised hyphenless keys', () => {
    expect(parsePrerequisite('trained in Hero-God Lore or Legendary Beast Lore')).toEqual([
      { kind: 'skill-rank-any-of', skills: ['hero god lore', 'legendary beast lore'], min: 1 },
    ]);
  });

  it('Myth Hunter: passes when trained in Hero-God Lore (slug "hero-god-lore" → "hero god lore")', () => {
    // Character context normalises "hero-god-lore" → "hero god lore"; parser
    // normalises prereq "Hero-God Lore" → "hero god lore". Keys match.
    const ctx = makeCtx({ skillRanks: skillMap([['hero god lore', 1], ['legendary beast lore', 0]]) });
    expect(evaluateAll(parsePrerequisite('trained in Hero-God Lore or Legendary Beast Lore'), ctx)).toBe('meets');
  });

  it('Myth Hunter: passes when trained in Legendary Beast Lore', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['hero god lore', 0], ['legendary beast lore', 1]]) });
    expect(evaluateAll(parsePrerequisite('trained in Hero-God Lore or Legendary Beast Lore'), ctx)).toBe('meets');
  });

  it('Myth Hunter: fails when trained in neither', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['hero god lore', 0], ['legendary beast lore', 0]]) });
    expect(evaluateAll(parsePrerequisite('trained in Hero-God Lore or Legendary Beast Lore'), ctx)).toBe('fails');
  });
});

describe('Armor Assist: "trained in Athletics or Warfare Lore"', () => {
  const PREREQ = 'trained in Athletics or Warfare Lore';

  it('parses to skill-rank-any-of with both options', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([
      { kind: 'skill-rank-any-of', skills: ['athletics', 'warfare lore'], min: 1 },
    ]);
  });

  it('passes when trained in Athletics', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 1], ['warfare lore', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when trained in Warfare Lore only', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 0], ['warfare lore', 1]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when untrained in both', () => {
    const ctx = makeCtx({ skillRanks: skillMap([['athletics', 0], ['warfare lore', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});

// ---------------------------------------------------------------------------
// Seasoned — "trained in Alcohol Lore, Cooking Lore, or Crafting"
// Mixes specific lore skills with a standard skill in an OR list.
// ---------------------------------------------------------------------------

describe('Seasoned: "trained in Alcohol Lore, Cooking Lore, or Crafting"', () => {
  const PREREQ = 'trained in Alcohol Lore, Cooking Lore, or Crafting';

  it('parses to skill-rank-any-of with all three options', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([
      { kind: 'skill-rank-any-of', skills: ['alcohol lore', 'cooking lore', 'crafting'], min: 1 },
    ]);
  });

  it('passes when trained in Crafting (standard skill)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 1]]),
      loreSkillSlugs: new Set(),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when trained in Cooking Lore only', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['cooking lore', 1]]),
      loreSkillSlugs: new Set(['cooking lore']),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when trained in Alcohol Lore only', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['alcohol lore', 1]]),
      loreSkillSlugs: new Set(['alcohol lore']),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when untrained in Crafting and no lore skills (definitive data)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0]]),
      loreSkillSlugs: new Set(), // character has no lore skills
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });

  it('unknown when untrained in Crafting and lore data unavailable', () => {
    // loreSkillSlugs = undefined → can't rule out Alcohol/Cooking Lore
    const ctx = makeCtx({ skillRanks: skillMap([['crafting', 0]]) });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Prepare Elemental Medicine — "trained in Crafting, Herbalism Lore, or Medicine"
// Same shape as Temperature Adjustment at master; verifies trained rank.
// ---------------------------------------------------------------------------

describe('Prepare Elemental Medicine: "trained in Crafting, Herbalism Lore, or Medicine"', () => {
  const PREREQ = 'trained in Crafting, Herbalism Lore, or Medicine';

  it('parses to skill-rank-any-of with min 1', () => {
    expect(parsePrerequisite(PREREQ)).toEqual([
      { kind: 'skill-rank-any-of', skills: ['crafting', 'herbalism lore', 'medicine'], min: 1 },
    ]);
  });

  it('passes when trained in Crafting', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 1], ['medicine', 0]]),
      loreSkillSlugs: new Set(),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when trained in Herbalism Lore', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['herbalism lore', 1], ['medicine', 0]]),
      loreSkillSlugs: new Set(['herbalism lore']),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('passes when trained in Medicine', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['medicine', 1]]),
      loreSkillSlugs: new Set(),
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('meets');
  });

  it('fails when untrained in all three (definitive lore data)', () => {
    const ctx = makeCtx({
      skillRanks: skillMap([['crafting', 0], ['medicine', 0]]),
      loreSkillSlugs: new Set(), // no lore skills
    });
    expect(evaluateAll(parsePrerequisite(PREREQ), ctx)).toBe('fails');
  });
});
