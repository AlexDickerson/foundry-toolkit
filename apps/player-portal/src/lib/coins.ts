import type { ItemPrice, PhysicalItem, PreparedActorItem } from '../api/types';
import { isCoin, isPhysicalItem } from '../api/types';

// All coin math flows through copper pieces (cp) so every denomination
// fits on a single integer axis. Ratios are the pf2e core values:
// 1 pp = 10 gp = 100 sp = 1000 cp.

export type Denom = 'pp' | 'gp' | 'sp' | 'cp';

export const COIN_DENOMS: readonly Denom[] = ['pp', 'gp', 'sp', 'cp'];

const CP_PER: Record<Denom, number> = {
  pp: 1000,
  gp: 100,
  sp: 10,
  cp: 1,
};

const SLUG_BY_DENOM: Record<Denom, string> = {
  pp: 'platinum-pieces',
  gp: 'gold-pieces',
  sp: 'silver-pieces',
  cp: 'copper-pieces',
};

const DENOM_BY_SLUG: Record<string, Denom> = {
  'platinum-pieces': 'pp',
  'gold-pieces': 'gp',
  'silver-pieces': 'sp',
  'copper-pieces': 'cp',
};

// Total unit price in cp. Honours the `per` field (a stack price for N
// units, e.g. arrows) by dividing — callers pass the unit price
// returned here and multiply by purchase quantity as needed.
export function priceToCp(price: ItemPrice | undefined | null): number {
  if (!price) return 0;
  const v = price.value;
  const cp =
    (v.pp ?? 0) * CP_PER.pp + (v.gp ?? 0) * CP_PER.gp + (v.sp ?? 0) * CP_PER.sp + (v.cp ?? 0) * CP_PER.cp;
  const per = price.per && price.per > 0 ? price.per : 1;
  return cp / per;
}

// Largest-first denomination breakdown. A cp amount of 0 returns all
// zeros rather than nulls so callers can always read a full record.
export function cpToDenominations(cp: number): Record<Denom, number> {
  const normalized = Math.max(0, Math.floor(cp));
  let remaining = normalized;
  const out: Record<Denom, number> = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const denom of COIN_DENOMS) {
    const unit = CP_PER[denom];
    const count = Math.floor(remaining / unit);
    out[denom] = count;
    remaining -= count * unit;
  }
  return out;
}

// Flatten the actor's coin items into a cp total. Handles the
// slug-based fast path plus a `price.value` fallback for custom coin
// items that don't match one of the canonical slugs.
export function sumActorCoinsCp(items: readonly PreparedActorItem[]): number {
  let total = 0;
  for (const item of items) {
    if (!isPhysicalItem(item) || !isCoin(item)) continue;
    total += coinItemValueCp(item);
  }
  return total;
}

export function coinItemValueCp(item: PhysicalItem): number {
  const denom = coinDenomOf(item);
  if (denom) return item.system.quantity * CP_PER[denom];
  // Fallback: honour the raw price (per-unit value × quantity).
  return priceToCp(item.system.price) * item.system.quantity;
}

export function coinDenomOf(item: PhysicalItem): Denom | undefined {
  const slug = item.system.slug;
  if (slug && slug in DENOM_BY_SLUG) return DENOM_BY_SLUG[slug];
  return undefined;
}

// Group the actor's canonical coin items (platinum/gold/silver/copper)
// by denomination so callers can inspect quantities and ids in one
// step. Non-canonical coin items are ignored; they keep their raw
// value via `sumActorCoinsCp` but don't participate in the add/remove
// flow since we can't tell what denomination to update.
export function coinItemsByDenom(items: readonly PreparedActorItem[]): Partial<Record<Denom, PhysicalItem>> {
  const out: Partial<Record<Denom, PhysicalItem>> = {};
  for (const item of items) {
    if (!isPhysicalItem(item) || !isCoin(item)) continue;
    const d = coinDenomOf(item);
    if (d && out[d] === undefined) out[d] = item;
  }
  return out;
}

export function coinSlugFor(denom: Denom): string {
  return SLUG_BY_DENOM[denom];
}

export function formatCp(cp: number): string {
  const d = cpToDenominations(cp);
  const parts: string[] = [];
  for (const denom of COIN_DENOMS) {
    if (d[denom] > 0) parts.push(`${d[denom].toString()} ${denom}`);
  }
  return parts.length === 0 ? '0 cp' : parts.join(' ');
}
