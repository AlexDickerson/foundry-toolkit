// Pure helpers for the homebrew item editor:
//
//   emptyDraft(type)     → blank ItemDraft for a freshly-created item
//   templateToDraft(t)   → ItemDraft seeded from a cloned compendium item
//   draftToPayload(d)    → CompendiumItemPayload ready for the wire
//
// The draft is a flat, edit-friendly shape; conversion to/from PF2e's
// nested `system.*` happens here so the React component can stay
// dumb-render. Round-trip behavior:
//
//   templateToDraft → draftToPayload should preserve every PF2e field
//   the editor doesn't know about (carried via `systemRaw`).
//
// We intentionally do NOT model every PF2e field — the editor exposes
// the common ones plus a JSON escape hatch for `system.rules` and a
// JSON-encoded `systemRaw` advanced override. Anything else round-trips
// untouched through `systemRaw`.

import type { CompendiumItemPayload } from '@foundry-toolkit/shared/rpc';
import type { CompendiumItemTemplate } from '../../../electron/ipc/homebrew-items-clone.js';

// PF2e item types this editor handles directly. Other types ("kit",
// "backpack", "spell"…) can still be cloned + edited via the advanced
// JSON tab; we just don't surface a per-type form for them.
export const SUPPORTED_TYPES = ['weapon', 'armor', 'shield', 'consumable', 'equipment', 'treasure'] as const;
export type ItemType = (typeof SUPPORTED_TYPES)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'unique'] as const;
export type Rarity = (typeof RARITIES)[number];

export const DAMAGE_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'] as const;
export const DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;
export const WEAPON_CATEGORIES = ['simple', 'martial', 'advanced', 'unarmed'] as const;
export const ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'unarmored'] as const;
export const FREQUENCY_PER = ['PT1M', 'PT1H', 'PT24H', 'day', 'turn', 'round'] as const;

// CONST.ACTIVE_EFFECT_MODES — small enough to inline.
export const ACTIVE_EFFECT_MODES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Custom (0)' },
  { value: 1, label: 'Multiply (1)' },
  { value: 2, label: 'Add (2)' },
  { value: 3, label: 'Downgrade (3)' },
  { value: 4, label: 'Upgrade (4)' },
  { value: 5, label: 'Override (5)' },
];

export interface PriceDraft {
  pp: number;
  gp: number;
  sp: number;
  cp: number;
}

export interface FrequencyDraft {
  /** -1 means "unset"; the form clears it. */
  max: number;
  per: (typeof FREQUENCY_PER)[number];
}

export interface UsesDraft {
  value: number;
  max: number;
}

export interface WeaponDraft {
  damageDie: (typeof DAMAGE_DICE)[number];
  damageDice: number;
  damageType: string;
  category: (typeof WEAPON_CATEGORIES)[number];
  group: string;
}

export interface ArmorDraft {
  category: (typeof ARMOR_CATEGORIES)[number];
  group: string;
  acBonus: number;
  strength: number;
  /** Dex cap — PF2e remaster field is `system.dexCap`. */
  dexCap: number;
  /** Check penalty — PF2e remaster field is `system.checkPenalty`. */
  checkPenalty: number;
  /** Speed penalty — PF2e remaster field is `system.speedPenalty`
   *  (the legacy field name `slowness` was renamed). */
  speedPenalty: number;
}

export interface ShieldDraft {
  hardness: number;
  hpMax: number;
  acBonus: number;
}

export interface ConsumableDraft {
  consumableType: string;
}

export interface EquipmentDraft {
  usage: string;
}

export interface TreasureDraft {
  /** PF2e treasure types: 'gem', 'currency', 'art-object', etc.
   *  Stored at `system.category` on the document. */
  category: string;
}

export interface ActiveEffectChangeDraft {
  key: string;
  mode: number;
  value: string;
  priority: number;
}

export interface ActiveEffectDraft {
  name: string;
  disabled: boolean;
  transfer: boolean;
  changes: ActiveEffectChangeDraft[];
  durationRounds: number;
}

