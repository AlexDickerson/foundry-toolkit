import { ABILITY_KEYS } from '@/features/characters/types';
import type {
  AbilityKey,
  CompendiumMatch,
  ProficiencyRank,
} from '@/features/characters/types';
import type { SlotKey } from './slot';

/**
 * The runtime state of one filled progression slot. Discriminated by `kind`
 * so each variant carries the data its slot needs:
 *  - `feat` — picked from a CompendiumPicker, optionally bound to the
 *    actor-local item id once the addItemFromCompendium call returns.
 *  - `skill-increase` — chosen skill + the new rank we're advancing to.
 *  - `ability-boosts` — four ability keys (one per pf2e boost slot at the
 *    levels in ABILITY_BOOST_LEVELS).
 */
export type Pick =
  | { kind: 'feat'; match: CompendiumMatch; actorItemId?: string }
  | { kind: 'skill-increase'; skill: string; newRank: ProficiencyRank }
  | { kind: 'ability-boosts'; abilities: AbilityKey[] };

/**
 * Serialise non-feat picks into the Foundry actor flag shape. Feat picks
 * are deliberately omitted: they live as actual feat items on the actor
 * and are re-derived from `system.location` on every hydration. Only the
 * kinds Foundry doesn't encode per-slot (skill increases, ability boosts)
 * need to ride in flags so they survive a page refresh.
 *
 * Written under `flags['player-portal']['progression-picks']`.
 */
export function buildProgressionPicksFlags(
  picks: Map<SlotKey, Pick>,
): Record<string, Record<string, unknown>> {
  const blob: Record<string, unknown> = {};
  for (const [key, pick] of picks) {
    if (pick.kind !== 'feat') blob[key] = pick;
  }
  return { 'player-portal': { 'progression-picks': blob } };
}

/**
 * Deserialise one entry from the stored flag blob back into a typed Pick.
 * Returns null for any shape that doesn't match a known non-feat kind —
 * persisted state from a previous build that introduced new fields, or
 * outright corruption, both fail safely.
 */
export function parsePersistedPick(raw: unknown): Exclude<Pick, { kind: 'feat' }> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'skill-increase') {
    if (typeof obj.skill !== 'string') return null;
    const rank = obj.newRank;
    if (typeof rank !== 'number' || rank < 0 || rank > 4) return null;
    return { kind: 'skill-increase', skill: obj.skill, newRank: rank as ProficiencyRank };
  }
  if (obj.kind === 'ability-boosts') {
    if (!Array.isArray(obj.abilities)) return null;
    const abilities = (obj.abilities as unknown[]).filter(
      (a): a is AbilityKey =>
        typeof a === 'string' && (ABILITY_KEYS as readonly string[]).includes(a),
    );
    return { kind: 'ability-boosts', abilities };
  }
  return null;
}
