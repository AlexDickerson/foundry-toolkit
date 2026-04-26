import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

export type ActionKind = 'action' | 'reaction' | 'free' | 'passive';

export interface ActionItemSystem {
  slug: string | null;
  actionType: { value: ActionKind };
  actions: { value: number | null }; // 1-3 for "action", null for "reaction"/"free"/"passive"
  category?: string; // "offensive" | "defensive" | "interaction" | ...
  description?: { value: string };
  traits: { value: string[]; rarity?: string; otherTags?: string[] };
  frequency?: unknown;
  selfEffect?: unknown;
  [key: string]: unknown;
}

export interface ActionItem {
  id: string;
  name: string;
  type: 'action';
  img: string;
  system: ActionItemSystem;
}

export function isActionItem(item: PreparedActorItem): item is ActionItem {
  return item.type === 'action';
}