export interface ItemDraft {
  name: string;
  type: ItemType;
  img: string;
  level: number;
  rarity: Rarity;
  traits: string[];
  price: PriceDraft;
  bulk: string;
  source: string;
  description: string;
  /** Optional per-type sub-state — only the field matching `type`
   *  is used on save. Stored side-by-side so switching types doesn't
   *  drop the user's in-progress fields. */
  weapon: WeaponDraft;
  armor: ArmorDraft;
  shield: ShieldDraft;
  consumable: ConsumableDraft;
  equipment: EquipmentDraft;
  treasure: TreasureDraft;
  /** Optional frequency clamp (PT1H/day/etc). Apply when `max > 0`. */
  frequency: FrequencyDraft;
  /** Charges / uses (consumable + activatable items). Apply when `max > 0`. */
  uses: UsesDraft;
  /** PF2e RuleElements as a JSON-stringified array. Empty string =
   *  no rules. Validated on save (must parse to an array). */
  rulesJson: string;
  /** Effects array — Foundry's ActiveEffect documents. */
  effects: ActiveEffectDraft[];
  /** Pass-through for fields the editor doesn't know about. The full
   *  `system` from the template lands here; we overlay editor-managed
   *  fields onto it on save. Empty `{}` for greenfield drafts. */
  systemRaw: Record<string, unknown>;
  /** Pass-through `flags` for module-scoped data. */
  flags: Record<string, Record<string, unknown>>;
}

function emptyPrice(): PriceDraft {
  return { pp: 0, gp: 0, sp: 0, cp: 0 };
}

function emptyWeapon(): WeaponDraft {
  return { damageDie: 'd6', damageDice: 1, damageType: 'slashing', category: 'simple', group: 'sword' };
}

function emptyArmor(): ArmorDraft {
  return { category: 'light', group: 'leather', acBonus: 1, strength: 0, dexCap: 4, checkPenalty: 0, speedPenalty: 0 };
}

function emptyShield(): ShieldDraft {
  return { hardness: 3, hpMax: 12, acBonus: 1 };
}

function emptyConsumable(): ConsumableDraft {
  return { consumableType: 'potion' };
}

function emptyEquipment(): EquipmentDraft {
  return { usage: 'held-in-one-hand' };
}

function emptyTreasure(): TreasureDraft {
  return { category: 'gem' };
}

export function emptyDraft(type: ItemType = 'equipment'): ItemDraft {
  return {
    name: '',
    type,
    img: '',
    level: 0,
    rarity: 'common',
    traits: [],
    price: emptyPrice(),
    bulk: '-',
    source: '',
    description: '',
    weapon: emptyWeapon(),
    armor: emptyArmor(),
    shield: emptyShield(),
    consumable: emptyConsumable(),
    equipment: emptyEquipment(),
    treasure: emptyTreasure(),
    frequency: { max: 0, per: 'day' },
    uses: { value: 0, max: 0 },
    rulesJson: '',
    effects: [],
    systemRaw: {},
    flags: {},
  };
}

// ---------------------------------------------------------------------------
// Read-from-system helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function readPriceFromSystem(system: Record<string, unknown>): PriceDraft {
  const price = system['price'];
  if (!isRecord(price)) return emptyPrice();
  const value = price['value'];
  if (!isRecord(value)) return emptyPrice();
  return {
    pp: readNumber(value['pp'], 0),
    gp: readNumber(value['gp'], 0),
    sp: readNumber(value['sp'], 0),
    cp: readNumber(value['cp'], 0),
  };
}

function readBulkFromSystem(system: Record<string, unknown>): string {
  const bulk = system['bulk'];
  if (!isRecord(bulk)) return '-';
  const v = bulk['value'];
  if (typeof v === 'number') return v.toString();
  if (typeof v === 'string' && v.length > 0) return v;
  return '-';
}

function readTraitsFromSystem(system: Record<string, unknown>): { traits: string[]; rarity: Rarity } {
  const traits = system['traits'];
  if (!isRecord(traits)) return { traits: [], rarity: 'common' };
  const value = traits['value'];
  const list: string[] = Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  const rarityRaw = readString(traits['rarity'], 'common').toLowerCase();
  const rarity: Rarity = (RARITIES as readonly string[]).includes(rarityRaw) ? (rarityRaw as Rarity) : 'common';
  return { traits: list, rarity };
}

