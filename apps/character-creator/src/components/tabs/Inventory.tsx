import { useState } from 'react';
import { api } from '../../api/client';
import type { PhysicalItem, PhysicalItemType, PreparedActorItem } from '../../api/types';
import { isCoin, isContainer, isPhysicalItem } from '../../api/types';
import {
  coinItemsByDenom,
  coinSlugFor,
  cpToDenominations,
  coinItemValueCp,
  priceToCp,
  sumActorCoinsCp,
  type Denom,
} from '../../lib/coins';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { useShopMode } from '../../lib/useShopMode';
import { useUuidHover } from '../../lib/useUuidHover';
import { SectionHeader } from '../common/SectionHeader';
import { ItemShopPicker, type BuyRequest } from '../shop/ItemShopPicker';

interface Props {
  items: PreparedActorItem[];
  actorId?: string;
  onActorChanged?: () => void;
}

type ViewMode = 'list' | 'grid';
type ShopView = 'inventory' | 'shop';

// Category buckets for the inventory separators. Related pf2e item
// types share a bucket ("Armor & Shields", "Consumables" holds ammo)
// so the player sees a familiar grouping rather than one header per
// strict Foundry type. Order matches how players typically scan:
// weapons and defenses first, then expendables, then everything else.
type InventoryCategory = 'weapons' | 'armor' | 'consumables' | 'equipment' | 'containers' | 'books' | 'treasure';

const CATEGORY_ORDER: readonly InventoryCategory[] = [
  'weapons',
  'armor',
  'consumables',
  'equipment',
  'containers',
  'books',
  'treasure',
];

const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  weapons: 'Weapons',
  armor: 'Armor & Shields',
  consumables: 'Consumables',
  equipment: 'Equipment',
  containers: 'Containers',
  books: 'Books',
  treasure: 'Treasure',
};

function categoryOf(type: PhysicalItemType): InventoryCategory {
  switch (type) {
    case 'weapon':
      return 'weapons';
    case 'armor':
    case 'shield':
      return 'armor';
    case 'consumable':
    case 'ammo':
      return 'consumables';
    case 'equipment':
      return 'equipment';
    case 'backpack':
      return 'containers';
    case 'book':
      return 'books';
    case 'treasure':
      return 'treasure';
  }
}

function groupByCategory(items: readonly PhysicalItem[]): Map<InventoryCategory, PhysicalItem[]> {
  const out = new Map<InventoryCategory, PhysicalItem[]>();
  for (const item of items) {
    const cat = categoryOf(item.type);
    const arr = out.get(cat) ?? [];
    arr.push(item);
    out.set(cat, arr);
  }
  return out;
}

