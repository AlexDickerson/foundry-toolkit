import type { AbilityKey, PreparedActorItem, PreparedCharacter, ProficiencyRank } from '../api/types';
import type { CharacterContext } from './types';

// Derives a predicate-evaluation context from the prepared-actor shape.
// One extraction per picker open; the result is read-only and passed
// down through props.
export function fromPreparedCharacter(actor: PreparedCharacter): CharacterContext {
  const sys = actor.system;

  const skillRanks = new Map<string, ProficiencyRank>();
  for (const [slug, stat] of Object.entries(sys.skills)) {
    skillRanks.set(slug.toLowerCase(), stat.rank);
  }

  const abilityMods: Record<AbilityKey, number> = {
    str: sys.abilities.str.mod,
    dex: sys.abilities.dex.mod,
    con: sys.abilities.con.mod,
    int: sys.abilities.int.mod,
    wis: sys.abilities.wis.mod,
    cha: sys.abilities.cha.mod,
  };

  // Features that prereqs might name by string: feats the character has
  // taken, plus class features granted by their class item. Stored
  // lower-cased for case-insensitive `has`.
  const features = new Set<string>();
  for (const item of actor.items) {
    if (isFeatLike(item)) features.add(item.name.toLowerCase());
  }
  const classItem = actor.items.find((i) => i.type === 'class');
  if (classItem) {
    const classItems = (classItem.system as { items?: Record<string, { name?: string; level?: number }> }).items ?? {};
    for (const entry of Object.values(classItems)) {
      if (typeof entry.name === 'string' && typeof entry.level === 'number' && entry.level <= sys.details.level.value) {
        features.add(entry.name.toLowerCase());
      }
    }
  }

  const ctx: CharacterContext = {
    level: sys.details.level.value,
    skillRanks,
    abilityMods,
    features,
  };
  const classSlug = (classItem?.system as { slug?: string } | undefined)?.slug;
  if (classSlug !== undefined) ctx.classTrait = classSlug;
  else if (classItem) ctx.classTrait = classItem.name.toLowerCase();
  const ancestryItem = actor.items.find((i) => i.type === 'ancestry');
  const ancestrySlug = (ancestryItem?.system as { slug?: string } | undefined)?.slug;
  if (ancestrySlug !== undefined) ctx.ancestryTrait = ancestrySlug;
  else if (ancestryItem) ctx.ancestryTrait = ancestryItem.name.toLowerCase();
  return ctx;
}

function isFeatLike(item: PreparedActorItem): boolean {
  return item.type === 'feat' || item.type === 'heritage' || item.type === 'background';
}
