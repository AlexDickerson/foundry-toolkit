import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PartyStashItem } from '@foundry-toolkit/shared/rpc';
import { api } from '../../../api/client';
import type { PreparedActorItem } from '../../../api/types';
import { coinItemsByDenom, type Denom } from '../../../lib/coins';
import { useEventChannel } from '../../../lib/useEventChannel';
import { SectionHeader } from '../../common/SectionHeader';
import { CATEGORY_ORDER, CATEGORY_LABEL, type InventoryCategory } from './inventory-categories';

interface Props {
  partyId: string;
  /** Increment to force an immediate re-fetch (e.g. after a transfer from the
   *  character sheet). transferItemToActor fires createItem hooks, not
   *  updateActor, so the actors-channel SSE won't deliver an event here. */
  refreshKey?: number;
  /** Character actor ID — enables Take/Send controls. */
  actorId?: string;
  /** Called after a successful take or coin send so the character sheet reloads. */
  onActorChanged?: () => void;
  /** Full item list from the character sheet — used to identify which coin
   *  denominations the player currently has so Send controls can be shown. */
  playerItems?: readonly PreparedActorItem[];
}

const PHYSICAL_ITEM_TYPES = new Set([
  'weapon', 'armor', 'shield', 'equipment', 'consumable', 'ammo', 'treasure', 'backpack', 'book',
]);

// ─── Stash coin helpers ───────────────────────────────────────────────────────

const COIN_DENOM_BY_SLUG: Record<string, Denom> = {
  'platinum-pieces': 'pp',
  'gold-pieces': 'gp',
  'silver-pieces': 'sp',
  'copper-pieces': 'cp',
};

interface StashCoinSlot {
  id: string;
  qty: number;
}

function stashCoinsByDenom(items: PartyStashItem[]): Partial<Record<Denom, StashCoinSlot>> {
  const out: Partial<Record<Denom, StashCoinSlot>> = {};
  for (const item of items) {
    if (item.type !== 'treasure') continue;
    if (item.system['category'] !== 'coin') continue;
    const slug = typeof item.system['slug'] === 'string' ? item.system['slug'] : null;
    if (slug === null) continue;
    const denom = COIN_DENOM_BY_SLUG[slug];
    if (denom === undefined || out[denom] !== undefined) continue;
    const qty = typeof item.system['quantity'] === 'number' ? item.system['quantity'] : 0;
    out[denom] = { id: item.id, qty };
  }
  return out;
}

function isStashCoin(item: PartyStashItem): boolean {
  return item.type === 'treasure' && item.system['category'] === 'coin';
}

const DENOMS: readonly Denom[] = ['pp', 'gp', 'sp', 'cp'];

// ─── Coin transfer row ────────────────────────────────────────────────────────

const STEP_BTN =
  'rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[10px] font-semibold text-pf-text hover:bg-pf-bg-dark disabled:opacity-40';

function CoinTransferRow({
  denom,
  stashSlot,
  playerQty,
  playerItemId,
  onSend,
  onTake,
  pending,
  canTransact,
}: {
  denom: Denom;
  stashSlot: StashCoinSlot | undefined;
  playerQty: number;
  playerItemId: string | undefined;
  onSend: (denom: Denom, itemId: string, qty: number) => void;
  onTake: (denom: Denom, itemId: string, qty: number) => void;
  pending: boolean;
  canTransact: boolean;
}): React.ReactElement {
  const [qty, setQty] = useState('1');
  const n = Math.max(1, parseInt(qty, 10) || 1);
  const stashQty = stashSlot?.qty ?? 0;

  const canSend = canTransact && playerItemId !== undefined && playerQty > 0 && n <= playerQty;
  const canTake = canTransact && stashSlot !== undefined && stashQty > 0 && n <= stashQty;

  return (
    <div className="flex items-center gap-2 text-xs" data-coin-denom={denom}>
      <span className="w-16 text-right font-mono tabular-nums text-pf-text">
        <strong>{stashQty}</strong>{' '}
        <span className="text-[10px] uppercase tracking-wider text-pf-text-muted">{denom}</span>
      </span>
      <span className="w-12 text-[10px] text-pf-text-muted">in stash</span>
      {canTransact && (
        <>
          <button
            type="button"
            aria-label={`Send ${denom} to party stash`}
            disabled={pending || !canSend}
            onClick={(): void => {
              if (playerItemId !== undefined) onSend(denom, playerItemId, n);
            }}
            className={STEP_BTN}
            title={
              playerQty === 0
                ? `You have no ${denom}`
                : n > playerQty
                  ? `You only have ${playerQty.toString()} ${denom}`
                  : undefined
            }
          >
            Send →
          </button>
          <input
            type="number"
            min="1"
            aria-label={`${denom} transfer amount`}
            value={qty}
            onChange={(e): void => {
              setQty(e.target.value);
            }}
            className="w-12 rounded border border-pf-border bg-pf-bg px-1 py-0.5 text-center font-mono text-xs text-pf-text"
          />
          <button
            type="button"
            aria-label={`Take ${denom} from party stash`}
            disabled={pending || !canTake}
            onClick={(): void => {
              if (stashSlot !== undefined) onTake(denom, stashSlot.id, n);
            }}
            className={STEP_BTN}
            title={
              stashQty === 0
                ? `Stash has no ${denom}`
                : n > stashQty
                  ? `Stash only has ${stashQty.toString()} ${denom}`
                  : undefined
            }
          >
            ← Take
          </button>
          <span className="text-[10px] text-pf-text-muted">(you: {playerQty})</span>
        </>
      )}
    </div>
  );
}

