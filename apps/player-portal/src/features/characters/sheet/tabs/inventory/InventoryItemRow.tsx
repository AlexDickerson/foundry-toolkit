import { useLayoutEffect, useRef, useState } from 'react';
import type { PhysicalItem } from '@/features/characters/types';
import { isContainer } from '@/features/characters/types';
import { supportsInvestment } from '@/features/characters/lib/investment';
import { cpToDenominations, priceToCp } from '@/features/characters/lib/coins';
import { DetailsCard } from '@/shared/ui/DetailsCard';
import { EnrichedDescription } from '@/shared/ui/EnrichedDescription';
import type { SellContext, InvestContext, PartyContext, EquipContext } from './inventory-shop';

// Items whose img field is a /item-art/* URL have a purchased art override.
function hasArtOverride(img: string): boolean {
  return img.startsWith('/item-art/');
}

/** Thumbnail that lets the surrounding <summary> handle all click events.
 *  Art-override items get a tighter crop so the portrait fills the small box;
 *  the full art is shown in the expanded details panel instead of a lightbox. */
function ItemThumb({
  item,
  sizeClass,
  containClass,
}: {
  item: PhysicalItem;
  sizeClass: string;
  containClass?: string;
}): React.ReactElement {
  const baseImgClass = `${sizeClass} rounded border border-pf-border bg-pf-bg-dark`;
  if (hasArtOverride(item.img)) {
    return (
      <div className={`${sizeClass} overflow-hidden rounded border border-pf-border bg-pf-bg-dark flex-shrink-0`}>
        <img src={item.img} alt="" className="h-full w-full scale-150 origin-top object-cover object-[center_2%]" />
      </div>
    );
  }
  return <img src={item.img} alt="" className={`${baseImgClass} ${containClass ?? ''}`} />;
}

/** Shows the full art inside the expanded details panel for art-override items. */
function FullArtPanel({ item }: { item: PhysicalItem }): React.ReactElement | null {
  if (!hasArtOverride(item.img)) return null;
  return (
    <img
      src={item.img}
      alt={item.name}
      className="mb-3 w-full rounded border border-pf-border object-contain"
    />
  );
}

// Each tile that opens claims the next value, ensuring the most recently
// opened tile always renders above all other open tiles.
let tileOpenCounter = 30;

export function ItemRow({
  item,
  contents,
  sellContext,
  investContext,
  partyContext,
  equipContext,
}: {
  item: PhysicalItem;
  contents: PhysicalItem[];
  sellContext: SellContext | undefined;
  investContext: InvestContext | undefined;
  partyContext: PartyContext | undefined;
  equipContext: EquipContext | undefined;
}): React.ReactElement {
  const isContainerRow = isContainer(item);
  const bulk = item.system.bulk;
  const capacityText =
    isContainerRow && typeof bulk.capacity === 'number'
      ? `capacity ${bulk.capacity.toString()}${typeof bulk.ignored === 'number' ? ` (${bulk.ignored.toString()} ignored)` : ''}`
      : undefined;
  const hasInvestButton = investContext !== undefined && supportsInvestment(item);

  return (
    <>
      <DetailsCard
        data-item-id={item.id}
        data-item-type={item.type}
        summaryClassName="flex cursor-pointer list-none items-center gap-3 px-3 py-2 hover:bg-pf-bg-dark/40 [&::-webkit-details-marker]:hidden"
        summary={
          <>
            <ItemThumb item={item} sizeClass="h-8 w-8 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm text-pf-text">{item.name}</span>
                {item.system.quantity > 1 && (
                  <span className="flex-shrink-0 text-xs text-pf-text-muted">×{item.system.quantity}</span>
                )}
                {capacityText !== undefined && (
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-pf-text-muted">
                    {capacityText}
                  </span>
                )}
              </div>
            </div>
            <EquippedBadge item={item} suppressInvested={hasInvestButton} />
            {hasInvestButton && <InvestButton item={item} context={investContext} />}
            <BulkLabel value={bulk.value} />
          </>
        }
      >
        <FullArtPanel item={item} />
        {(equipContext !== undefined || sellContext !== undefined || partyContext !== undefined) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {equipContext !== undefined && supportsEquip(item) && (
              <EquipButton item={item} context={equipContext} />
            )}
            {sellContext && <SellButton item={item} context={sellContext} />}
            {partyContext && <StashButton item={item} context={partyContext} />}
          </div>
        )}
        {!hasArtOverride(item.img) && <ItemDescription item={item} />}
      </DetailsCard>
      {isContainerRow && contents.length > 0 && (
        <ul
          className="rounded-b border-x border-b border-pf-border divide-y divide-neutral-100 pl-6"
          data-container-contents={item.id}
        >
          {contents.map((child) => (
            <ContainerChildRow key={child.id} item={child} />
          ))}
        </ul>
      )}
    </>
  );
}

