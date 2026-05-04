// Item projection functions — map foundry-mcp wire shapes to the
// dm-tool-native ItemBrowserRow / ItemBrowserDetail / LootShortlistItem shapes.

import type { ItemBrowserDetail, ItemBrowserRow, ItemVariant } from '@foundry-toolkit/shared/types';
import type { LootShortlistItem } from '@foundry-toolkit/ai/loot';
import type { CompendiumDocument, CompendiumMatch, ItemPrice } from '../types.js';
import {
  cleanDescription,
  isRecord,
  readSystem,
  readPath,
  readString,
  readStringArray,
  pickPortraitUrl,
  isDefaultIcon,
} from './shared.js';

// ---------------------------------------------------------------------------
// Rarity helpers
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

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

/** Format an ItemPrice object as a human-readable string ("1,600 gp"). */
function formatPriceStructured(price: ItemPrice | undefined): string | null {
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

// ---------------------------------------------------------------------------
// Item field readers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Item projections
// ---------------------------------------------------------------------------

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
    img: pickPortraitUrl(doc),
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
    itemType: doc.type,
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
    img: m.img && !isDefaultIcon(m.img) ? m.img : null,
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
