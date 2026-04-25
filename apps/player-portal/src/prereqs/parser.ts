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

// "trained in Athletics" / "expert in Medicine" / "master at Deception"
const SKILL_RANK_RE = /^\s*(trained|expert|master|legendary)\s+(?:in|at)\s+([A-Za-z][A-Za-z\s-]*?)\s*$/i;
// "5th level" / "Level 5" / "level 5"
const LEVEL_RE = /^\s*(?:(\d+)(?:st|nd|rd|th)?\s+level|level\s+(\d+))\s*$/i;
// "Strength 14" / "Wisdom 16+" (score)
const ABILITY_RE = /^\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)\+?\s*$/i;
// "Charisma +3" (modifier). Stored as score = 10 + 2*mod so the existing ability evaluator applies.
const ABILITY_MOD_RE = /^\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+\+(\d+)\s*$/i;
const ABILITY_KEY: Record<string, Predicate & { kind: 'ability' } extends { ability: infer A } ? A : never> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
} as const;

// Normalises a skill name from a prereq string to match character-context map
// keys: lowercase + hyphens replaced with spaces, mirroring the normalisation
// applied to pf2e slugs ("hero-god-lore" → "hero god lore").
const normSkill = (s: string): string => s.toLowerCase().replace(/-/g, ' ');

// "trained in at least one skill" / "trained in any skill" / "trained at any skill"
const SKILL_RANK_ANY_RE = /^\s*(trained|expert|master|legendary)\s+(?:in|at)\s+(?:at\s+least\s+one|any)\s+skill\s*$/i;
// Captures "rank in/at <rest>" so we can detect or-lists before comma-splitting mangles them
const SKILL_RANK_IN_RE = /^\s*(trained|expert|master|legendary)\s+(?:in|at)\s+(.+?)\s*$/i;

export function parsePrerequisite(raw: string): Predicate[] {
  // Try whole-string patterns first — some prereqs contain commas or "or"/"and"
  // as part of the predicate itself, so we must not split on commas before
  // we've had a chance to detect them.
  const whole = parseWholePhrase(raw.trim());
  if (whole !== null) return whole;

  // pf2e sometimes jams multiple predicates into a single entry with
  // semicolons or commas. Split on those, trim, and parse each half.
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(parsePhrase);
}

// Returns Predicate[] (possibly multi-element for AND lists) or null when
// no whole-phrase pattern matches and the caller should fall back to splitting.
function parseWholePhrase(phrase: string): Predicate[] | null {
  // "trained in at least one skill" / "trained at any skill"
  const anySkill = SKILL_RANK_ANY_RE.exec(phrase);
  if (anySkill?.[1]) {
    const rank = RANK_WORDS[anySkill[1].toLowerCase()];
    if (rank !== undefined) return [{ kind: 'skill-rank-any', min: rank }];
  }

  const rankIn = SKILL_RANK_IN_RE.exec(phrase);
  if (rankIn?.[1] && rankIn[2]) {
    const rank = RANK_WORDS[rankIn[1].toLowerCase()];
    if (rank === undefined) return null;
    const rest = rankIn[2].trim();

    // OR list: "rank in S1 or S2" / "rank in S1, S2, or S3"
    // Also handles "a Lore skill" wildcard within the list.
    if (/\bor\b/i.test(rest)) {
      const rawItems = parseSkillOrList(rest);
      const skills: string[] = [];
      let hasLoreWildcard = false;
      for (const item of rawItems) {
        // "a Lore skill" / "any Lore skill" / bare "Lore" (no topic) all mean
        // "any lore skill the character has at the required rank".
        if (/^(?:a|any)\s+lore\s+skill$/i.test(item) || /^lore$/i.test(item)) {
          hasLoreWildcard = true;
        } else {
          skills.push(item);
        }
      }
      if (hasLoreWildcard) {
        // "rank in S1, S2, or a Lore skill" → any specific OR any lore skill
        if (skills.length === 0) return [{ kind: 'skill-rank-any-lore', min: rank }];
        return [{ kind: 'skill-rank-any-of-or-lore', skills, min: rank }];
      }
      if (skills.length >= 2) return [{ kind: 'skill-rank-any-of', skills, min: rank }];
    }

    // AND list: "rank in S1 and S2 [and S3 ...]" — returns one skill-rank
    // predicate per skill; evaluateAll's AND semantics does the rest.
    // Guard: rest must contain only word chars, spaces, and hyphens so we
    // don't misparse "… and Strength 14" or semicolon-joined strings.
    if (/\band\b/i.test(rest) && !/\bor\b/i.test(rest)) {
      const parts = rest
        .split(/\s+and\s+/i)
        .map((s) => normSkill(s.trim()))
        .filter(Boolean);
      if (parts.length >= 2 && parts.every((s) => /^[a-z][a-z\s-]*$/.test(s))) {
        return parts.map((s) => ({ kind: 'skill-rank' as const, skill: s, min: rank }));
      }
    }

    // Standalone lore wildcard: "trained in a Lore skill" / "trained in Lore"
    if (/^(?:a|any)\s+lore\s+skill$/i.test(rest) || /^lore$/i.test(rest)) {
      return [{ kind: 'skill-rank-any-lore', min: rank }];
    }
  }

  return null;
}

// Splits "Arcana, Nature, Occultism, or Religion" or "Occultism or Religion"
// into ["arcana", "nature", "occultism", "religion"]. Hyphens are normalised
// to spaces so "Hero-God Lore" matches the slug "hero-god-lore" → "hero god lore".
function parseSkillOrList(raw: string): string[] {
  return raw
    .replace(/,\s*or\s+/gi, ' or ')
    .split(/\s+or\s+|,\s*/i)
    .map((s) => normSkill(s.trim()))
    .filter((s) => s.length > 0 && /^[a-z]/i.test(s));
}

function parsePhrase(phrase: string): Predicate {
  const skill = SKILL_RANK_RE.exec(phrase);
  if (skill && skill[1] && skill[2]) {
    const rank = RANK_WORDS[skill[1].toLowerCase()];
    if (rank !== undefined) {
      return { kind: 'skill-rank', skill: normSkill(skill[2].trim()), min: rank };
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

  const abilMod = ABILITY_MOD_RE.exec(phrase);
  if (abilMod && abilMod[1] && abilMod[2]) {
    const ability = ABILITY_KEY[abilMod[1].toLowerCase()];
    const mod = Number.parseInt(abilMod[2], 10);
    if (ability && Number.isFinite(mod)) {
      return { kind: 'ability', ability, min: 10 + 2 * mod };
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

  // Title-cased phrases that match no other pattern are treated as feat/feature
  // names. The evaluator returns 'meets' if the character owns the item, 'fails'
  // if not — upgrading these from 'unknown' to a real gate.
  if (/^[A-Z][A-Za-z\s'-]*$/.test(phrase.trim())) {
    return { kind: 'feat', name: phrase.trim() };
  }

  return { kind: 'unsupported', raw: phrase };
}