function ContainerChildRow({ item }: { item: PhysicalItem }): React.ReactElement {
  return (
    <DetailsCard
      data-item-id={item.id}
      data-item-type={item.type}
      summaryClassName="flex cursor-pointer list-none items-center gap-3 px-3 py-1.5 hover:bg-pf-bg-dark/40 [&::-webkit-details-marker]:hidden"
      summary={
        <>
          <ItemThumb item={item} sizeClass="h-6 w-6 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm text-neutral-800">{item.name}</span>
            {item.system.quantity > 1 && <span className="ml-2 text-xs text-pf-text-muted">×{item.system.quantity}</span>}
          </div>
          <BulkLabel value={item.system.bulk.value} />
        </>
      }
    >
      <ItemDescription item={item} />
    </DetailsCard>
  );
}

const EQUIPPED_BG = 'var(--item-equipped)';
const INVESTED_BG = 'var(--item-invested)';

export function GridTile({
  item,
  sellContext,
  investContext,
  partyContext,
  equipContext,
}: {
  item: PhysicalItem;
  sellContext: SellContext | undefined;
  investContext: InvestContext | undefined;
  partyContext: PartyContext | undefined;
  equipContext: EquipContext | undefined;
}): React.ReactElement {
  const hasInvestButton = investContext !== undefined && supportsInvestment(item);
  const equipped = isEquippedItem(item);
  const invested = isInvestedItem(item);
  const both = equipped && invested;

  const detailsClass = [
    'group relative rounded border open:z-10 open:rounded-r-none open:border-pf-primary/60 open:shadow-lg',
    both
      ? 'border-item-equipped'
      : equipped
        ? 'border-item-equipped bg-item-equipped'
        : invested
          ? 'border-item-invested bg-item-invested'
          : 'border-pf-border bg-pf-bg',
  ].join(' ');

  const detailsStyle: React.CSSProperties | undefined = both
    ? { background: `linear-gradient(135deg, ${EQUIPPED_BG} 50%, ${INVESTED_BG} 50%)` }
    : undefined;

  const summaryHover = equipped || invested ? 'hover:brightness-95' : 'hover:bg-pf-bg-dark/40';

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
  const detailsClassFull = `${detailsClass.replace('open:rounded-r-none', '')} ${openCorner}`;

  return (
    <li
      className="relative"
      style={zIndex !== undefined ? { zIndex } : undefined}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      <details
        className={detailsClassFull}
        style={detailsStyle}
        onToggle={(e) => {
          setZIndex(e.currentTarget.open ? ++tileOpenCounter : undefined);
        }}
      >
        <summary
          className={['flex cursor-pointer list-none flex-col items-center p-2', summaryHover].join(' ')}
        >
          <div className="relative w-full">
            <div className="relative aspect-square w-full overflow-hidden rounded border border-pf-border bg-pf-bg-dark">
              <img
                src={item.img}
                alt=""
                className={`h-full w-full ${hasArtOverride(item.img) ? 'scale-150 origin-top object-cover object-[center_2%]' : 'object-contain'}`}
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1.5 py-1">
                <span
                  className="line-clamp-2 block text-[10px] font-medium leading-tight text-white"
                  title={item.name}
                >
                  {item.name}
                </span>
              </div>
            </div>
            {item.system.quantity > 1 && (
              <span className="absolute -right-1 -top-1 rounded bg-pf-primary px-1 text-[10px] font-semibold text-white shadow">
                ×{item.system.quantity}
              </span>
            )}
          </div>
        </summary>
        <div
          ref={panelRef}
          className={`absolute -top-px ${flipLeft ? 'right-full' : 'left-full'} z-20 min-h-[calc(100%+2px)] w-max min-w-[150%] max-w-[300%] overflow-y-auto ${flipLeft ? 'rounded-l' : 'rounded-r'} border border-pf-primary/60 bg-pf-bg p-4 text-sm text-pf-text shadow-lg`}
        >
          {(hasInvestButton || equipContext !== undefined || sellContext !== undefined || partyContext !== undefined) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {hasInvestButton && <InvestButton item={item} context={investContext} />}
              {equipContext !== undefined && supportsEquip(item) && (
                <EquipButton item={item} context={equipContext} />
              )}
              {sellContext && <SellButton item={item} context={sellContext} />}
              {partyContext && <StashButton item={item} context={partyContext} />}
            </div>
          )}
          <FullArtPanel item={item} />
          {!hasArtOverride(item.img) && <ItemDescription item={item} />}
        </div>
      </details>
    </li>
  );
}