function readDescriptionFromSystem(system: Record<string, unknown>): string {
  const desc = system['description'];
  if (!isRecord(desc)) return '';
  return readString(desc['value'], '');
}

function readSourceFromSystem(system: Record<string, unknown>): string {
  const pub = system['publication'];
  if (isRecord(pub)) return readString(pub['title'], '');
  // Older items use `system.source.value` directly.
  const src = system['source'];
  if (isRecord(src)) return readString(src['value'], '');
  return '';
}

function readLevelFromSystem(system: Record<string, unknown>): number {
  const level = system['level'];
  if (isRecord(level)) return readNumber(level['value'], 0);
  return 0;
}

function readUsesFromSystem(system: Record<string, unknown>): UsesDraft {
  const uses = system['uses'];
  if (!isRecord(uses)) return { value: 0, max: 0 };
  return { value: readNumber(uses['value'], 0), max: readNumber(uses['max'], 0) };
}

function readFrequencyFromSystem(system: Record<string, unknown>): FrequencyDraft {
  const freq = system['frequency'];
  if (!isRecord(freq)) return { max: 0, per: 'day' };
  const perRaw = readString(freq['per'], 'day');
  const per = (FREQUENCY_PER as readonly string[]).includes(perRaw) ? (perRaw as FrequencyDraft['per']) : 'day';
  return { max: readNumber(freq['max'], 0), per };
}

function readRulesFromSystem(system: Record<string, unknown>): string {
  const rules = system['rules'];
  if (!Array.isArray(rules) || rules.length === 0) return '';
  return JSON.stringify(rules, null, 2);
}

function readWeaponFromSystem(system: Record<string, unknown>): WeaponDraft {
  const damage = system['damage'];
  const die = isRecord(damage) ? readString(damage['die'], 'd6') : 'd6';
  const dice = isRecord(damage) ? readNumber(damage['dice'], 1) : 1;
  const damageType = isRecord(damage) ? readString(damage['damageType'], 'slashing') : 'slashing';
  const categoryRaw = readString(system['category'], 'simple');
  const category = (WEAPON_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as WeaponDraft['category'])
    : 'simple';
  const group = readString(system['group'], 'sword');
  return {
    damageDie: (DAMAGE_DICE as readonly string[]).includes(die) ? (die as WeaponDraft['damageDie']) : 'd6',
    damageDice: dice,
    damageType,
    category,
    group,
  };
}

function readArmorFromSystem(system: Record<string, unknown>): ArmorDraft {
  const categoryRaw = readString(system['category'], 'light');
  const category = (ARMOR_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as ArmorDraft['category'])
    : 'light';
  return {
    category,
    group: readString(system['group'], 'leather'),
    acBonus: readNumber(system['acBonus'], 1),
    strength: readNumber(system['strength'], 0),
    dexCap: readNumber(system['dexCap'], 4),
    checkPenalty: readNumber(system['checkPenalty'], 0),
    speedPenalty: readNumber(system['speedPenalty'], 0),
  };
}

function readShieldFromSystem(system: Record<string, unknown>): ShieldDraft {
  const hp = system['hp'];
  const hpMax = isRecord(hp) ? readNumber(hp['max'], 12) : 12;
  return {
    hardness: readNumber(system['hardness'], 3),
    hpMax,
    acBonus: readNumber(system['acBonus'], 1),
  };
}

function readConsumableFromSystem(system: Record<string, unknown>): ConsumableDraft {
  const cat = system['category'];
  if (typeof cat === 'string' && cat.length > 0) return { consumableType: cat };
  return { consumableType: 'potion' };
}

function readEquipmentFromSystem(system: Record<string, unknown>): EquipmentDraft {
  const usage = system['usage'];
  if (isRecord(usage)) return { usage: readString(usage['value'], 'held-in-one-hand') };
  return { usage: 'held-in-one-hand' };
}

