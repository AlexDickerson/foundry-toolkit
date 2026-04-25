// Project a PreparedActor (fetched live from Foundry) into the
// PlayerActorDetail shape consumed by CombatantStatBlock's PC detail pane.
//
// Extracts combat-relevant actions (non-passive) and spell groups,
// mirroring the monsterSpells + action extraction in projection.ts but
// operating on PreparedActorItem[] instead of CompendiumEmbeddedItem[].

import type { PreparedActor } from '@foundry-toolkit/shared/foundry-api';
import type {
  MonsterSpellGroup,
  MonsterSpellInfo,
  MonsterSpellRank,
  PlayerAction,
  PlayerActorDetail,
} from '@foundry-toolkit/shared/types';
import { cleanDescription } from './projection.js';

// ---------------------------------------------------------------------------
// Narrow readers (mirrors the unexported helpers in projection.ts)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function readNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------------------
// Spell extraction
// ---------------------------------------------------------------------------

const RARITY_SPELL_TRAITS = new Set(['common', 'uncommon', 'rare', 'unique']);

function extractSpellGroups(items: PreparedActor['items']): MonsterSpellGroup[] {
  interface EntryInfo {
    name: string;
    tradition: string;
    castingType: string;
    dc?: number;
    attack?: number;
  }

  const entries = new Map<string, EntryInfo>();
  for (const item of items) {
    if (item.type !== 'spellcastingEntry') continue;
    const sys = item.system;
    entries.set(item.id, {
      name: item.name,
      tradition: readString(readPath(sys, ['tradition', 'value'])),
      castingType: readString(readPath(sys, ['prepared', 'value'])),
      dc: (() => {
        const v = readPath(sys, ['spelldc', 'dc']);
        return typeof v === 'number' && v > 0 ? v : undefined;
      })(),
      attack: (() => {
        const v = readPath(sys, ['spelldc', 'value']);
        return typeof v === 'number' && v !== 0 ? v : undefined;
      })(),
    });
  }
  if (entries.size === 0) return [];

  const spellsByEntry: Record<string, Map<number, MonsterSpellInfo[]>> = {};

  for (const item of items) {
    if (item.type !== 'spell') continue;
    const sys = item.system;
    const entryId = readString(readPath(sys, ['location', 'value']));
    if (!entryId || !entries.has(entryId)) continue;

    const baseLevel = readNumber(readPath(sys, ['level', 'value']));
    const heightened = readPath(sys, ['location', 'heightenedLevel']);
    const rank = typeof heightened === 'number' ? heightened : baseLevel;

    const usesMax = readPath(sys, ['location', 'uses', 'max']);
    const usesPerDay = typeof usesMax === 'number' && usesMax > 0 ? usesMax : undefined;

    const castTime = readString(readPath(sys, ['time', 'value']));
    const range = readString(readPath(sys, ['range', 'value']));

    const areaValue = readPath(sys, ['area', 'value']);
    const areaType = readPath(sys, ['area', 'type']);
    const area =
      typeof areaValue === 'number' && typeof areaType === 'string' && areaType.length > 0
        ? `${areaValue.toString()}-foot ${areaType}`
        : '';

    const target = readString(readPath(sys, ['target', 'value']));
    const allTraits = readStringArray(readPath(sys, ['traits', 'value']));
    const traits = allTraits.filter((t) => !RARITY_SPELL_TRAITS.has(t.toLowerCase()));
    const description = cleanDescription(readString(readPath(sys, ['description', 'value'])));

    if (!spellsByEntry[entryId]) spellsByEntry[entryId] = new Map();
    const byRank = spellsByEntry[entryId];
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank)!.push({ name: item.name, rank, usesPerDay, castTime, range, area, target, traits, description });
  }

  const groups: MonsterSpellGroup[] = [];
  for (const [entryId, entry] of entries) {
    const byRank = spellsByEntry[entryId];
    if (!byRank || byRank.size === 0) continue;

    const ranks: MonsterSpellRank[] = [...byRank.keys()]
      .sort((a, b) => a - b)
      .map((rank) => ({ rank, spells: byRank.get(rank)! }));

    groups.push({
      entryName: entry.name,
      tradition: entry.tradition,
      castingType: entry.castingType,
      dc: entry.dc,
      attack: entry.attack,
      ranks,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Action extraction
// ---------------------------------------------------------------------------

const ACTION_TYPE_ORDER: Record<string, number> = {
  reaction: 0,
  free: 1,
  action: 2,
};

function sortActions(a: PlayerAction, b: PlayerAction): number {
  const ao = ACTION_TYPE_ORDER[a.actionType] ?? 3;
  const bo = ACTION_TYPE_ORDER[b.actionType] ?? 3;
  if (ao !== bo) return ao - bo;
  return (a.actionCost ?? 1) - (b.actionCost ?? 1);
}

function extractActions(items: PreparedActor['items']): PlayerAction[] {
  const actions: PlayerAction[] = [];

  for (const item of items) {
    if (item.type !== 'action') continue;
    const sys = item.system;
    const actionType = readString(readPath(sys, ['actionType', 'value']));
    if (!actionType || actionType === 'passive') continue;

    const rawCost = readPath(sys, ['actions', 'value']);
    const actionCost = actionType === 'action' && typeof rawCost === 'number' && rawCost > 0 ? rawCost : undefined;
    const traits = readStringArray(readPath(sys, ['traits', 'value']));
    const description = cleanDescription(readString(readPath(sys, ['description', 'value'])));

    actions.push({ name: item.name, actionType, actionCost, traits, description });
  }

  return actions.sort(sortActions);
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

export function pcActorToDetail(actor: PreparedActor): PlayerActorDetail {
  return {
    id: actor.id,
    name: actor.name,
    actions: extractActions(actor.items ?? []),
    spellGroups: extractSpellGroups(actor.items ?? []),
  };
}
