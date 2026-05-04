// Monster projection functions — map foundry-mcp wire shapes to the
// dm-tool-native MonsterRow / MonsterResult / MonsterDetail / MonsterSummary shapes.

import type { MonsterDetail, MonsterSpellGroup, MonsterSpellInfo, MonsterSummary } from '@foundry-toolkit/shared/types';
import type { CompendiumDocument, CompendiumEmbeddedItem, CompendiumMatch } from '../types.js';
import {
  cleanDescription,
  isDefaultIcon,
  isRecord,
  readSystem,
  readPath,
  readNumber,
  readString,
  readStringArray,
  pickPortraitUrl,
  pickTokenUrl,
} from './shared.js';

// ---------------------------------------------------------------------------
// Re-exported MonsterResult / MonsterRow shapes
// ---------------------------------------------------------------------------
//
// Chat tools and the hover preview consume these shapes today from
// `packages/db/src/pf2e/compendium.ts`. We duplicate them here so the new
// layer is self-contained; the legacy module can keep its own copies until
// the consumer flip PR removes them.

export interface MonsterRow {
  name: string;
  level: number;
  source: string;
  rarity: string;
  size: string;
  creature_type: string;
  traits: string;
  perception: number;
  skills: string;
  str_mod: number;
  dex_mod: number;
  con_mod: number;
  int_mod: number;
  wis_mod: number;
  cha_mod: number;
  ac: number;
  hp: number;
  fort: number;
  ref: number;
  will: number;
  immunities: string;
  weaknesses: string;
  resistances: string;
  speed_land: number;
  speeds_other: string;
  melee: string;
  ranged: string;
  actions: string;
  description: string;
  aon_url: string;
  image_file: string | null;
  token_file: string | null;
}

export interface MonsterResult {
  name: string;
  level: number;
  source: string;
  rarity: string;
  size: string;
  traits: string[];
  hp: number;
  ac: number;
  fort: number;
  ref: number;
  will: number;
  perception: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  speed: string;
  immunities: string;
  weaknesses: string;
  resistances: string;
  melee: string;
  ranged: string;
  abilities: string;
  description: string;
  aon_url: string;
}

// ---------------------------------------------------------------------------
// Monster attack / action / speed formatters (ported from compendium.ts)
// ---------------------------------------------------------------------------
//
// Input shapes from PF2e system (arrays of structured objects, not
// JSON-serialized strings like in pf2e.db).

interface WireAttack {
  name?: unknown;
  bonus?: unknown;
  damage?: unknown;
  traits?: unknown;
}

interface WireDamage {
  formula?: unknown;
  type?: unknown;
  category?: unknown;
}

