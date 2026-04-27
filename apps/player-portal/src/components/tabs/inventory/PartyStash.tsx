import { useCallback, useEffect, useState } from 'react';
import type { PartyStashItem } from '@foundry-toolkit/shared/rpc';
import { api } from '../../../api/client';
import { useEventChannel } from '../../../lib/useEventChannel';
import { SectionHeader } from '../../common/SectionHeader';

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
  'weapon', 'armor', 'equipment', 'consumable', 'treasure', 'backpack',
]);

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

  return (
    <div className="mb-4 rounded-lg border border-pf-border bg-pf-bg-dark p-4">
      <SectionHeader band>{partyName !== undefined ? `${partyName} Stash` : 'Party Stash'}</SectionHeader>
      {isLoading && <p className="mt-2 text-sm text-pf-text-muted">Loading…</p>}
      {!isLoading && physical.length === 0 && (
        <p className="mt-2 text-sm text-pf-text-muted">The stash is empty.</p>
      )}
      {!isLoading && physical.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {physical.map((item) => {
            const qty = typeof (item.system as { quantity?: unknown }).quantity === 'number'
              ? (item.system as { quantity: number }).quantity
              : null;
            return (
              <li key={item.id} className="flex items-center gap-2 py-0.5">
                {item.img && (
                  <img src={item.img} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                )}
                <span className="flex-1 truncate text-sm text-pf-text">{item.name}</span>
                {qty !== null && qty !== 1 && (
                  <span className="shrink-0 text-xs tabular-nums text-pf-text-muted">×{qty}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
