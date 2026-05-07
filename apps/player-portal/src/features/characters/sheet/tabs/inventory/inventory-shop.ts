import { api } from '@/features/characters/api';
import type { PhysicalItem, PointPool, PreparedActorItem } from '@/features/characters/types';
import {
  coinItemsByDenom,
  coinSlugFor,
  cpToDenominations,
  coinItemValueCp,
  sumActorCoinsCp,
  type Denom,
} from '@/_quarantine/lib/coins';

export interface SellContext {
  sellRatio: number;
  pending: Set<string>;
  onSell: (item: PhysicalItem) => Promise<void>;
}

export interface InvestContext {
  investiture: PointPool;
  pending: Set<string>;
  onToggle: (item: PhysicalItem) => Promise<void>;
}

export interface PartyContext {
  partyId: string;
  pending: Set<string>;
  onTransfer: (item: PhysicalItem) => Promise<void>;
}

// Deduct `totalCp` from the actor's canonical coin items. Pulls from
// the largest denomination that can cover what's left and breaks it
// down on the way, mirroring how a player would hand over pocket
// change. Throws when the actor can't cover the cost.
export async function spendCoins(actorId: string, items: readonly PreparedActorItem[], totalCp: number): Promise<void> {
  const available = sumActorCoinsCp(items);
  if (totalCp > available) {
    throw new Error(`Not enough coin — costs ${totalCp.toString()} cp, have ${available.toString()} cp.`);
  }
  const coinStacks = coinItemsByDenom(items);
  // Greedy drain: take from pp first, then gp, sp, cp. Converts larger
  // stacks down to cp-equivalent before subtracting to avoid
  // overshooting on small purchases ("change" mechanics).
  const remainingBySlot: Partial<Record<Denom, number>> = {};
  let remaining = totalCp;
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const item = coinStacks[denom];
    if (!item || remaining <= 0) {
      if (item) remainingBySlot[denom] = item.system.quantity;
      continue;
    }
    const stackCp = coinItemValueCp(item);
    if (stackCp <= remaining) {
      remainingBySlot[denom] = 0;
      remaining -= stackCp;
    } else {
      // This stack more than covers the rest — subtract proportionally.
      const unit = stackCp / item.system.quantity;
      const coinsNeeded = Math.ceil(remaining / unit);
      remainingBySlot[denom] = item.system.quantity - coinsNeeded;
      remaining -= coinsNeeded * unit;
    }
  }
  // Overpayment from rounding-up gets returned as change in smaller
  // denominations. `remaining` is ≤ 0 after the loop above; the
  // absolute value is the change owed back.
  if (remaining < 0) {
    const change = cpToDenominations(-remaining);
    for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
      if (change[denom] > 0) {
        remainingBySlot[denom] = (remainingBySlot[denom] ?? coinStacks[denom]?.system.quantity ?? 0) + change[denom];
      }
    }
  }
  await applyCoinChanges(actorId, coinStacks, remainingBySlot);
}

// Add `totalCp` worth of coins to the actor, preferring to merge into
// existing canonical stacks and falling back to creating a new coin
// item from the equipment pack when one is missing.
export async function grantCoins(actorId: string, items: readonly PreparedActorItem[], totalCp: number): Promise<void> {
  const coinStacks = coinItemsByDenom(items);
  const breakdown = cpToDenominations(totalCp);
  const nextQuantities: Partial<Record<Denom, number>> = {};
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const add = breakdown[denom];
    if (add === 0) continue;
    const existing = coinStacks[denom];
    if (existing) nextQuantities[denom] = existing.system.quantity + add;
  }
  await applyCoinChanges(actorId, coinStacks, nextQuantities);
  // Create stacks for denominations that don't exist on the actor yet.
  // These aren't common on fresh characters but the sell flow can
  // easily produce sp/cp that the actor doesn't carry a stack for.
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const add = breakdown[denom];
    if (add === 0 || coinStacks[denom]) continue;
    await api.addItemFromCompendium(actorId, {
      packId: 'pf2e.equipment-srd',
      // The equipment-srd pack exposes each coin type as an item whose
      // slug matches the canonical denomination. When the pack uses a
      // different id, the server will surface a resolution error and
      // we'll need to adjust — this is the simplest viable identifier.
      itemId: coinSlugFor(denom),
      quantity: add,
    });
  }
}

async function applyCoinChanges(
  actorId: string,
  coinStacks: Partial<Record<Denom, PhysicalItem>>,
  next: Partial<Record<Denom, number>>,
): Promise<void> {
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const qty = next[denom];
    if (qty === undefined) continue;
    const item = coinStacks[denom];
    if (!item) continue;
    if (item.system.quantity === qty) continue;
    await api.updateActorItem(actorId, item.id, { system: { quantity: Math.max(0, qty) } });
  }
}
