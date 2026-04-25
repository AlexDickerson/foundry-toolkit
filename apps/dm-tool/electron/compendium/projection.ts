// Pure projection functions that map foundry-mcp wire shapes
// (`CompendiumDocument`, `CompendiumMatch`) to the dm-tool-native shapes
// consumed by the Monsters/Items browsers, chat tools, loot generator,
// and hover preview card.
//
// Everything here is synchronous, dependency-free (beyond pure helpers
// from `@foundry-toolkit/shared/foundry-markup`), and fully unit-testable
// against fixture documents. No I/O, no caching, no async.
//
// The PF2e system shape is documented scattered across foundry-mcp and the
// pf2e system itself; we defensively narrow every field and fall back to
// sensible defaults. The goal is structural fidelity with the output that
// the legacy `packages/db/src/pf2e/compendium.ts:rowToResult` path produces
// today, so consumer UIs don't need to change when the data source flips.
//
// Formatting helpers (formatMelee, formatRanged, formatActions, …) are
// ports of the identically-named functions in `packages/db/src/pf2e/
// compendium.ts`. The legacy functions parse JSON-serialized DB columns;
// this port reads directly from the pre-parsed `system.*` object.

import { cleanFoundryMarkup } from '@foundry-toolkit/shared/foundry-markup';
import type {
  ItemBrowserDetail,
  ItemBrowserRow,
  ItemVariant,
  MonsterDetail,
  MonsterSummary,
} from '@foundry-toolkit/shared/types';
import type { LootShortlistItem } from '@foundry-toolkit/ai/loot';
import type { CompendiumDocument, CompendiumMatch, ItemPrice } from './types.js';

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
// Foundry-markup cleaning (ported from packages/db/src/pf2e/compendium.ts)
// ---------------------------------------------------------------------------

/** Map PF2e action-glyph font characters to Unicode symbols. */
const ACTION_GLYPH: Record<string, string> = {
  '1': '◆',
  A: '◆',
  '2': '◆◆',
  D: '◆◆',
  '3': '◆◆◆',
  T: '◆◆◆',
  r: '↺',
  R: '↺',
  f: '◇',
  F: '◇',
};

/** Strip Foundry @-tags and HTML from descriptions. Ported verbatim from
 *  `packages/db/src/pf2e/compendium.ts`. */
