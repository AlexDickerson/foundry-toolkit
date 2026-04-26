// Shared party inventory view for players. Subscribes to the sidecar's
// inventory stream via WebSocket; any write the DM makes in dm-tool pushes
// an update here within a second or two.

import { useMemo } from 'react';
import { ConnectionIndicator } from '../components/ConnectionIndicator';
import { useLiveStream } from '../lib/live';
import type { PartyInventoryItem } from '@foundry-toolkit/shared/types';

interface InventorySnapshot {
  items: PartyInventoryItem[];
  updatedAt: string;
}

const CATEGORY_ORDER: PartyInventoryItem['category'][] = ['consumable', 'equipment', 'quest', 'treasure', 'other'];

const CATEGORY_LABELS: Record<PartyInventoryItem['category'], string> = {
  consumable: 'Consumables',
  equipment: 'Equipment',
  quest: 'Quest items',
  treasure: 'Treasure',
  other: 'Other',
};

function formatCp(cp: number | undefined): string {
  if (!cp) return '';
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const cpRem = cp % 10;
  const parts: string[] = [];
  if (gp > 0) parts.push(`${gp} gp`);
  if (sp > 0) parts.push(`${sp} sp`);
  if (cpRem > 0) parts.push(`${cpRem} cp`);
  return parts.join(' ');
}

export function Inventory() {
  const { data, status, lastUpdated } = useLiveStream<InventorySnapshot>('/api/mcp/live/inventory/stream');

  const grouped = useMemo(() => {
    const map = new Map<PartyInventoryItem['category'], PartyInventoryItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const item of data?.items ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [data]);

  const totalBulk = useMemo(
    () => (data?.items ?? []).reduce((sum, i) => sum + (i.bulk ?? 0) * i.qty, 0),
    [data],
  );
  const totalValue = useMemo(
    () => (data?.items ?? []).reduce((sum, i) => sum + (i.valueCp ?? 0) * i.qty, 0),
    [data],
  );

  const stale = status === 'disconnected' || (lastUpdated !== null && Date.now() - lastUpdated > 60_000);

  return (
    <div className="h-full overflow-y-auto bg-portal-bg text-portal-text">
      <div className="mx-auto max-w-4xl px-8 py-6">
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Party Inventory</h1>
            {data && (
              <p className="mt-1 text-sm text-portal-text-muted">
                {data.items.length} items · bulk {totalBulk.toFixed(1)} · value {formatCp(totalValue) || '—'}
              </p>
            )}
          </div>
          <ConnectionIndicator status={status} stale={stale} />
        </header>

        {!data ? (
          <p className="text-sm text-portal-text-muted">Connecting…</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-portal-text-muted">The party has nothing stashed yet.</p>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={cat} className="mb-7">
                <h2 className="mb-2.5 border-b border-portal-border pb-1.5 text-xs font-medium uppercase tracking-widest text-portal-accent">
                  {CATEGORY_LABELS[cat]}{' '}
                  <span className="text-portal-text-muted">· {list.length}</span>
                </h2>
                <ul className="m-0 list-none p-0">
                  {list.map((item) => (
                    <li
                      key={item.id}
                      className="grid items-baseline gap-4 border-b border-portal-border py-2 [grid-template-columns:1fr_auto_auto] last:border-0"
                    >
                      <div>
                        <span className="text-[15px]">{item.name}</span>
                        {item.carriedBy && (
                          <span className="ml-2.5 rounded px-1.5 py-px text-[11px] bg-portal-accent-subtle text-portal-accent">
                            {item.carriedBy}
                          </span>
                        )}
                        {item.aonUrl && (
                          <a
                            href={item.aonUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2.5 text-[11px] text-blue-500 hover:underline"
                          >
                            AoN
                          </a>
                        )}
                        {item.note && (
                          <div className="mt-0.5 text-xs italic text-portal-text-muted">{item.note}</div>
                        )}
                      </div>
                      <div className="whitespace-nowrap text-sm text-portal-text-muted">
                        {item.bulk ? `bulk ${(item.bulk * item.qty).toFixed(1)}` : ''}
                        {item.bulk && item.valueCp ? ' · ' : ''}
                        {item.valueCp ? formatCp(item.valueCp * item.qty) : ''}
                      </div>
                      <div className="min-w-[40px] text-right text-[15px] font-medium">×{item.qty}</div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
