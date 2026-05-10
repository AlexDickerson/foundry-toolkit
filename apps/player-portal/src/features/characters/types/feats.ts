import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

// Common categories are 'ancestry' | 'class' | 'classfeature' | 'skill' |
// 'general' | 'bonus' | 'pfsboon'. Kept as `string` so custom categories
// from modules or future pf2e updates don't fail the type.
export type FeatCategory = string;

export interface FeatItemSystem {
  slug: string | null;
  level: { value: number; taken?: number | null };
  category: FeatCategory;
  traits: { value: string[]; rarity: string; otherTags?: string[] };
  prerequisites?: { value: Array<{ value: string }> };
  description?: { value: string };
  location?: string | null;
  // Index signature lets FeatItem be a subtype of PreparedActorItem
  // (whose `system` is Record<string, unknown>) while keeping the
  // declared fields above strongly typed at consumer sites.
  [key: string]: unknown;
}

export interface FeatItem {
  id: string;
  name: string;
  type: 'feat';
  img: string;
  system: FeatItemSystem;
}

export function isFeatItem(item: PreparedActorItem): item is FeatItem {
  return item.type === 'feat';
}