function readAttackList(v: unknown): WireAttack[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

function formatAttackList(raw: unknown): string {
  const attacks = readAttackList(raw);
  return attacks
    .map((a) => {
      const name = readString(a.name);
      const bonus = readNumber(a.bonus);
      const traitsArr = readStringArray(a.traits);
      const traits = traitsArr.length > 0 ? ` (${traitsArr.join(', ')})` : '';
      const damageRaw = Array.isArray(a.damage) ? a.damage.filter(isRecord) : [];
      const dmg = damageRaw
        .map((d: WireDamage) => {
          const formula = readString(d.formula);
          const type = readString(d.type);
          const category = readString(d.category);
          return `${formula} ${type}${category === 'persistent' ? ' persistent' : ''}`;
        })
        .join(' plus ');
      return `◆ ${name} +${bonus.toString()}${traits}, Damage ${dmg}`;
    })
    .join('; ');
}

export const formatMelee = formatAttackList;
const formatRanged = formatAttackList;

// ---------------------------------------------------------------------------
// PF2e processed-actor strike format
// ---------------------------------------------------------------------------
//
// When the mcp cache warms a compendium pack it stores the full processed
// PF2e actor document (the Foundry-hydrated shape, not the raw pack JSON).
// Strikes live in `system.actions[]` as flat objects with:
//   { type: "strike", attackRollType: "PF2E.NPCAttackMelee"|"…Ranged",
//     label: string, totalModifier: number,
//     traits: [{ name: string, label: string }],
//     item: { system: { damageRolls: { <id>: { damage, damageType, category } } } } }
//
// This is distinct from the legacy test-fixture shape (system.actions.melee[])
// used when the bridge serialises raw pack JSON.

function formatPf2eStrikes(actions: unknown, attackRollType: string): string {
  if (!Array.isArray(actions)) return '';
  return actions
    .filter(
      (a): a is Record<string, unknown> =>
        isRecord(a) && readString(a.type) === 'strike' && readString(a.attackRollType) === attackRollType,
    )
    .map((strike) => {
      const name = readString(strike.label);
      const mod = readNumber(strike.totalModifier);
      const sign = mod >= 0 ? '+' : '';

      // Traits: array of { name, label } objects; skip the generic "attack" tag.
      const traitObjs = Array.isArray(strike.traits) ? strike.traits.filter(isRecord) : [];
      const traitNames = traitObjs.map((t) => readString(t.name)).filter((n) => n.length > 0 && n !== 'attack');
      const traitsStr = traitNames.length > 0 ? ` (${traitNames.join(', ')})` : '';

      // Damage: item.system.damageRolls is a keyed object, one entry per roll.
      const itemSys = isRecord(strike.item) ? readPath(strike.item as Record<string, unknown>, ['system']) : null;
      const dmgRolls = isRecord(itemSys) && isRecord(itemSys.damageRolls) ? itemSys.damageRolls : null;
      let dmgStr = '';
      if (dmgRolls) {
        dmgStr = Object.values(dmgRolls)
          .filter(isRecord)
          .map((r) => {
            const formula = readString(r.damage);
            const type = readString(r.damageType);
            const category = readString(r.category);
            return `${formula} ${type}${category === 'persistent' ? ' persistent' : ''}`.trim();
          })
          .join(' plus ');
      }

      return `◆ ${name} ${sign}${mod.toString()}${traitsStr}, Damage ${dmgStr}`;
    })
    .join('; ');
}

interface WireAction {
  name?: unknown;
  action_type?: unknown;
  actionType?: unknown;
  actions?: unknown;
  traits?: unknown;
  description?: unknown;
}

export function formatActions(raw: unknown): string {
  const items: WireAction[] = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return items
    .map((a) => {
      const name = readString(a.name);
      // Accept either camelCase (`actionType`) or snake_case (`action_type`)
      // to stay tolerant of both the legacy DB shape and anything a new
      // wire contract might surface.
      const actionType = readString(a.action_type ?? a.actionType);
      const actions = typeof a.actions === 'number' ? a.actions : null;
      const traitsArr = readStringArray(a.traits);
      const description = readString(a.description);

      const actionCost =
        actionType === 'passive'
          ? ''
          : actions === 1
            ? '◆ '
            : actions === 2
              ? '◆◆ '
              : actions === 3
                ? '◆◆◆ '
                : actionType === 'reaction'
                  ? '⟳ '
                  : actionType === 'free'
                    ? '◇ '
                    : '';
      const traits = traitsArr.length > 0 ? ` (${traitsArr.join(', ')})` : '';
      const desc = cleanDescription(description);
      return `${actionCost}${name}${traits} ${desc}`;
    })
    .join('\n');
}

interface WireTyped {
  type?: unknown;
  value?: unknown;
}

export function formatImmunities(raw: unknown): string {
  const items: WireTyped[] = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return items
    .map((i) => readString(i.type))
    .filter(Boolean)
    .join(', ');
}

export function formatWeaknesses(raw: unknown): string {
  const items: WireTyped[] = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return items
    .map((w) => `${readString(w.type)} ${readNumber(w.value).toString()}`)
    .filter((s) => s.trim().length > 0 && !s.startsWith(' '))
    .join(', ');
}

export function formatSpeed(system: Record<string, unknown>): string {
  // Legacy / simplified shape: system.attributes.speed.value (land) +
  // system.attributes.speed.otherSpeeds[].
  const attrSpeed = readPath(system, ['attributes', 'speed']);
  if (isRecord(attrSpeed)) {
    const land = readNumber(attrSpeed.value);
    const parts: string[] = [];
    if (land > 0) parts.push(`${land.toString()} feet`);
    const other = Array.isArray(attrSpeed.otherSpeeds) ? attrSpeed.otherSpeeds.filter(isRecord) : [];
    for (const s of other) {
      const type = readString(s.type);
      const value = readNumber(s.value);
      if (type) parts.push(`${type} ${value.toString()} feet`);
    }
    return parts.join(', ');
  }

  // PF2e processed shape: system.movement.speeds.{ land, burrow, climb, fly, swim }
  // each entry is null (not available) or { value: number }.
  const movSpeeds = readPath(system, ['movement', 'speeds']);
  if (isRecord(movSpeeds)) {
    const parts: string[] = [];
    const SPEED_KEYS = ['land', 'burrow', 'climb', 'fly', 'swim'] as const;
    for (const key of SPEED_KEYS) {
      const entry = movSpeeds[key];
      if (!isRecord(entry)) continue;
      const val = readNumber(entry.value);
      if (val <= 0) continue;
      parts.push(key === 'land' ? `${val.toString()} feet` : `${key} ${val.toString()} feet`);
    }
    return parts.join(', ');
  }

  return '';
}

// ---------------------------------------------------------------------------
// Creature-type detection
// ---------------------------------------------------------------------------

const KNOWN_CREATURE_TYPES = new Set([
  'aberration',
  'animal',
  'astral',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'dream',
  'elemental',
  'ethereal',
  'fey',
  'fiend',
  'fungus',
  'giant',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'shade',
  'spirit',
  'time',
  'undead',
]);

function inferCreatureType(system: Record<string, unknown>): string {
  // Prefer the explicit details.creatureType / creatureType fields.
  const direct = readPath(system, ['details', 'creatureType']);
  if (typeof direct === 'string' && direct.length > 0) return direct;

  // Fall back to scanning traits.value for a known creature-type tag.
  const traits = readStringArray(readPath(system, ['traits', 'value']));
  for (const t of traits) {
    if (KNOWN_CREATURE_TYPES.has(t.toLowerCase())) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Monster-level extractors — each reads one slice of system.*
// ---------------------------------------------------------------------------

function monsterName(doc: CompendiumDocument): string {
  return doc.name;
}

function monsterLevel(system: Record<string, unknown>): number {
  // Actors: system.details.level.value; a few modules mistakenly populate
  // system.level.value even on actor docs, so accept that as a fallback.
  const actorLevel = readPath(system, ['details', 'level', 'value']);
  if (typeof actorLevel === 'number') return actorLevel;
  const fallback = readPath(system, ['level', 'value']);
  return readNumber(fallback);
}

function monsterRarity(system: Record<string, unknown>): string {
  const rarity = readPath(system, ['traits', 'rarity']);
  return readString(rarity, 'common');
}

function monsterSize(system: Record<string, unknown>): string {
  const size = readPath(system, ['traits', 'size', 'value']);
  return readString(size);
}

function monsterTraits(system: Record<string, unknown>): string[] {
  return readStringArray(readPath(system, ['traits', 'value']));
}

function monsterSource(system: Record<string, unknown>): string {
  return readString(readPath(system, ['publication', 'title']));
}

function monsterHp(system: Record<string, unknown>): number {
  return readNumber(readPath(system, ['attributes', 'hp', 'max']));
}

function monsterAc(system: Record<string, unknown>): number {
  return readNumber(readPath(system, ['attributes', 'ac', 'value']));
}

function monsterSaves(system: Record<string, unknown>): { fort: number; ref: number; will: number } {
  return {
    fort: readNumber(readPath(system, ['saves', 'fortitude', 'value'])),
    ref: readNumber(readPath(system, ['saves', 'reflex', 'value'])),
    will: readNumber(readPath(system, ['saves', 'will', 'value'])),
  };
}

function monsterPerception(system: Record<string, unknown>): number {
  return readNumber(readPath(system, ['perception', 'mod']));
}

function monsterAbilityMod(system: Record<string, unknown>, ability: string): number {
  return readNumber(readPath(system, ['abilities', ability, 'mod']));
}

function monsterDescription(system: Record<string, unknown>): string {
  return cleanDescription(
    readString(readPath(system, ['details', 'publicNotes'])) ||
      readString(readPath(system, ['details', 'description'])) ||
      readString(readPath(system, ['description', 'value'])),
  );
}

function monsterSkills(system: Record<string, unknown>): string {
  // PF2e actors surface skills as system.skills.<slug>.base (number). We
  // produce a flat "Stealth +12, Arcana +8" style string matching the
  // legacy column format.
  const skills = readPath(system, ['skills']);
  if (!isRecord(skills)) return '';
  const parts: string[] = [];
  for (const [slug, raw] of Object.entries(skills)) {
    if (!isRecord(raw)) continue;
    const mod = readNumber(raw.base ?? raw.mod ?? raw.value);
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    const sign = mod >= 0 ? '+' : '';
    parts.push(`${name} ${sign}${mod.toString()}`);
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Spell list formatter
// ---------------------------------------------------------------------------
//
// PF2e spellcasting data lives in the document's embedded `items` array
// (not in `system`). Each spellcasting tradition is a `spellcastingEntry`
// item that links to `spell` items via `spell.system.location.value`.
//
// Wire shape (from getCompendiumDocumentHandler):
//   spellcastingEntry.system.tradition.value  — "arcane"|"divine"|"occult"|"primal"
//   spellcastingEntry.system.prepared.value   — "prepared"|"spontaneous"|"innate"|"focus"
//   spellcastingEntry.system.spelldc.dc        — DC number
//   spellcastingEntry.system.spelldc.value     — spell attack bonus
//   spell.system.level.value                   — 0=cantrip, 1-10=spell level
//   spell.system.location.value                — ID of the spellcastingEntry
//   spell.system.location.uses.max             — charges for innate spells
//   spell.system.location.heightenedLevel      — if heightened to a different level

const RARITY_SPELL_TRAITS = new Set(['common', 'uncommon', 'rare', 'unique']);

export function monsterSpells(items: CompendiumEmbeddedItem[] | undefined): MonsterSpellGroup[] {
  if (!items || items.length === 0) return [];

  // Build index of spellcasting entries by their ID.
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
    const id = item.id;
    if (!id) continue;
    entries.set(id, {
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

  // Group spell info objects by entry ID then by effective rank.
  interface SpellInfoByEntry {
    [entryId: string]: Map<number, MonsterSpellInfo[]>;
  }
  const spellsByEntry: SpellInfoByEntry = {};

  for (const item of items) {
    if (item.type !== 'spell') continue;
    const sys = item.system;
    const entryId = readString(readPath(sys, ['location', 'value']));
    if (!entryId || !entries.has(entryId)) continue;

    // Effective rank: heightened level when set, otherwise base level.
    const baseLevel = readNumber(readPath(sys, ['level', 'value']));
    const heightened = readPath(sys, ['location', 'heightenedLevel']);
    const rank = typeof heightened === 'number' ? heightened : baseLevel;

    // usesPerDay for innate spells.
    const usesMax = readPath(sys, ['location', 'uses', 'max']);
    const usesPerDay = typeof usesMax === 'number' && usesMax > 0 ? usesMax : undefined;

    // Cast time.
    const castTime = readString(readPath(sys, ['time', 'value']));

    // Range.
    const range = readString(readPath(sys, ['range', 'value']));

    // Area: format as "15-foot emanation" if present.
    const areaValue = readPath(sys, ['area', 'value']);
    const areaType = readPath(sys, ['area', 'type']);
    const area =
      typeof areaValue === 'number' && typeof areaType === 'string' && areaType.length > 0
        ? `${areaValue.toString()}-foot ${areaType}`
        : '';

    // Target.
    const target = readString(readPath(sys, ['target', 'value']));

    // Traits: filter out rarity tags.
    const allTraits = readStringArray(readPath(sys, ['traits', 'value']));
    const traits = allTraits.filter((t) => !RARITY_SPELL_TRAITS.has(t.toLowerCase()));

    // Description.
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

    // Sort ranks: cantrips (0) first, then ascending.
    const ranks = [...byRank.keys()].sort((a, b) => a - b).map((rank) => ({ rank, spells: byRank.get(rank)! }));

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
// Monster projections (doc → {row, result, detail, summary})
// ---------------------------------------------------------------------------

export function monsterDocToResult(doc: CompendiumDocument): MonsterResult {
  const system = readSystem(doc);
  const saves = monsterSaves(system);

  // Two action-data shapes come off the wire:
  //
  //   Legacy (raw pack JSON serialised by the bridge):
  //     system.actions = { melee: [{name, bonus, damage, traits}], ranged: [...] }
  //
  //   PF2e processed (mcp cache dumps the fully-hydrated actor):
  //     system.actions = [{type:"strike", attackRollType:"PF2E.NPCAttackMelee"|"…Ranged",
  //                        label, totalModifier, traits:[{name}], item:{system:{damageRolls}}}]
  //
  // Detect by whether system.actions is a plain array (processed) or an
  // object with sub-arrays (legacy).
  const actionsRaw = readPath(system, ['actions']);
  const isPf2eProcessed = Array.isArray(actionsRaw);

  const meleeStr = isPf2eProcessed
    ? formatPf2eStrikes(actionsRaw, 'PF2E.NPCAttackMelee')
    : formatMelee(readPath(system, ['actions', 'melee']) ?? []);

  const rangedStr = isPf2eProcessed
    ? formatPf2eStrikes(actionsRaw, 'PF2E.NPCAttackRanged')
    : formatRanged(readPath(system, ['actions', 'ranged']) ?? []);

  // Passive abilities: in the processed shape, passive abilities (reactions,
  // free actions, non-strike specials) are embedded items not surfaced in
  // system.actions — fall back to the legacy details.actions path.
  const passiveRaw = isPf2eProcessed ? (readPath(system, ['details', 'actions']) ?? []) : (actionsRaw ?? []);

  const immunities = readPath(system, ['attributes', 'immunities']);
  const weaknesses = readPath(system, ['attributes', 'weaknesses']);
  const resistances = readPath(system, ['attributes', 'resistances']);

  return {
    name: monsterName(doc),
    level: monsterLevel(system),
    source: monsterSource(system),
    rarity: monsterRarity(system),
    size: monsterSize(system),
    traits: monsterTraits(system),
    hp: monsterHp(system),
    ac: monsterAc(system),
    fort: saves.fort,
    ref: saves.ref,
    will: saves.will,
    perception: monsterPerception(system),
    str: monsterAbilityMod(system, 'str'),
    dex: monsterAbilityMod(system, 'dex'),
    con: monsterAbilityMod(system, 'con'),
    int: monsterAbilityMod(system, 'int'),
    wis: monsterAbilityMod(system, 'wis'),
    cha: monsterAbilityMod(system, 'cha'),
    speed: formatSpeed(system),
    immunities: formatImmunities(immunities),
    weaknesses: formatWeaknesses(weaknesses),
    resistances: formatWeaknesses(resistances),
    melee: meleeStr,
    ranged: rangedStr,
    abilities: Array.isArray(passiveRaw) ? formatActions(passiveRaw) : '',
    description: monsterDescription(system),
    aon_url: '',
  };
}

export function monsterDocToRow(doc: CompendiumDocument): MonsterRow {
  const r = monsterDocToResult(doc);
  const system = readSystem(doc);
  // Row shape mirrors the legacy DB row one-to-one. It's primarily used by
  // the loot generator (which wants cheap access to raw fields) and as an
  // intermediate step for tests that want to verify the DB-shape fidelity.
  return {
    name: r.name,
    level: r.level,
    source: r.source,
    rarity: r.rarity,
    size: r.size,
    creature_type: inferCreatureType(system),
    traits: JSON.stringify(r.traits),
    perception: r.perception,
    skills: monsterSkills(system),
    str_mod: r.str,
    dex_mod: r.dex,
    con_mod: r.con,
    int_mod: r.int,
    wis_mod: r.wis,
    cha_mod: r.cha,
    ac: r.ac,
    hp: r.hp,
    fort: r.fort,
    ref: r.ref,
    will: r.will,
    immunities: r.immunities,
    weaknesses: r.weaknesses,
    resistances: r.resistances,
    speed_land: readNumber(readPath(system, ['attributes', 'speed', 'value'])),
    speeds_other: JSON.stringify(
      Array.isArray(readPath(system, ['attributes', 'speed', 'otherSpeeds']))
        ? readPath(system, ['attributes', 'speed', 'otherSpeeds'])
        : [],
    ),
    melee: r.melee,
    ranged: r.ranged,
    actions: r.abilities,
    description: r.description,
    aon_url: r.aon_url,
    image_file: pickPortraitUrl(doc),
    token_file: pickTokenUrl(doc),
  };
}

export function monsterDocToDetail(doc: CompendiumDocument): MonsterDetail {
  const r = monsterDocToResult(doc);
  const system = readSystem(doc);
  return {
    name: r.name,
    level: r.level,
    source: r.source,
    rarity: r.rarity,
    size: r.size,
    traits: r.traits,
    hp: r.hp,
    ac: r.ac,
    fort: r.fort,
    ref: r.ref,
    will: r.will,
    perception: r.perception,
    skills: monsterSkills(system),
    str: r.str,
    dex: r.dex,
    con: r.con,
    int: r.int,
    wis: r.wis,
    cha: r.cha,
    speed: r.speed,
    immunities: r.immunities,
    weaknesses: r.weaknesses,
    resistances: r.resistances,
    melee: r.melee,
    ranged: r.ranged,
    abilities: r.abilities,
    spells: monsterSpells(doc.items),
    description: r.description,
    aonUrl: r.aon_url,
    imageUrl: pickPortraitUrl(doc),
    tokenUrl: pickTokenUrl(doc),
  };
}

export function monsterDocToSummary(doc: CompendiumDocument): MonsterSummary {
  const system = readSystem(doc);
  const saves = monsterSaves(system);
  return {
    name: monsterName(doc),
    level: monsterLevel(system),
    hp: monsterHp(system),
    ac: monsterAc(system),
    fort: saves.fort,
    ref: saves.ref,
    will: saves.will,
    rarity: monsterRarity(system),
    size: monsterSize(system),
    creatureType: inferCreatureType(system),
    traits: monsterTraits(system),
    source: monsterSource(system),
    aonUrl: '',
    tokenUrl: pickTokenUrl(doc),
  };
}

/** Lean path — skip the full doc fetch and use whatever the match already
 *  surfaces. When the mcp server serves from its warm cache it populates
 *  hp/ac/fort/ref/will/rarity/size/creatureType/source on the match row; we
 *  read those here so the Monster Browser grid shows real stats without a
 *  per-card document fetch. Fields absent on the match (bridge-fallback /
 *  cache-cold path) fall back to safe defaults — callers that need guaranteed
 *  full stat blocks should use `monsterDocToDetail` instead. */
export function monsterMatchToSummary(m: CompendiumMatch): MonsterSummary {
  return {
    name: m.name,
    level: m.level ?? 0,
    hp: m.hp ?? 0,
    ac: m.ac ?? 0,
    fort: m.fort ?? 0,
    ref: m.ref ?? 0,
    will: m.will ?? 0,
    rarity: m.rarity ?? 'common',
    size: m.size ?? '',
    creatureType: m.creatureType ?? '',
    traits: m.traits ?? [],
    source: m.source ?? '',
    aonUrl: '',
    tokenUrl: m.img && !isDefaultIcon(m.img) ? m.img : null,
  };
}