function readTreasureFromSystem(system: Record<string, unknown>): TreasureDraft {
  return { category: readString(system['category'], 'gem') };
}

function readEffectsFromTemplate(effects: Array<Record<string, unknown>>): ActiveEffectDraft[] {
  return effects.map((e) => {
    const changesRaw = e['changes'];
    const changes: ActiveEffectChangeDraft[] = Array.isArray(changesRaw)
      ? changesRaw.filter(isRecord).map((c) => ({
          key: readString(c['key']),
          mode: readNumber(c['mode'], 2),
          value: readString(c['value']),
          priority: readNumber(c['priority'], readNumber(c['mode'], 2) * 10),
        }))
      : [];
    const duration = e['duration'];
    const rounds = isRecord(duration) ? readNumber(duration['rounds'], 0) : 0;
    return {
      name: readString(e['name']),
      disabled: e['disabled'] === true,
      transfer: e['transfer'] === true,
      changes,
      durationRounds: rounds,
    };
  });
}

// ---------------------------------------------------------------------------
// Template → Draft
// ---------------------------------------------------------------------------

export function templateToDraft(template: CompendiumItemTemplate): ItemDraft {
  const baseType: ItemType = (SUPPORTED_TYPES as readonly string[]).includes(template.type)
    ? (template.type as ItemType)
    : 'equipment';
  const system = template.system;

  const { traits, rarity } = readTraitsFromSystem(system);

  return {
    name: template.name,
    type: baseType,
    img: template.img ?? '',
    level: readLevelFromSystem(system),
    rarity,
    traits,
    price: readPriceFromSystem(system),
    bulk: readBulkFromSystem(system),
    source: readSourceFromSystem(system),
    description: readDescriptionFromSystem(system),
    weapon: readWeaponFromSystem(system),
    armor: readArmorFromSystem(system),
    shield: readShieldFromSystem(system),
    consumable: readConsumableFromSystem(system),
    equipment: readEquipmentFromSystem(system),
    treasure: readTreasureFromSystem(system),
    frequency: readFrequencyFromSystem(system),
    uses: readUsesFromSystem(system),
    rulesJson: readRulesFromSystem(system),
    effects: readEffectsFromTemplate(template.effects),
    systemRaw: { ...system },
    flags: { ...template.flags },
  };
}

// ---------------------------------------------------------------------------
// Draft → Payload
// ---------------------------------------------------------------------------

function parseBulk(raw: string): string | number {
  const t = raw.trim();
  if (t === '' || t === '-') return '-';
  if (t.toUpperCase() === 'L') return 'L';
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

export class DraftValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'DraftValidationError';
  }
}

/** Convert the editor's draft state into a `CompendiumItemPayload`
 *  ready to POST to /api/compendium/items. Throws
 *  `DraftValidationError` when required fields are missing or
 *  rules JSON doesn't parse to an array. */
