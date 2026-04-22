import type { AbilityKey, ProficiencyRank } from '../api/types';

// Structured view of a pf2e prerequisite. The parser reduces free-text
// `system.prerequisites.value` entries (and, when pf2e provides them,
// structured `system.prerequisites.predicate` arrays) to this ADT; the
// evaluator is a switch over `kind`.
//
// When a new prereq category shows up in play, the extension is:
//   1. Add a variant here
//   2. Add a pattern in parser.ts (or a structured-predicate mapping)
//   3. Add a case in evaluator.ts
// Nothing else should need to touch prereq logic.
export type Predicate =
  | { kind: 'skill-rank'; skill: string; min: ProficiencyRank }
  | { kind: 'feat'; name: string }
  | { kind: 'ancestry'; slug: string }
  | { kind: 'class'; slug: string }
  | { kind: 'ability'; ability: AbilityKey; min: number }
  | { kind: 'level'; min: number }
  // Honest escape hatch. The evaluator returns `unknown` for these,
  // so the UI defaults to letting the result through rather than
  // miscategorising it.
  | { kind: 'unsupported'; raw: string };

// Three-state: we'd rather be honest about parse gaps than guess.
// `unknown` is always allowed through filters.
export type Evaluation = 'meets' | 'fails' | 'unknown';

// Flat, evaluator-friendly view of the character. Extract once per
// picker open via `fromPreparedCharacter` and pass to the evaluator.
// Keys here are the ones predicates actually read — don't bloat.
export interface CharacterContext {
  level: number;
  classTrait?: string; // e.g. 'barbarian'
  ancestryTrait?: string; // e.g. 'human'
  /** lower-cased skill slug → rank. Includes 0 (Untrained). */
  skillRanks: Map<string, ProficiencyRank>;
  abilityMods: Record<AbilityKey, number>;
  /** Names of items the character carries that prereqs can reference —
   *  feats + class features. Case-insensitive lookups via `.has`
   *  against a lower-cased set. */
  features: Set<string>;
}
