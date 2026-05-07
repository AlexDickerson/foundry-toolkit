import { useState } from 'react';
import { api } from '@/features/characters/api';
import type { PhysicalItem, PointPool, PreparedActorItem } from '@/features/characters/types';
import { isCoin, isContainer, isPhysicalItem } from '@/features/characters/types';
import { useShopMode } from '@/_quarantine/lib/useShopMode';
import { useUuidHover } from '@/_quarantine/lib/useUuidHover';
import { supportsInvestment, wouldExceedInvestmentCap } from '@/_quarantine/lib/investment';
import { priceToCp } from '@/_quarantine/lib/coins';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ItemShopPicker, type BuyRequest } from '@/features/characters/sheet/shop/ItemShopPicker';
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  type InventoryCategory,
  type ViewMode,
  type ShopView,
  groupByCategory,
} from './inventory-categories';
import { spendCoins, grantCoins, type SellContext, type InvestContext, type PartyContext } from './inventory-shop';
import { ItemRow, GridTile } from './InventoryItemRow';
import { CoinStrip, ViewToggle, ShopViewToggle, ShopGearMenu } from './InventoryControls';
import { PartyStash } from './PartyStash';

interface Props {
  items: PreparedActorItem[];
  actorId?: string;
  onActorChanged?: () => void;
  investiture?: PointPool;
  /** Party actor ID, when the character is a member of a party. Drives the
   *  Party Stash tab. Undefined = no party (or lookup still in flight) —
   *  Party Stash tab is hidden. */
  partyId?: string;
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
//
export function Inventory({ items, actorId, onActorChanged, investiture, partyId }: Props): React.ReactElement {
  // One uuid-hover instance for every expanded item description —
  // event delegation on the section picks up anchors produced by
  // `enrichDescription` regardless of which item was expanded.
  const uuidHover = useUuidHover();
  const [view, setView] = useState<ViewMode>('grid');
  const [shopView, setShopView] = useState<ShopView>('inventory');
  const [pendingBuys, setPendingBuys] = useState<Set<string>>(new Set());
  const [pendingSells, setPendingSells] = useState<Set<string>>(new Set());
  const [pendingInvestments, setPendingInvestments] = useState<Set<string>>(new Set());
  const [pendingTransfers, setPendingTransfers] = useState<Set<string>>(new Set());
  const [stashNonce, setStashNonce] = useState(0);
  const [txError, setTxError] = useState<string | null>(null);
  const shopMode = useShopMode();
  const [tileColumns, setTileColumns] = useState(6);

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

  const handleTransferToParty = async (item: PhysicalItem): Promise<void> => {
    if (!canTransact || partyId === undefined) return;
    setTxError(null);
    setPendingTransfers((prev) => new Set(prev).add(item.id));
    try {
      await api.transferItemToParty(actorId, item.id, partyId, item.system.quantity);
      onActorChanged();
      setStashNonce((n) => n + 1);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingTransfers((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleToggleInvestment = async (item: PhysicalItem): Promise<void> => {
    if (!canTransact || investiture === undefined) return;
    setTxError(null);
    if (wouldExceedInvestmentCap({ value: investedCount, max: investiture.max }, item)) {
      setTxError(`Investment limit reached (${investedCount.toString()}/${investiture.max.toString()} items invested).`);
      return;
    }
    setPendingInvestments((prev) => new Set(prev).add(item.id));
    try {
      await api.updateActorItem(actorId, item.id, {
        system: { 'equipped.invested': !item.system.equipped.invested },
      });
      onActorChanged();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingInvestments((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const physical = items.filter(isPhysicalItem);
  const investedCount = physical.filter((i) => supportsInvestment(i) && i.system.equipped.invested === true).length;

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

  // Force back to 'inventory' when the chosen pane's prerequisite is gone:
  // - 'shop' requires shop mode + transact rights
  // - 'party-stash' requires a known party actor
  const effectiveShopView: ShopView =
    shopView === 'party-stash' && partyId !== undefined
      ? 'party-stash'
      : shopMode.enabled && canTransact && shopView === 'shop'
        ? 'shop'
        : 'inventory';

  // Whether the segmented selector is rendered at all.
  const hasSelector = (shopMode.enabled && canTransact) || partyId !== undefined;

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
      {physical.length === 0 && effectiveShopView === 'inventory' && !hasSelector ? (
        <p className="text-sm text-pf-text-muted">No items yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {(coins.length > 0 || canTransact) && (
              <CoinStrip
                coins={coins}
                {...(canTransact
                  ? { actorId, items, onActorChanged, onError: setTxError }
                  : {})}
              />
            )}
            {hasSelector && (
              <ShopViewToggle
                view={effectiveShopView}
                onChange={setShopView}
                showShop={shopMode.enabled && canTransact}
                showPartyStash={partyId !== undefined}
              />
            )}
            {effectiveShopView !== 'shop' && <ViewToggle view={view} onChange={setView} />}
            <ShopGearMenu shopMode={shopMode} tileColumns={tileColumns} onTileColumnsChange={setTileColumns} />
            {investiture !== undefined && investiture.max > 0 && (
              <div className="flex items-center gap-2" data-stat="investiture">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-text-muted">
                  Invested
                </span>
                <span className="font-mono text-sm tabular-nums text-pf-text">
                  {investedCount}
                  <span className="text-pf-text-muted">/{investiture.max}</span>
                </span>
              </div>
            )}
          </div>
          {effectiveShopView === 'party-stash' && partyId !== undefined ? (
            <PartyStash
              partyId={partyId}
              refreshKey={stashNonce}
              playerItems={items}
              {...(actorId !== undefined ? { actorId } : {})}
              {...(onActorChanged !== undefined ? { onActorChanged } : {})}
            />
          ) : effectiveShopView === 'shop' && canTransact ? (
            <ItemShopPicker
              items={items}
              onBuy={handleBuy}
              pending={pendingBuys}
              disabledRarities={shopMode.disabledRarities}
            />
          ) : physical.length === 0 ? (
            <p className="text-sm text-pf-text-muted">No items yet.</p>
          ) : (
            <CategorizedInventory
              view={view}
              tileColumns={tileColumns}
              topLevelByCategory={topLevelByCategory}
              allByCategory={allByCategory}
              byContainer={byContainer}
              sellContext={
                shopMode.enabled && canTransact
                  ? { sellRatio: shopMode.sellRatio, pending: pendingSells, onSell: handleSell }
                  : undefined
              }
              investContext={
                canTransact && investiture !== undefined
                  ? { investiture, pending: pendingInvestments, onToggle: handleToggleInvestment }
                  : undefined
              }
              partyContext={
                canTransact && partyId !== undefined
                  ? { partyId, pending: pendingTransfers, onTransfer: handleTransferToParty }
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

// Render the non-coin inventory grouped by category, with a
// `SectionHeader` above each non-empty bucket. List view nests
// container contents under their owning backpack row (reusing the
// existing `ItemRow` branch); grid view flattens within a category
// since tile layout doesn't carry the parent/child relationship.
function CategorizedInventory({
  view,
  tileColumns,
  topLevelByCategory,
  allByCategory,
  byContainer,
  sellContext,
  investContext,
  partyContext,
}: {
  view: ViewMode;
  tileColumns: number;
  topLevelByCategory: Map<InventoryCategory, PhysicalItem[]>;
  allByCategory: Map<InventoryCategory, PhysicalItem[]>;
  byContainer: Map<string, PhysicalItem[]>;
  sellContext: SellContext | undefined;
  investContext: InvestContext | undefined;
  partyContext: PartyContext | undefined;
}): React.ReactElement {
  const buckets = view === 'list' ? topLevelByCategory : allByCategory;
  const presentCategories = CATEGORY_ORDER.filter((c) => (buckets.get(c)?.length ?? 0) > 0);
  if (presentCategories.length === 0) {
    return <p className="text-sm text-pf-text-muted">No items yet.</p>;
  }
  return (
    <div className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4">
      {presentCategories.map((category) => {
        const bucket = buckets.get(category) ?? [];
        return (
          <div key={category} data-category={category}>
            <SectionHeader band>{CATEGORY_LABEL[category]}</SectionHeader>
            {view === 'list' ? (
              <ul className="space-y-1.5">
                {bucket.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    contents={isContainer(item) ? (byContainer.get(item.id) ?? []) : []}
                    sellContext={sellContext}
                    investContext={investContext}
                    partyContext={partyContext}
                  />
                ))}
              </ul>
            ) : (
              <ul
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))` }}
                data-view="grid"
              >
                {bucket.map((item) => (
                  <GridTile
                    key={item.id}
                    item={item}
                    sellContext={sellContext}
                    investContext={investContext}
                    partyContext={partyContext}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