// Inventory tab — reads `items[]`, filters to physical item types
// (weapon/armor/equipment/consumable/treasure/backpack), renders a
// single scrolling list with inline badges for "equipped" / "held" and
// containers expanded to show their contents. Coins break out to a
// dedicated strip at the top since they don't usefully carry bulk in
// the normal item layout.
//
// Ported in spirit from pf2e's static/templates/actors/character/tabs/
// inventory.hbs, but flattened — our read-only viewer doesn't need
// stow/carry/drop controls or quantity adjusters.
export function Inventory({ items, actorId, onActorChanged }: Props): React.ReactElement {
  // One uuid-hover instance for every expanded item description —
  // event delegation on the section picks up anchors produced by
  // `enrichDescription` regardless of which item was expanded.
  const uuidHover = useUuidHover();
  const [view, setView] = useState<ViewMode>('grid');
  const [shopView, setShopView] = useState<ShopView>('inventory');
  const [pendingBuys, setPendingBuys] = useState<Set<string>>(new Set());
  const [pendingSells, setPendingSells] = useState<Set<string>>(new Set());
  const [txError, setTxError] = useState<string | null>(null);
  const shopMode = useShopMode();

  const canTransact = actorId !== undefined && onActorChanged !== undefined;

  const handleBuy = async (req: BuyRequest): Promise<void> => {
    if (!canTransact) return;
    const { match, unitPriceCp } = req;
    setTxError(null);
    setPendingBuys((prev) => new Set(prev).add(match.uuid));
    try {
      if (unitPriceCp > 0) {
        await spendCoins(actorId, items, unitPriceCp);
      }
      await api.addItemFromCompendium(actorId, { packId: match.packId, itemId: match.documentId });
      onActorChanged();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingBuys((prev) => {
        const next = new Set(prev);
        next.delete(match.uuid);
        return next;
      });
    }
  };

  const handleSell = async (item: PhysicalItem): Promise<void> => {
    if (!canTransact) return;
    setTxError(null);
    setPendingSells((prev) => new Set(prev).add(item.id));
    try {
      const unitPriceCp = priceToCp(item.system.price);
      const payoutCp = Math.floor(unitPriceCp * item.system.quantity * shopMode.sellRatio);
      if (payoutCp > 0) {
        await grantCoins(actorId, items, payoutCp);
      }
      await api.deleteActorItem(actorId, item.id);
      onActorChanged();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingSells((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const physical = items.filter(isPhysicalItem);

  const coins = physical.filter(isCoin);
  // Treasure coins get their own dedicated strip at the top; strip
  // them out so the "Treasure" category header shows only non-coin
  // treasure items (gems, artwork, trade goods).
  const nonCoin = physical.filter((i) => !isCoin(i));

  // Items nested inside containers are rendered under their parent
  // container in list view (preserves the backpack/sack grouping).
  // Grid view flattens everything into per-category grids since the
  // nested tree doesn't survive a tile layout.
  const topLevel = nonCoin.filter((i) => !i.system.containerId);
  const byContainer = new Map<string, PhysicalItem[]>();
  for (const item of nonCoin) {
    const cid = item.system.containerId;
    if (!cid) continue;
    const arr = byContainer.get(cid) ?? [];
    arr.push(item);
    byContainer.set(cid, arr);
  }
  const topLevelByCategory = groupByCategory(topLevel);
  const allByCategory = groupByCategory(nonCoin);

  // When shop mode is off or we can't transact, force back to the
  // inventory pane so the toggle doesn't strand the user on an empty
  // shop tab.
  const effectiveShopView: ShopView = shopMode.enabled && canTransact ? shopView : 'inventory';

  return (
    <section
      className="space-y-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      {txError !== null && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800" data-role="tx-error">
          {txError}
        </p>
      )}
      {physical.length === 0 && effectiveShopView === 'inventory' ? (
        <p className="text-sm text-neutral-500">No items yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {coins.length > 0 && <CoinStrip coins={coins} />}
              {shopMode.enabled && canTransact && (
                <ShopViewToggle view={effectiveShopView} onChange={setShopView} />
              )}
              <ShopGearMenu shopMode={shopMode} />
            </div>
            {effectiveShopView === 'inventory' && <ViewToggle view={view} onChange={setView} />}
          </div>
          {effectiveShopView === 'shop' && canTransact ? (
            <ItemShopPicker items={items} onBuy={handleBuy} pending={pendingBuys} />
          ) : (
            <CategorizedInventory
              view={view}
              topLevelByCategory={topLevelByCategory}
              allByCategory={allByCategory}
              byContainer={byContainer}
              sellContext={
                shopMode.enabled && canTransact
                  ? { sellRatio: shopMode.sellRatio, pending: pendingSells, onSell: handleSell }
                  : undefined
              }
            />
          )}
        </>
      )}
      {uuidHover.popover}
    </section>
  );
}

interface SellContext {
  sellRatio: number;
  pending: Set<string>;
  onSell: (item: PhysicalItem) => Promise<void>;
}

// ─── Shop transactions ─────────────────────────────────────────────────

// Deduct `totalCp` from the actor's canonical coin items. Pulls from
// the largest denomination that can cover what's left and breaks it
// down on the way, mirroring how a player would hand over pocket
// change. Throws when the actor can't cover the cost.
async function spendCoins(actorId: string, items: readonly PreparedActorItem[], totalCp: number): Promise<void> {
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
async function grantCoins(actorId: string, items: readonly PreparedActorItem[], totalCp: number): Promise<void> {
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

// Render the non-coin inventory grouped by category, with a
// `SectionHeader` above each non-empty bucket. List view nests
// container contents under their owning backpack row (reusing the
// existing `ItemRow` branch); grid view flattens within a category
// since tile layout doesn't carry the parent/child relationship.
function CategorizedInventory({
  view,
  topLevelByCategory,
  allByCategory,
  byContainer,
  sellContext,
}: {
  view: ViewMode;
  topLevelByCategory: Map<InventoryCategory, PhysicalItem[]>;
  allByCategory: Map<InventoryCategory, PhysicalItem[]>;
  byContainer: Map<string, PhysicalItem[]>;
  sellContext: SellContext | undefined;
}): React.ReactElement {
  const buckets = view === 'list' ? topLevelByCategory : allByCategory;
  const presentCategories = CATEGORY_ORDER.filter((c) => (buckets.get(c)?.length ?? 0) > 0);
  if (presentCategories.length === 0) {
    return <p className="text-sm text-neutral-500">No items yet.</p>;
  }
  return (
    <div className="space-y-4">
      {presentCategories.map((category) => {
        const bucket = buckets.get(category) ?? [];
        return (
          <div key={category} data-category={category}>
            <SectionHeader>{CATEGORY_LABEL[category]}</SectionHeader>
            {view === 'list' ? (
              <ul className="space-y-1.5">
                {bucket.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    contents={isContainer(item) ? (byContainer.get(item.id) ?? []) : []}
                    sellContext={sellContext}
                  />
                ))}
              </ul>
            ) : (
              <ul
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }}
                data-view="grid"
              >
                {bucket.map((item) => (
                  <GridTile key={item.id} item={item} sellContext={sellContext} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Compact gear-menu variant of the shop debug controls. Lives inline
// with the coins strip / shop-view toggle so it doesn't eat a whole
// row of vertical space. Uses <details> for click-to-open without
// having to wire up outside-click dismissal manually — and because
// the browser handles focus-trap and keyboard behaviour for free.
function ShopGearMenu({
  shopMode,
}: {
  shopMode: ReturnType<typeof useShopMode>;
}): React.ReactElement {
  return (
    <details className="relative" data-section="shop-debug">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded border border-pf-border bg-white text-base leading-none text-pf-alt-dark hover:bg-pf-bg-dark/40"
        title="Shop settings"
        aria-label="Shop settings"
        data-testid="shop-gear"
      >
        <span aria-hidden="true">⚙</span>
      </summary>
      <div
        className="absolute right-0 top-full z-20 mt-1 w-64 rounded border border-pf-border bg-white p-3 text-xs text-pf-text shadow-lg"
        data-role="shop-gear-menu"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
          Debug · Shop Mode
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shopMode.enabled}
            onChange={(e): void => {
              shopMode.setEnabled(e.target.checked);
            }}
            data-testid="shop-mode-toggle"
          />
          <span>Enable shop mode</span>
        </label>
        <label className="mt-2 flex items-center gap-2">
          <span className="w-16 shrink-0">Sell ratio</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={shopMode.sellRatio}
            onChange={(e): void => {
              shopMode.setSellRatio(Number(e.target.value));
            }}
            data-testid="sell-ratio-slider"
            className="flex-1 accent-pf-primary"
          />
          <span className="w-10 text-right font-mono tabular-nums">{Math.round(shopMode.sellRatio * 100)}%</span>
        </label>
      </div>
    </details>
  );
}

function ShopViewToggle({
  view,
  onChange,
}: {
  view: ShopView;
  onChange: (v: ShopView) => void;
}): React.ReactElement {
  const base = 'px-2 py-1 text-xs font-medium uppercase tracking-widest transition-colors';
  const active = 'bg-pf-primary text-white';
  const inactive = 'text-pf-alt-dark hover:bg-pf-bg-dark/60';
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border bg-white"
      role="group"
      aria-label="Shop view"
      data-shop-view={view}
    >
      <button
        type="button"
        className={`${base} ${view === 'inventory' ? active : inactive}`}
        aria-pressed={view === 'inventory'}
        onClick={(): void => {
          onChange('inventory');
        }}
      >
        My Inventory
      </button>
      <button
        type="button"
        className={`${base} border-l border-pf-border ${view === 'shop' ? active : inactive}`}
        aria-pressed={view === 'shop'}
        onClick={(): void => {
          onChange('shop');
        }}
      >
        Shop
      </button>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }): React.ReactElement {
  const base = 'px-2 py-1 text-xs font-medium uppercase tracking-widest transition-colors';
  const active = 'bg-pf-primary text-white';
  const inactive = 'text-pf-alt-dark hover:bg-pf-bg-dark/60';
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border bg-white"
      role="group"
      aria-label="Inventory view"
      data-inventory-view={view}
    >
      <button
        type="button"
        className={`${base} ${view === 'grid' ? active : inactive}`}
        aria-pressed={view === 'grid'}
        onClick={(): void => {
          onChange('grid');
        }}
      >
        Grid
      </button>
      <button
        type="button"
        className={`${base} border-l border-pf-border ${view === 'list' ? active : inactive}`}
        aria-pressed={view === 'list'}
        onClick={(): void => {
          onChange('list');
        }}
      >
        List
      </button>
    </div>
  );
}

// ─── Coin strip ─────────────────────────────────────────────────────────

// Slug → denomination order (largest first — pp > gp > sp > cp). Amiri's
// coin items have slugs like "silver-pieces" / "gold-pieces"; unknown
// slugs fall back to reading system.price.value for the denomination
// weight, multiplied by quantity.
const COIN_SLUG_DENOM: Record<string, 'pp' | 'gp' | 'sp' | 'cp'> = {
  'platinum-pieces': 'pp',
  'gold-pieces': 'gp',
  'silver-pieces': 'sp',
  'copper-pieces': 'cp',
};

function CoinStrip({ coins }: { coins: PhysicalItem[] }): React.ReactElement {
  const totals: Record<'pp' | 'gp' | 'sp' | 'cp', number> = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const coin of coins) {
    const denom = coin.system.slug ? COIN_SLUG_DENOM[coin.system.slug] : undefined;
    if (denom) {
      totals[denom] += coin.system.quantity;
    }
  }
  return (
    <div className="flex items-center gap-4 rounded border border-amber-300 bg-amber-50 px-3 py-2" data-section="coins">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-800">Coins</span>
      {(['pp', 'gp', 'sp', 'cp'] as const).map((denom) => (
        <span
          key={denom}
          className={[
            'font-mono text-sm tabular-nums',
            totals[denom] > 0 ? 'text-neutral-900' : 'text-neutral-300',
          ].join(' ')}
        >
          <strong>{totals[denom]}</strong>{' '}
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">{denom}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Item row ───────────────────────────────────────────────────────────

function ItemRow({
  item,
  contents,
  sellContext,
}: {
  item: PhysicalItem;
  contents: PhysicalItem[];
  sellContext: SellContext | undefined;
}): React.ReactElement {
  const isContainerRow = isContainer(item);
  const bulk = item.system.bulk;
  const capacityText =
    isContainerRow && typeof bulk.capacity === 'number'
      ? `capacity ${bulk.capacity.toString()}${typeof bulk.ignored === 'number' ? ` (${bulk.ignored.toString()} ignored)` : ''}`
      : undefined;

  return (
    <li className="rounded border border-pf-border bg-white" data-item-id={item.id} data-item-type={item.type}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 hover:bg-pf-bg-dark/40">
          <img src={item.img} alt="" className="h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm text-neutral-900">{item.name}</span>
              {item.system.quantity > 1 && (
                <span className="flex-shrink-0 text-xs text-neutral-500">×{item.system.quantity}</span>
              )}
              {capacityText !== undefined && (
                <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-neutral-500">
                  {capacityText}
                </span>
              )}
            </div>
          </div>
          <EquippedBadge item={item} />
          <BulkLabel value={bulk.value} />
          {sellContext && <SellButton item={item} context={sellContext} />}
          <span className="ml-1 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-1 hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        <ItemDetailBody item={item} />
      </details>
      {isContainerRow && contents.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100 pl-6" data-container-contents={item.id}>
          {contents.map((child) => (
            <ContainerChildRow key={child.id} item={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SellButton({ item, context }: { item: PhysicalItem; context: SellContext }): React.ReactElement {
  const busy = context.pending.has(item.id);
  const unitPriceCp = priceToCp(item.system.price);
  const payoutCp = Math.floor(unitPriceCp * item.system.quantity * context.sellRatio);
  const payoutLabel = payoutCp > 0 ? formatShortCp(payoutCp) : '—';
  return (
    <button
      type="button"
      data-testid="sell-button"
      disabled={busy}
      onClick={(e): void => {
        // Prevent the enclosing <summary> from toggling the details
        // expand state when the user is aiming for the sell button.
        e.preventDefault();
        e.stopPropagation();
        void context.onSell(item);
      }}
      className={[
        'shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        busy
          ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
          : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
      ].join(' ')}
      title={`Sell for ${payoutLabel}`}
    >
      {busy ? 'Selling…' : `Sell ${payoutLabel}`}
    </button>
  );
}

// Compact denomination label for the sell button ("4 gp 8 sp"). The
// full breakdown is already in formatCp; this keeps the chip narrow by
// collapsing to the two largest non-zero denominations.
function formatShortCp(cp: number): string {
  const d = cpToDenominations(cp);
  const parts: string[] = [];
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    if (d[denom] > 0) parts.push(`${d[denom].toString()}${denom}`);
    if (parts.length === 2) break;
  }
  return parts.length === 0 ? '0cp' : parts.join(' ');
}

function ContainerChildRow({ item }: { item: PhysicalItem }): React.ReactElement {
  return (
    <li data-item-id={item.id} data-item-type={item.type}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-1.5 hover:bg-pf-bg-dark/40">
          <img src={item.img} alt="" className="h-6 w-6 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm text-neutral-800">{item.name}</span>
            {item.system.quantity > 1 && <span className="ml-2 text-xs text-neutral-500">×{item.system.quantity}</span>}
          </div>
          <BulkLabel value={item.system.bulk.value} />
          <span className="ml-1 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-1 hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        <ItemDetailBody item={item} />
      </details>
    </li>
  );
}

function GridTile({
  item,
  sellContext,
}: {
  item: PhysicalItem;
  sellContext: SellContext | undefined;
}): React.ReactElement {
  return (
    <li className="relative" data-item-id={item.id} data-item-type={item.type}>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-col items-center gap-1 rounded border border-pf-border bg-white p-2 text-center hover:bg-pf-bg-dark/40 group-open:border-pf-primary/60 group-open:shadow-lg">
          <div className="relative">
            <img src={item.img} alt="" className="h-14 w-14 rounded border border-pf-border bg-pf-bg-dark" />
            {item.system.quantity > 1 && (
              <span className="absolute -right-1 -top-1 rounded bg-pf-primary px-1 text-[10px] font-semibold text-white shadow">
                ×{item.system.quantity}
              </span>
            )}
          </div>
          <span className="line-clamp-2 text-[11px] font-medium leading-tight text-pf-text" title={item.name}>
            {item.name}
          </span>
          <div className="flex min-h-[16px] flex-wrap justify-center gap-1">
            <EquippedBadge item={item} />
          </div>
          {sellContext && <SellButton item={item} context={sellContext} />}
        </summary>
        {/* Floating detail card below the tile. Fixed 18rem width so
            descriptions stay readable even when the tile itself is
            narrow; overlaps neighbouring tiles rather than pushing
            the grid around. z-20 keeps it above nearby tiles but
            below the tab bar / popovers. */}
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded border border-pf-primary/60 bg-pf-bg p-3 text-left text-sm text-pf-text shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <img
              src={item.img}
              alt=""
              className="h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-sm font-semibold text-pf-text">{item.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
                {item.type}
                {item.system.quantity > 1 && ` · ×${item.system.quantity.toString()}`}
              </p>
            </div>
          </div>
          <ItemDescription item={item} />
        </div>
      </details>
    </li>
  );
}

function ItemDetailBody({ item }: { item: PhysicalItem }): React.ReactElement {
  return (
    <div className="border-t border-pf-border bg-pf-bg/60 px-3 py-2 text-sm text-pf-text">
      <ItemDescription item={item} />
    </div>
  );
}

// Bare description block without wrapper chrome — used inside the
// list-mode row (wrapped with its own border) and the grid-mode
// floating card (which brings its own container styling).
function ItemDescription({ item }: { item: PhysicalItem }): React.ReactElement {
  const description = (item.system.description as { value?: unknown } | undefined)?.value;
  const enriched = typeof description === 'string' && description.length > 0 ? enrichDescription(description) : '';
  if (enriched.length === 0) {
    return <p className="italic text-neutral-400">No description.</p>;
  }
  return (
    <div
      className="max-h-[24rem] overflow-y-auto pr-1 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
      dangerouslySetInnerHTML={{ __html: enriched }}
    />
  );
}

function EquippedBadge({ item }: { item: PhysicalItem }): React.ReactElement | null {
  const eq = item.system.equipped;
  if (eq.handsHeld !== undefined && eq.handsHeld > 0) {
    return <Badge color="emerald">Held ({eq.handsHeld}H)</Badge>;
  }
  if (item.type === 'armor' && eq.inSlot === true) {
    return <Badge color="emerald">Equipped</Badge>;
  }
  if (item.type === 'backpack' && eq.inSlot === true) {
    return <Badge color="sky">Worn</Badge>;
  }
  // Investment is a pf2e-specific concept: only items with the
  // `invested` trait (rings, cloaks, circlets, and similar worn
  // magical gear) consume an investment slot. Consumables, weapons,
  // and most other items can have `equipped.invested === true` left
  // on them from Foundry defaults, so we gate the badge on the trait
  // instead of trusting the flag alone.
  if (eq.invested === true && item.system.traits.value.includes('invested')) {
    return <Badge color="violet">Invested</Badge>;
  }
  return null;
}

function Badge({
  color,
  children,
}: {
  color: 'emerald' | 'sky' | 'violet';
  children: React.ReactNode;
}): React.ReactElement {
  const palette: Record<string, string> = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    sky: 'border-sky-300 bg-sky-50 text-sky-800',
    violet: 'border-violet-300 bg-violet-50 text-violet-800',
  };
  return (
    <span
      className={[
        'rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        palette[color] ?? '',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function BulkLabel({ value }: { value: number }): React.ReactElement {
  const label = value === 0 ? '—' : value < 1 ? 'L' : value.toString();
  return (
    <span className="w-6 flex-shrink-0 text-right font-mono text-[10px] uppercase tracking-wider text-neutral-400">
      {label}
    </span>
  );
}
