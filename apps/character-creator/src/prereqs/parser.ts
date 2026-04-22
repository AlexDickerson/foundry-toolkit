import type { ProficiencyRank } from '../api/types';
import type { Predicate } from './types';

// Free-text prereqs from pf2e read like "trained in Athletics; Strength 14".
// We reduce each phrase to a Predicate, falling back to `unsupported`
// when no pattern matches. The UI treats `unsupported` as "unknown —
// let it through", so partial coverage is safe.
//
// Add a new category by:
//   1. Teaching parsePhrase() to recognise it (ordered — most-specific
//      first, `unsupported` is the terminal case)
//   2. Adding a case in evaluator.ts
// Everything else stays untouched.

const RANK_WORDS: Record<string, ProficiencyRank> = {
  trained: 1,
  expert: 2,
  master: 3,
  legendary: 4,
};

// "trained in Athletics" / "expert in Medicine"
const SKILL_RANK_RE = /^\s*(trained|expert|master|legendary)\s+in\s+([A-Za-z][A-Za-z\s-]*?)\s*$/i;
// "5th level" / "Level 5" / "level 5"
const LEVEL_RE = /^\s*(?:(\d+)(?:st|nd|rd|th)?\s+level|level\s+(\d+))\s*$/i;
// "Strength 14" / "Wisdom 16+"
const ABILITY_RE = /^\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)\+?\s*$/i;
const ABILITY_KEY: Record<string, Predicate & { kind: 'ability' } extends { ability: infer A } ? A : never> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
} as const;

export function parsePrerequisite(raw: string): Predicate[] {
  // pf2e sometimes jams multiple predicates into a single entry with
  // semicolons or commas. Split on those, trim, and parse each half.
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(parsePhrase);
}

function parsePhrase(phrase: string): Predicate {
  const skill = SKILL_RANK_RE.exec(phrase);
  if (skill && skill[1] && skill[2]) {
    const rank = RANK_WORDS[skill[1].toLowerCase()];
    if (rank !== undefined) {
      return { kind: 'skill-rank', skill: skill[2].trim().toLowerCase(), min: rank };
    }
  }

  const lvl = LEVEL_RE.exec(phrase);
  if (lvl) {
    const digits = lvl[1] ?? lvl[2];
    if (digits) {
      const min = Number.parseInt(digits, 10);
      if (Number.isFinite(min)) return { kind: 'level', min };
    }
  }

  const abil = ABILITY_RE.exec(phrase);
  if (abil && abil[1] && abil[2]) {
    const ability = ABILITY_KEY[abil[1].toLowerCase()];
    const min = Number.parseInt(abil[2], 10);
    if (ability && Number.isFinite(min)) {
      return { kind: 'ability', ability, min };
    }
  }

  return { kind: 'unsupported', raw: phrase };
}
