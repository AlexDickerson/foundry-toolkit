import { useState } from 'react';
import type { PhysicalItem, PreparedActorItem } from '../../api/types';
import { isCoin, isContainer, isPhysicalItem } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { useUuidHover } from '../../lib/useUuidHover';

interface Props {
  items: PreparedActorItem[];
}

type ViewMode = 'list' | 'grid';

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
export function Inventory({ items }: Props): React.ReactElement {
  // One uuid-hover instance for every expanded item description —
  // event delegation on the section picks up anchors produced by
  // `enrichDescription` regardless of which item was expanded.
  const uuidHover = useUuidHover();
  const [view, setView] = useState<ViewMode>('grid');
  const physical = items.filter(isPhysicalItem);
  if (physical.length === 0) {
    return <p className="text-sm text-neutral-500">No items yet.</p>;
  }

  const coins = physical.filter(isCoin);
  const nonCoin = physical.filter((i) => !isCoin(i));

  // Items nested inside containers are rendered under the container
  // in list view. Grid view flattens everything into one tile pool
  // since container grouping doesn't survive the compact layout.
  const topLevel = nonCoin.filter((i) => !i.system.containerId);
  const byContainer = new Map<string, PhysicalItem[]>();
  for (const item of nonCoin) {
    const cid = item.system.containerId;
    if (!cid) continue;
    const arr = byContainer.get(cid) ?? [];
    arr.push(item);
    byContainer.set(cid, arr);
  }

  return (
    <section
      className="space-y-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <div className="flex items-center justify-between gap-4">
        {coins.length > 0 ? <CoinStrip coins={coins} /> : <div />}
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === 'list' ? (
        <ul className="space-y-1.5">
          {topLevel.map((item) => (
            <ItemRow key={item.id} item={item} contents={isContainer(item) ? (byContainer.get(item.id) ?? []) : []} />
          ))}
        </ul>
      ) : (
        <ul
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }}
          data-view="grid"
        >
          {nonCoin.map((item) => (
            <GridTile key={item.id} item={item} />
          ))}
        </ul>
      )}
      {uuidHover.popover}
    </section>
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

function ItemRow({ item, contents }: { item: PhysicalItem; contents: PhysicalItem[] }): React.ReactElement {
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

function GridTile({ item }: { item: PhysicalItem }): React.ReactElement {
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
  if (eq.invested === true) {
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
