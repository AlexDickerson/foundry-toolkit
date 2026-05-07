import type { CompendiumDocument, CompendiumMatch, ItemPrice } from '@/features/characters/types';
import { priceToCp } from '@/features/characters/lib/coins';

// ─── Type filter ─────────────────────────────────────────────────────────

export type TypeFilter = 'all' | 'weapon' | 'armor' | 'consumable' | 'equipment' | 'backpack';

/** Match types vary: `match.type` may be the Foundry document type.
 *  When it's generic 'Item' the server didn't supply the subtype, so
 *  we fall back to traits and name. */
export function filterMatchesByType(matches: readonly CompendiumMatch[], filter: TypeFilter): CompendiumMatch[] {
  if (filter === 'all') return [...matches];
  return matches.filter((m) => {
    const t = m.type.toLowerCase();
    if (t === filter) return true;
    const traits = (m.traits ?? []).map((s) => s.toLowerCase());
    if (traits.includes(filter)) return true;
    if (
      filter === 'consumable' &&
      (traits.includes('potion') || traits.includes('scroll') || traits.includes('elixir'))
    )
      return true;
    return false;
  });
}

// ─── Item grouping ────────────────────────────────────────────────────────

export interface ItemGroup {
  key: string;
  displayName: string;
  variants: CompendiumMatch[];
}

// Known quality tiers with explicit sort order.
const QUALITY_ORDER: Record<string, number> = {
  minor: 0,
  lesser: 1,
  moderate: 2,
  greater: 3,
  major: 4,
  true: 5,
  young: 6,
  adult: 7,
  wyrm: 8,
  '1st-rank': 10,
  '2nd-rank': 11,
  '3rd-rank': 12,
  '4th-rank': 13,
  '5th-rank': 14,
  '6th-rank': 15,
  '7th-rank': 16,
  '8th-rank': 17,
  '9th-rank': 18,
  'rank 1': 10,
  'rank 2': 11,
  'rank 3': 12,
  'rank 4': 13,
  'rank 5': 14,
  'rank 6': 15,
  'rank 7': 16,
  'rank 8': 17,
  'rank 9': 18,
};

const QUALITY_WORD_RE =
  /\b(minor|lesser|moderate|greater|major|true|young|adult|wyrm|[1-9](?:st|nd|rd|th)-rank|rank\s+[1-9])(?:\s+spell)?\b/i;

/** Splits "Name (Variant)" into `{ base, variant }`. Only strips the
 *  final trailing parenthetical; parens in the middle are kept in base. */
export function parseItemName(name: string): { base: string; variant: string | null } {
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(name);
  if (!m) return { base: name.trim(), variant: null };
  // Groups 1 and 2 are guaranteed by the regex above.
  return { base: (m[1] as string).trim(), variant: (m[2] as string).trim() };
}

/** Sort rank for a variant string. Known quality keywords get explicit
 *  ranks; unknown variants sort alphabetically (rank 99); the base item
 *  with no variant sorts first (-1). */
function variantRank(variant: string | null): number {
  if (variant === null) return -1;
  const m = QUALITY_WORD_RE.exec(variant);
  return m ? (QUALITY_ORDER[(m[1] as string).toLowerCase()] ?? 99) : 99;
}

/** Sorts variants within a group by quality tier then alphabetically. */
export function sortVariants(variants: CompendiumMatch[]): CompendiumMatch[] {
  return [...variants].sort((a, b) => {
    const ra = variantRank(parseItemName(a.name).variant);
    const rb = variantRank(parseItemName(b.name).variant);
    if (ra !== rb) return ra - rb;
    return (parseItemName(a.name).variant ?? '').localeCompare(parseItemName(b.name).variant ?? '');
  });
}

/** Display label for a single variant chip. */
export function qualityLabel(name: string): string {
  return parseItemName(name).variant ?? '—';
}

// ─── Price utilities ──────────────────────────────────────────────────────

export type PriceState = { kind: 'loading' } | { kind: 'ready'; price: ItemPrice | null };

/** Priority: embedded `match.price` → lazy-loaded map → loading state */
export function resolvePriceState(
  match: CompendiumMatch,
  prefetched: Map<string, ItemPrice | null>,
): PriceState {
  if (match.price !== undefined) return { kind: 'ready', price: match.price };
  if (prefetched.has(match.uuid)) return { kind: 'ready', price: prefetched.get(match.uuid) ?? null };
  return { kind: 'loading' };
}

export function extractPriceFromDocument(doc: CompendiumDocument): ItemPrice | null {
  const sys = doc.system as { price?: unknown };
  const price = sys.price;
  if (!price || typeof price !== 'object') return null;
  const v = (price as { value?: unknown }).value;
  if (!v || typeof v !== 'object') return null;
  return price as ItemPrice;
}

// ─── Rarity style utilities ───────────────────────────────────────────────

export function rarityFooterClass(rarity: string | undefined): string {
  switch (rarity?.toLowerCase()) {
    case 'uncommon': return 'bg-amber-200 border-amber-500';
    case 'rare':     return 'bg-blue-200 border-blue-500';
    case 'unique':   return 'bg-purple-200 border-purple-500';
    default:         return 'border-pf-border';
  }
}

export function rarityChipActiveClass(rarity: string): string {
  switch (rarity) {
    case 'uncommon': return 'border-amber-500 bg-amber-200 text-amber-900';
    case 'rare':     return 'border-blue-500 bg-blue-200 text-blue-900';
    case 'unique':   return 'border-purple-500 bg-purple-200 text-purple-900';
    default:         return 'border-pf-border bg-pf-bg-dark text-pf-text';
  }
}

export function rarityChipClass(rarity: string | undefined): string {
  switch (rarity?.toLowerCase()) {
    case 'uncommon': return 'border-amber-500 bg-amber-100 text-amber-800';
    case 'rare':     return 'border-blue-500 bg-blue-100 text-blue-800';
    case 'unique':   return 'border-purple-500 bg-purple-100 text-purple-800';
    default:         return 'border-pf-border bg-pf-bg-dark text-pf-alt-dark';
  }
}

// priceToCp is re-exported here for convenience — callers of shop-utils
// don't need to import from two places for price display.
export { priceToCp };