// Bare description block — used inside the list-mode absolute panel
// and the grid-mode floating card (each brings its own container styling).
function ItemDescription({ item }: { item: PhysicalItem }): React.ReactElement {
  const description = (item.system.description as { value?: unknown } | undefined)?.value;
  const raw = typeof description === 'string' ? description : undefined;
  return <EnrichedDescription raw={raw} maxHeightClass="max-h-[24rem]" />;
}

// Equip toggle applies to wearable/holdable item types only.
function supportsEquip(item: PhysicalItem): boolean {
  return item.type === 'weapon' || item.type === 'armor' || item.type === 'shield' || item.type === 'backpack';
}

function EquipButton({ item, context }: { item: PhysicalItem; context: EquipContext }): React.ReactElement {
  const busy = context.pending.has(item.id);
  const eq = item.system.equipped;
  const isSlotItem = item.type === 'armor' || item.type === 'backpack';
  const handsHeld = eq.handsHeld ?? 0;
  const equipped = isSlotItem ? eq.inSlot === true : handsHeld > 0;
  // Weapons with a two-hand-* trait cycle stowed → 1H → 2H → stowed.
  const hasTwoHand =
    item.type === 'weapon' && item.system.traits.value.some((t) => t.startsWith('two-hand'));

  let label: string;
  if (busy) {
    label = 'Updating…';
  } else if (isSlotItem) {
    label = equipped ? 'Remove' : item.type === 'backpack' ? 'Wear' : 'Equip';
  } else if (handsHeld === 0) {
    label = 'Hold';
  } else if (handsHeld === 1 && hasTwoHand) {
    label = '2H';
  } else {
    label = 'Stow';
  }

  return (
    <button
      type="button"
      data-testid="equip-button"
      disabled={busy}
      onClick={(e): void => {
        e.preventDefault();
        e.stopPropagation();
        void context.onToggle(item);
      }}
      aria-pressed={equipped}
      aria-label={label}
      className={[
        'shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        busy
          ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
          : equipped
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function StashButton({ item, context }: { item: PhysicalItem; context: PartyContext }): React.ReactElement {
  const busy = context.pending.has(item.id);
  return (
    <button
      type="button"
      data-testid="stash-button"
      disabled={busy}
      onClick={(e): void => {
        e.preventDefault();
        e.stopPropagation();
        void context.onTransfer(item);
      }}
      className={[
        'shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        busy
          ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
          : 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100',
      ].join(' ')}
      title="Send to party stash"
    >
      {busy ? 'Stashing…' : 'Stash'}
    </button>
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
        busy ? 'border-pf-primary bg-pf-primary/10 text-pf-primary' : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
      ].join(' ')}
      title={`Sell for ${payoutLabel}`}
    >
      {busy ? 'Selling…' : `Sell ${payoutLabel}`}
    </button>
  );
}

function InvestButton({ item, context }: { item: PhysicalItem; context: InvestContext }): React.ReactElement {
  const busy = context.pending.has(item.id);
  const isInvested = item.system.equipped.invested === true;
  return (
    <button
      type="button"
      data-testid="invest-button"
      disabled={busy}
      onClick={(e): void => {
        e.preventDefault();
        e.stopPropagation();
        void context.onToggle(item);
      }}
      className={[
        'shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        busy
          ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
          : isInvested
            ? 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'
            : 'border-violet-200 bg-white text-violet-500 hover:bg-violet-50',
      ].join(' ')}
      title={isInvested ? 'Click to uninvest' : 'Click to invest'}
      aria-pressed={isInvested}
      aria-label={isInvested ? `Uninvest ${item.name}` : `Invest ${item.name}`}
    >
      {busy ? (isInvested ? 'Uninvesting…' : 'Investing…') : isInvested ? '◆ Invested' : '◇ Invest'}
    </button>
  );
}

function EquippedBadge({
  item,
  suppressInvested = false,
}: {
  item: PhysicalItem;
  suppressInvested?: boolean;
}): React.ReactElement | null {
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
  if (!suppressInvested && eq.invested === true && item.system.traits.value.includes('invested')) {
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

function isEquippedItem(item: PhysicalItem): boolean {
  const eq = item.system.equipped;
  if (eq.handsHeld !== undefined && eq.handsHeld > 0) return true;
  if ((item.type === 'armor' || item.type === 'backpack') && eq.inSlot === true) return true;
  return false;
}

function isInvestedItem(item: PhysicalItem): boolean {
  return item.system.equipped.invested === true && item.system.traits.value.includes('invested');
}
