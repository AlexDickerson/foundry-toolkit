import { useCallback, useEffect, useState } from 'react';
import type { PartyStashItem } from '@foundry-toolkit/shared/rpc';
import { api } from '../../../api/client';
import { useEventChannel } from '../../../lib/useEventChannel';
import { SectionHeader } from '../../common/SectionHeader';
import { CATEGORY_ORDER, CATEGORY_LABEL, type InventoryCategory } from './inventory-categories';

interface Props {
  /** ID of the resolved Party actor. Only mounted when a party is known;
   *  Inventory.tsx conditionally renders this component. */
  partyId: string;
  /** Display name for the stash section header. */
  partyName: string | undefined;
  /** Increment to force an immediate re-fetch (e.g. after a transfer).
   *  transferItemToActor fires createItem hooks, not updateActor, so the
   *  actors-channel SSE won't deliver an event for the party actor. */
  refreshKey?: number;
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

function StashTile({ item }: { item: PartyStashItem }): React.ReactElement {
  const qty = typeof item.system.quantity === 'number' ? (item.system.quantity as number) : null;
  return (
    <li
      className="relative rounded border border-pf-border bg-pf-bg"
      data-item-id={item.id}
      data-item-type={item.type}
    >
      <div className="flex flex-col items-center p-2">
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
      </div>
    </li>
  );
}

export function PartyStash({ partyId, partyName, refreshKey }: Props): React.ReactElement {
  const [items, setItems] = useState<PartyStashItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  const physical = items.filter((i) => PHYSICAL_ITEM_TYPES.has(i.type));
  const byCategory = groupByCategory(physical);
  const presentCategories = CATEGORY_ORDER.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  return (
    <div className="mb-4 rounded-lg border border-pf-border bg-pf-bg-dark p-4">
      <SectionHeader band>{partyName !== undefined ? `${partyName} Stash` : 'Party Stash'}</SectionHeader>
      {isLoading && <p className="mt-2 text-sm text-pf-text-muted">Loading…</p>}
      {!isLoading && physical.length === 0 && (
        <p className="mt-2 text-sm text-pf-text-muted">The stash is empty.</p>
      )}
      {!isLoading && presentCategories.length > 0 && (
        <div className="mt-3 space-y-4">
          {presentCategories.map((category) => {
            const bucket = byCategory.get(category) ?? [];
            return (
              <div key={category}>
                <SectionHeader band>{CATEGORY_LABEL[category]}</SectionHeader>
                <ul className="mt-2 grid grid-cols-6 gap-2">
                  {bucket.map((item) => (
                    <StashTile key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
