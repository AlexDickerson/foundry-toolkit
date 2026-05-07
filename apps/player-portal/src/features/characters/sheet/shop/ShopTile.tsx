import type { CompendiumMatch } from '@/features/characters/types';
import { formatCp, priceToCp } from '@/_quarantine/lib/coins';
import { rarityFooterClass, type ItemGroup, type PriceState } from './shop-utils';

// Re-export the type so callers can import it from either place.
export type { ItemGroup } from './shop-utils';

export function ShopTile({
  group,
  priceState,
  purseCp,
  buying,
  onOpen,
  onBuyDirect,
}: {
  group: ItemGroup;
  priceState: PriceState;
  purseCp: number;
  buying: boolean;
  onOpen: () => void;
  onBuyDirect: (unitPriceCp: number) => Promise<void>;
}): React.ReactElement {
  const representative = group.variants[0] as CompendiumMatch;
  const multiVariant = group.variants.length > 1;
  const price = priceState.kind === 'ready' ? priceState.price : null;
  const unitPriceCp = price ? priceToCp(price) : 0;
  const priceText = priceState.kind === 'loading' ? '…' : price ? formatCp(unitPriceCp) : '—';
  const priceReady = priceState.kind === 'ready';
  const canAfford = !priceReady || unitPriceCp === 0 || purseCp >= unitPriceCp;

  return (
    <li
      className="flex flex-col overflow-hidden rounded border border-pf-border bg-pf-bg transition-shadow hover:cursor-pointer hover:shadow-md"
      data-item-uuid={representative.uuid}
      data-affordable={canAfford ? 'true' : 'false'}
      onClick={(e): void => {
        if ((e.target as HTMLElement).closest('button, a, input')) return;
        onOpen();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e): void => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid="shop-tile"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-pf-bg-dark">
        <img src={representative.img} alt="" className="h-full w-full object-contain" />
        <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1.5 py-1">
          <span
            className="line-clamp-2 block text-[10px] font-medium leading-tight text-white"
            title={group.displayName}
          >
            {group.displayName}
          </span>
        </div>
        {multiVariant && (
          <span className="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            Variants: {group.variants.length}
          </span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 border-t px-1.5 py-1 ${rarityFooterClass(representative.rarity)}`}>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10px] tabular-nums text-pf-alt-dark"
          data-role="tile-price"
        >
          {multiVariant ? `from ${priceText}` : priceText}
        </span>
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation();
            if (multiVariant) {
              onOpen();
            } else {
              void onBuyDirect(unitPriceCp);
            }
          }}
          disabled={!multiVariant && (!canAfford || buying)}
          data-testid="shop-buy"
          className={[
            'flex-shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            !multiVariant && !canAfford
              ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
              : buying
                ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                : 'border-pf-primary bg-pf-primary text-white hover:bg-pf-primary-dark',
          ].join(' ')}
        >
          {buying ? 'Buying…' : multiVariant ? 'Select' : canAfford ? 'Buy' : 'Too rich'}
        </button>
      </div>
    </li>
  );
}