export function draftToPayload(draft: ItemDraft): CompendiumItemPayload {
  const name = draft.name.trim();
  if (name === '') throw new DraftValidationError('Name is required');

  const system: Record<string, unknown> = { ...draft.systemRaw };

  // Common fields — overlay onto whatever the template carried, but
  // preserve sibling fields the editor doesn't surface (PF2e items
  // carry adjacent metadata on every nested record — `description.gm`,
  // `price.per`, `bulk.heldOrStowed`, `traits.otherTags`, etc. — and
  // a clobbering write would silently delete them when cloning).
  const existingLevel = isRecord(system['level']) ? (system['level'] as Record<string, unknown>) : {};
  system['level'] = { ...existingLevel, value: draft.level };

  const existingTraits = isRecord(system['traits']) ? (system['traits'] as Record<string, unknown>) : {};
  system['traits'] = {
    ...existingTraits,
    value: [...draft.traits],
    rarity: draft.rarity,
  };

  const existingPrice = isRecord(system['price']) ? (system['price'] as Record<string, unknown>) : {};
  const existingPriceValue = isRecord(existingPrice['value'])
    ? (existingPrice['value'] as Record<string, unknown>)
    : {};
  system['price'] = {
    ...existingPrice,
    value: { ...existingPriceValue, ...draft.price },
  };

  const existingBulk = isRecord(system['bulk']) ? (system['bulk'] as Record<string, unknown>) : {};
  system['bulk'] = { ...existingBulk, value: parseBulk(draft.bulk) };

  const existingDesc = isRecord(system['description']) ? (system['description'] as Record<string, unknown>) : {};
  system['description'] = { ...existingDesc, value: draft.description };

  const existingPub = isRecord(system['publication']) ? (system['publication'] as Record<string, unknown>) : {};
  system['publication'] = { ...existingPub, title: draft.source };

  // Per-type fields — only set for the active type.
  switch (draft.type) {
    case 'weapon': {
      const existingDamage = isRecord(system['damage']) ? (system['damage'] as Record<string, unknown>) : {};
      system['damage'] = {
        ...existingDamage,
        die: draft.weapon.damageDie,
        dice: draft.weapon.damageDice,
        damageType: draft.weapon.damageType,
      };
      system['category'] = draft.weapon.category;
      system['group'] = draft.weapon.group;
      break;
    }
    case 'armor': {
      system['category'] = draft.armor.category;
      system['group'] = draft.armor.group;
      system['acBonus'] = draft.armor.acBonus;
      system['strength'] = draft.armor.strength;
      system['dexCap'] = draft.armor.dexCap;
      system['checkPenalty'] = draft.armor.checkPenalty;
      system['speedPenalty'] = draft.armor.speedPenalty;
      break;
    }
    case 'shield': {
      system['hardness'] = draft.shield.hardness;
      system['hp'] = {
        ...((isRecord(system['hp']) ? system['hp'] : {}) as Record<string, unknown>),
        max: draft.shield.hpMax,
      };
      system['acBonus'] = draft.shield.acBonus;
      break;
    }
    case 'consumable': {
      system['category'] = draft.consumable.consumableType;
      break;
    }
    case 'equipment': {
      system['usage'] = {
        ...((isRecord(system['usage']) ? system['usage'] : {}) as Record<string, unknown>),
        value: draft.equipment.usage,
      };
      break;
    }
    case 'treasure': {
      system['category'] = draft.treasure.category;
      break;
    }
  }

  // Frequency — only set when max > 0; otherwise drop any inherited
  // value so a cleared draft writes a clean frequency-less item.
  if (draft.frequency.max > 0) {
    system['frequency'] = { max: draft.frequency.max, per: draft.frequency.per };
  } else {
    delete system['frequency'];
  }

  // Uses — same pattern. Merge into the existing object so a
  // template's `autoDestroy` (consumables) survives the round trip.
  if (draft.uses.max > 0) {
    const existingUses = isRecord(system['uses']) ? (system['uses'] as Record<string, unknown>) : {};
    system['uses'] = { ...existingUses, value: draft.uses.value, max: draft.uses.max };
  } else {
    delete system['uses'];
  }

  // Rules (PF2e RuleElements). Validate it parses to an array.
  if (draft.rulesJson.trim() !== '') {
    let rules: unknown;
    try {
      rules = JSON.parse(draft.rulesJson);
    } catch {
      throw new DraftValidationError('Rules JSON could not be parsed');
    }
    if (!Array.isArray(rules)) {
      throw new DraftValidationError('Rules JSON must be a JSON array');
    }
    system['rules'] = rules;
  } else {
    delete system['rules'];
  }

  const payload: CompendiumItemPayload = {
    name,
    type: draft.type,
    system,
  };
  if (draft.img !== '') payload.img = draft.img;
  if (Object.keys(draft.flags).length > 0) payload.flags = draft.flags;

  if (draft.effects.length > 0) {
    payload.effects = draft.effects.map((e) => ({
      name: e.name,
      disabled: e.disabled,
      transfer: e.transfer,
      changes: e.changes.map((c) => ({
        key: c.key,
        mode: c.mode,
        value: c.value,
        priority: c.priority,
      })),
      duration: e.durationRounds > 0 ? { rounds: e.durationRounds } : {},
    }));
  }

  return payload;
}