export function cleanDescription(html: string | null | undefined): string {
  if (!html) return '';
  let text = cleanFoundryMarkup(html)
    .replace(
      /<span[^>]*class="[^"]*action-glyph[^"]*"[^>]*>([^<]*)<\/span>/gi,
      (_, ch: string) => ACTION_GLYPH[ch.trim()] ?? ch,
    )
    .replace(
      /<span[^>]*class="[^"]*pf2-icon[^"]*"[^>]*>([^<]*)<\/span>/gi,
      (_, ch: string) => ACTION_GLYPH[ch.trim()] ?? ch,
    )
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[\s>]/gi, '\n');
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<[^>]+>/g, '');
  } while (text !== prev);
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
  return text
    .replace(/&(?:nbsp|amp|lt|gt);/g, (m) => entities[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Narrow defensive readers — every field is `unknown` at the outer boundary
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readSystem(doc: CompendiumDocument): Record<string, unknown> {
  return isRecord(doc.system) ? doc.system : {};
}

function readPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function readNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
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
export const formatRanged = formatAttackList;

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
  // PF2e shape: system.attributes.speed.value (land, number) +
  // system.attributes.speed.otherSpeeds[] with { type, value }.
  const speedObj = readPath(system, ['attributes', 'speed']);
  if (!isRecord(speedObj)) return '';
  const land = readNumber(speedObj.value);
  const parts: string[] = [];
  if (land > 0) parts.push(`${land.toString()} feet`);
  const other = Array.isArray(speedObj.otherSpeeds) ? speedObj.otherSpeeds.filter(isRecord) : [];
  for (const s of other) {
    const type = readString(s.type);
    const value = readNumber(s.value);
    if (type) parts.push(`${type} ${value.toString()} feet`);
  }
  return parts.join(', ');
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

/** Return null for Foundry's generic placeholder icons — they're not
 *  real portraits and aren't worth fetching or displaying. */
function isDefaultIcon(path: string): boolean {
  return path.includes('/default-icons/');
}

/** Return the portrait path, or null if it's a default placeholder. */
function pickPortraitUrl(doc: CompendiumDocument): string | null {
  const img = doc.img;
  if (!img || isDefaultIcon(img)) return null;
  return img;
}

/** Prefer a doc-level tokenImg when the mcp bridge populates it; fall
 *  back to the portrait. See the prototypeToken bridge PR. */
function pickTokenUrl(doc: CompendiumDocument): string | null {
  const maybe = (doc as { tokenImg?: unknown }).tokenImg;
  if (typeof maybe === 'string' && maybe.length > 0 && !isDefaultIcon(maybe)) return maybe;
  // TODO(compendium-migration): once bridge PR landing prototypeToken
  // merges, this fallback can be removed — `tokenImg` will always be
  // present on actor docs and we'll surface null when it's genuinely
  // missing (unlike the portrait, which every doc has).
  return pickPortraitUrl(doc);
}

// ---------------------------------------------------------------------------
// Monster projections (doc → {row, result, detail, summary})
// ---------------------------------------------------------------------------

export function monsterDocToResult(doc: CompendiumDocument): MonsterResult {
  const system = readSystem(doc);
  const saves = monsterSaves(system);
  const melee = readPath(system, ['actions', 'melee']) ?? [];
  const ranged = readPath(system, ['actions', 'ranged']) ?? [];
  // pf2e stores actions as embedded items with type='action'. The wire
  // contract may flatten them into `system.actions` (array) or leave them
  // on the doc's embedded Items collection. Accept both.
  const actionsRaw = readPath(system, ['actions']) ?? readPath(system, ['details', 'actions']) ?? [];
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
    melee: formatMelee(melee),
    ranged: formatRanged(ranged),
    abilities: Array.isArray(actionsRaw) ? formatActions(actionsRaw) : '',
    description: monsterDescription(system),
    // aonUrl was scope-dropped from the projection layer (see the PR
    // description). Consumers that still need a link pass the doc name or
    // uuid through and decide downstream.
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
  };
}

// ---------------------------------------------------------------------------
// Item projections
// ---------------------------------------------------------------------------

const RARITY_TRAITS = new Set(['COMMON', 'UNCOMMON', 'RARE', 'UNIQUE']);

function extractRarityFromTraits(traits: string[]): string {
  for (const t of traits) {
    const up = t.toUpperCase();
    if (RARITY_TRAITS.has(up) && up !== 'COMMON') return up;
  }
  return 'COMMON';
}

function nonRarityTraits(traits: string[]): string[] {
  return traits.filter((t) => !RARITY_TRAITS.has(t.toUpperCase()));
}

/** Format an ItemPrice object as a human-readable string ("1,600 gp"). */
export function formatPriceStructured(price: ItemPrice | undefined): string | null {
  if (!price || !isRecord(price.value)) return null;
  const parts: string[] = [];
  const { pp, gp, sp, cp } = price.value;
  if (typeof pp === 'number' && pp > 0) parts.push(`${pp.toString()} pp`);
  if (typeof gp === 'number' && gp > 0) parts.push(`${gp.toString()} gp`);
  if (typeof sp === 'number' && sp > 0) parts.push(`${sp.toString()} sp`);
  if (typeof cp === 'number' && cp > 0) parts.push(`${cp.toString()} cp`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Convert a price struct to a copper total for sorting. Missing prices
 *  sort to the end. Ported from `packages/db/src/pf2e/compendium.ts`
 *  (`priceToCopper`) but reads the structured `ItemPrice` shape instead
 *  of the free-text legacy column. */
export function priceToCopper(price: ItemPrice | string | null | undefined): number {
  if (price == null) return Number.MAX_SAFE_INTEGER;
  if (typeof price === 'string') {
    const p = price.replace(/\n/g, ' ').trim().toLowerCase();
    let total = 0;
    const ppMatch = p.match(/([\d,]+)\s*pp/);
    const gpMatch = p.match(/([\d,]+)\s*gp/);
    const spMatch = p.match(/([\d,]+)\s*sp/);
    const cpMatch = p.match(/([\d,]+)\s*cp/);
    if (ppMatch) total += Number(ppMatch[1].replace(/,/g, '')) * 1000;
    if (gpMatch) total += Number(gpMatch[1].replace(/,/g, '')) * 100;
    if (spMatch) total += Number(spMatch[1].replace(/,/g, '')) * 10;
    if (cpMatch) total += Number(cpMatch[1].replace(/,/g, ''));
    return total || Number.MAX_SAFE_INTEGER;
  }
  if (!isRecord(price.value)) return Number.MAX_SAFE_INTEGER;
  const { pp, gp, sp, cp } = price.value;
  let total = 0;
  if (typeof pp === 'number') total += pp * 1000;
  if (typeof gp === 'number') total += gp * 100;
  if (typeof sp === 'number') total += sp * 10;
  if (typeof cp === 'number') total += cp;
  return total || Number.MAX_SAFE_INTEGER;
}

function readItemTraits(system: Record<string, unknown>): string[] {
  return readStringArray(readPath(system, ['traits', 'value']));
}

function readItemPrice(system: Record<string, unknown>): ItemPrice | undefined {
  const raw = system.price;
  if (!isRecord(raw)) return undefined;
  return raw as unknown as ItemPrice;
}

function readItemBulk(system: Record<string, unknown>): string | null {
  const raw = readPath(system, ['bulk', 'value']);
  if (typeof raw === 'number') {
    if (raw === 0) return '—';
    if (raw < 1) return 'L';
    return raw.toString();
  }
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

function readItemUsage(system: Record<string, unknown>): string | null {
  const usage = readPath(system, ['usage', 'value']);
  return typeof usage === 'string' && usage.length > 0 ? usage : null;
}

function readItemLevel(system: Record<string, unknown>): number | null {
  const raw = readPath(system, ['level', 'value']);
  return typeof raw === 'number' ? raw : null;
}

function isMagical(system: Record<string, unknown>): boolean {
  const traits = readItemTraits(system);
  return traits.includes('magical') || traits.includes('invested');
}

function isRemastered(system: Record<string, unknown>): boolean | null {
  const remaster = readPath(system, ['publication', 'remaster']);
  if (typeof remaster === 'boolean') return remaster;
  return null;
}

function hasActivation(doc: CompendiumDocument, system: Record<string, unknown>): boolean {
  const actionType = readPath(system, ['actionType', 'value']);
  if (typeof actionType === 'string' && actionType !== 'passive') return true;
  const actions = system.actions;
  if (Array.isArray(actions) && actions.length > 0) return true;
  // Consumables and activatable magic items typically embed an `activate`
  // system field. Treat its presence as activation.
  if (isRecord(system.activate)) return true;
  // If the item's `doc.type` is 'consumable' we treat it as activatable by
  // default — matches the legacy DB behavior of flagging potions, etc.
  if (doc.type === 'consumable') return true;
  return false;
}

function readVariants(system: Record<string, unknown>): ItemVariant[] {
  const raw = system.variants;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((v): ItemVariant => {
    const levelRaw = readPath(v, ['level']);
    const priceRaw = v.price;
    let price: string | null = null;
    if (isRecord(priceRaw)) {
      price = formatPriceStructured(priceRaw as unknown as ItemPrice);
    } else if (typeof priceRaw === 'string') {
      price = priceRaw.replace(/\n/g, ' ').trim();
    }
    return {
      type: readString(v.type),
      level: typeof levelRaw === 'number' ? levelRaw : null,
      price,
    };
  });
}

export function itemDocToBrowserRow(doc: CompendiumDocument): ItemBrowserRow {
  const system = readSystem(doc);
  const allTraits = readItemTraits(system);
  const nonRarity = nonRarityTraits(allTraits);
  const price = readItemPrice(system);
  const variants = readVariants(system);

  return {
    id: doc.id,
    name: doc.name,
    level: readItemLevel(system),
    traits: nonRarity,
    rarity: extractRarityFromTraits(allTraits),
    price: formatPriceStructured(price),
    bulk: readItemBulk(system),
    usage: readItemUsage(system),
    isMagical: isMagical(system),
    hasVariants: variants.length > 0,
    isRemastered: isRemastered(system),
  };
}

export function itemDocToBrowserDetail(doc: CompendiumDocument): ItemBrowserDetail {
  const base = itemDocToBrowserRow(doc);
  const system = readSystem(doc);
  return {
    ...base,
    description: cleanDescription(readString(readPath(system, ['description', 'value']))),
    source: readString(readPath(system, ['publication', 'title'])) || null,
    aonUrl: null,
    variants: readVariants(system),
    hasActivation: hasActivation(doc, system),
  };
}

/** Lean path for item matches — no doc fetch, reads whatever the server
 *  surfaces on the match row. Price is already on the match when the
 *  server's cache has seen the doc; otherwise null. */
export function itemMatchToBrowserRow(m: CompendiumMatch): ItemBrowserRow {
  const allTraits = m.traits ?? [];
  const nonRarity = nonRarityTraits(allTraits);
  return {
    id: m.documentId,
    name: m.name,
    level: m.level ?? null,
    traits: nonRarity,
    rarity: extractRarityFromTraits(allTraits),
    price: formatPriceStructured(m.price),
    bulk: null,
    usage: null,
    isMagical: allTraits.includes('magical') || allTraits.includes('invested'),
    hasVariants: false,
    isRemastered: null,
  };
}

export function itemDocToLootShortlistItem(doc: CompendiumDocument): LootShortlistItem {
  const system = readSystem(doc);
  const allTraits = readItemTraits(system);
  const price = readItemPrice(system);
  return {
    id: doc.id,
    name: doc.name,
    level: readItemLevel(system),
    price: formatPriceStructured(price),
    bulk: readItemBulk(system),
    traits: allTraits.join(','),
    usage: readItemUsage(system),
    aonUrl: null,
    isMagical: isMagical(system) ? 1 : 0,
    source: readString(readPath(system, ['publication', 'title'])) || null,
  };
}
