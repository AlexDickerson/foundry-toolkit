import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PartyStashItem } from '@foundry-toolkit/shared/rpc';
import { api } from '../../../api/client';
import { useEventChannel } from '../../../lib/useEventChannel';
import { SectionHeader } from '../../common/SectionHeader';
import { CATEGORY_ORDER, CATEGORY_LABEL, type InventoryCategory } from './inventory-categories';

interface Props {
  partyId: string;
  /** Increment to force an immediate re-fetch (e.g. after a transfer from the
   *  character sheet). transferItemToActor fires createItem hooks, not
   *  updateActor, so the actors-channel SSE won't deliver an event here. */
  refreshKey?: number;
  /** Character actor ID — enables the "Take" button on stash tiles. */
  actorId?: string;
  /** Called after a successful take so the character sheet reloads. */
  onActorChanged?: () => void;
}

const PHYSICAL_ITEM_TYPES = new Set([
  'weapon', 'armor', 'shield', 'equipment', 'consumable', 'ammo', 'treasure', 'backpack', 'book',
]);

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
  const qty = typeof item.system.quantity === 'number' ? (item.system.quantity as number) : null;
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

export function PartyStash({ partyId, refreshKey, actorId, onActorChanged }: Props): React.ReactElement {
  const [items, setItems] = useState<PartyStashItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTakes, setPendingTakes] = useState<Set<string>>(new Set());

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
        .takeItemFromParty(partyId, item.id, actorId, typeof item.system.quantity === 'number' ? (item.system.quantity as number) : 1)
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

  const physical = items.filter((i) => PHYSICAL_ITEM_TYPES.has(i.type));
  const byCategory = groupByCategory(physical);
  const presentCategories = CATEGORY_ORDER.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  if (isLoading) {
    return <p className="text-sm text-pf-text-muted">Loading…</p>;
  }

  if (physical.length === 0) {
    return <p className="text-sm text-pf-text-muted">The stash is empty.</p>;
  }

  return (
    <div className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4">
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