// ─── Category grouping ────────────────────────────────────────────────────────

const TYPE_TO_CATEGORY: Record<string, InventoryCategory> = {
  weapon: 'weapons',
  armor: 'armor',
  shield: 'armor',
  consumable: 'consumables',
  ammo: 'consumables',
  equipment: 'equipment',
  backpack: 'containers',
  book: 'books',
  treasure: 'treasure',
};

function groupByCategory(items: PartyStashItem[]): Map<InventoryCategory, PartyStashItem[]> {
  const out = new Map<InventoryCategory, PartyStashItem[]>();
  for (const item of items) {
    const cat = TYPE_TO_CATEGORY[item.type] ?? 'equipment';
    const arr = out.get(cat) ?? [];
    arr.push(item);
    out.set(cat, arr);
  }
  return out;
}

// ─── Stash tile ───────────────────────────────────────────────────────────────

// Shared z-index counter — ensures the most recently opened tile always
// renders above all others (same pattern as InventoryItemRow.GridTile).
let tileOpenCounter = 30;

function StashTile({
  item,
  actorId,
  onTake,
  pending,
}: {
  item: PartyStashItem;
  actorId: string | undefined;
  onTake: (item: PartyStashItem) => void;
  pending: boolean;
}): React.ReactElement {
  const qty = typeof item.system.quantity === 'number' ? item.system.quantity : null;
  const [zIndex, setZIndex] = useState<number | undefined>(undefined);
  const [flipLeft, setFlipLeft] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (zIndex === undefined) {
      setFlipLeft(false);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    setFlipLeft(panel.getBoundingClientRect().right > window.innerWidth - 8);
  }, [zIndex]);

  const openCorner = flipLeft ? 'open:rounded-l-none' : 'open:rounded-r-none';

  return (
    <li
      className="relative"
      style={zIndex !== undefined ? { zIndex } : undefined}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      <details
        className={[
          'group relative rounded border border-pf-border bg-pf-bg',
          'open:z-10 open:border-pf-primary/60 open:shadow-lg',
          openCorner,
        ].join(' ')}
        onToggle={(e) => {
          setZIndex(e.currentTarget.open ? ++tileOpenCounter : undefined);
        }}
      >
        <summary className="flex cursor-pointer list-none flex-col items-center p-2 hover:bg-pf-bg-dark/40">
          <div className="relative w-full">
            <div className="relative aspect-square w-full overflow-hidden rounded border border-pf-border bg-pf-bg-dark">
              <img src={item.img} alt="" className="h-full w-full object-contain" />
              <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1.5 py-1">
                <span
                  className="line-clamp-2 block text-[10px] font-medium leading-tight text-white"
                  title={item.name}
                >
                  {item.name}
                </span>
              </div>
            </div>
            {qty !== null && qty > 1 && (
              <span className="absolute -right-1 -top-1 rounded bg-pf-primary px-1 text-[10px] font-semibold text-white shadow">
                ×{qty}
              </span>
            )}
          </div>
        </summary>
        <div
          ref={panelRef}
          className={[
            'absolute -top-px z-20',
            flipLeft ? 'right-full rounded-l' : 'left-full rounded-r',
            'min-h-[calc(100%+2px)] w-max min-w-[150%] max-w-[300%]',
            'border border-pf-primary/60 bg-pf-bg p-4 shadow-lg',
          ].join(' ')}
        >
          {actorId !== undefined && (
            <button
              type="button"
              disabled={pending}
              onClick={(e): void => {
                e.preventDefault();
                e.stopPropagation();
                onTake(item);
              }}
              className={[
                'w-full rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider',
                pending
                  ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
              ].join(' ')}
            >
              {pending ? 'Taking…' : 'Take'}
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PartyStash({ partyId, refreshKey, actorId, onActorChanged, playerItems }: Props): React.ReactElement {
  const [items, setItems] = useState<PartyStashItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTakes, setPendingTakes] = useState<Set<string>>(new Set());
  const [pendingCoinDenom, setPendingCoinDenom] = useState<Denom | null>(null);
  const [coinTxError, setCoinTxError] = useState<string | null>(null);

  const fetchStash = useCallback((): void => {
    api
      .getPartyStash(partyId)
      .then((data) => {
        setItems(data.items);
      })
      .catch((err: unknown) => {
        console.error('PartyStash fetch failed', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [partyId]);

  useEffect(() => {
    fetchStash();
  }, [fetchStash, refreshKey]);

  useEventChannel<{ actorId: string }>('actors', (event) => {
    if (event.actorId === partyId) {
      fetchStash();
    }
  });

  const handleTake = useCallback(
    (item: PartyStashItem): void => {
      if (!actorId) return;
      setPendingTakes((prev) => new Set(prev).add(item.id));
      api
        .takeItemFromParty(
          partyId,
          item.id,
          actorId,
          typeof item.system.quantity === 'number' ? item.system.quantity : 1,
        )
        .then(() => {
          onActorChanged?.();
          fetchStash();
        })
        .catch((err: unknown) => {
          console.error('PartyStash take failed', err);
        })
        .finally(() => {
          setPendingTakes((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        });
    },
    [partyId, actorId, onActorChanged, fetchStash],
  );

  const handleSendCoin = (denom: Denom, itemId: string, qty: number): void => {
    if (actorId === undefined) return;
    setPendingCoinDenom(denom);
    setCoinTxError(null);
    api
      .transferItemToParty(actorId, itemId, partyId, qty)
      .then(() => {
        onActorChanged?.();
        fetchStash();
      })
      .catch((err: unknown) => {
        setCoinTxError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setPendingCoinDenom(null);
      });
  };

  const handleTakeCoin = (denom: Denom, itemId: string, qty: number): void => {
    if (actorId === undefined) return;
    setPendingCoinDenom(denom);
    setCoinTxError(null);
    api
      .takeItemFromParty(partyId, itemId, actorId, qty)
      .then(() => {
        onActorChanged?.();
        fetchStash();
      })
      .catch((err: unknown) => {
        setCoinTxError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setPendingCoinDenom(null);
      });
  };

  // Coin section: derive which denominations to show.
  const stashCoinMap = stashCoinsByDenom(items);
  const playerCoinMap = playerItems !== undefined ? coinItemsByDenom(playerItems) : {};
  const canCoinTransact = actorId !== undefined && playerItems !== undefined;

  const visibleCoinDenoms = DENOMS.filter(
    (d) => (stashCoinMap[d]?.qty ?? 0) > 0 || (canCoinTransact && (playerCoinMap[d]?.system.quantity ?? 0) > 0),
  );
  const showCoinSection = visibleCoinDenoms.length > 0;

  // Non-coin items go into the tile grid (coins have their own section).
  const physical = items.filter((i) => PHYSICAL_ITEM_TYPES.has(i.type));
  const nonCoinPhysical = physical.filter((i) => !isStashCoin(i));
  const byCategory = groupByCategory(nonCoinPhysical);
  const presentCategories = CATEGORY_ORDER.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  if (isLoading) {
    return <p className="text-sm text-pf-text-muted">Loading…</p>;
  }

  if (!showCoinSection && nonCoinPhysical.length === 0) {
    return <p className="text-sm text-pf-text-muted">The stash is empty.</p>;
  }

  return (
    <div className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4">
      {showCoinSection && (
        <div data-section="party-coins">
          <SectionHeader band>Coins</SectionHeader>
          {coinTxError !== null && (
            <p
              className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800"
              data-role="coin-tx-error"
            >
              {coinTxError}
            </p>
          )}
          <div className="mt-2 space-y-2">
            {visibleCoinDenoms.map((denom) => (
              <CoinTransferRow
                key={denom}
                denom={denom}
                stashSlot={stashCoinMap[denom]}
                playerQty={playerCoinMap[denom]?.system.quantity ?? 0}
                playerItemId={playerCoinMap[denom]?.id}
                onSend={handleSendCoin}
                onTake={handleTakeCoin}
                pending={pendingCoinDenom === denom}
                canTransact={canCoinTransact}
              />
            ))}
          </div>
        </div>
      )}
      {presentCategories.map((category) => {
        const bucket = byCategory.get(category) ?? [];
        return (
          <div key={category} data-category={category}>
            <SectionHeader band>{CATEGORY_LABEL[category]}</SectionHeader>
            <ul className="mt-2 grid grid-cols-6 gap-2">
              {bucket.map((item) => (
                <StashTile
                  key={item.id}
                  item={item}
                  actorId={actorId}
                  onTake={handleTake}
                  pending={pendingTakes.has(item.id)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
