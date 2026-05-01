import type { PhysicalItem } from '../../../api/types';
import { useShopMode } from '../../../lib/useShopMode';
import type { ViewMode, ShopView } from './inventory-categories';

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

export function CoinStrip({ coins }: { coins: PhysicalItem[] }): React.ReactElement {
  const totals: Record<'pp' | 'gp' | 'sp' | 'cp', number> = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const coin of coins) {
    const denom = coin.system.slug ? COIN_SLUG_DENOM[coin.system.slug] : undefined;
    if (denom) {
      totals[denom] += coin.system.quantity;
    }
  }
  return (
    <div
      className="flex items-center gap-4 rounded border border-pf-tertiary-dark bg-pf-tertiary/20 px-3 py-2"
      data-section="coins"
    >
      <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">Coins</span>
      {(['pp', 'gp', 'sp', 'cp'] as const).map((denom) => (
        <span
          key={denom}
          className={[
            'font-mono text-sm tabular-nums',
            totals[denom] > 0 ? 'text-pf-text' : 'text-pf-text-muted',
          ].join(' ')}
        >
          <strong>{totals[denom]}</strong>{' '}
          <span className="text-[10px] uppercase tracking-wider text-pf-text-muted">{denom}</span>
        </span>
      ))}
    </div>
  );
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}): React.ReactElement {
  const base = 'px-2 py-1 text-xs font-medium uppercase tracking-widest transition-colors';
  const active = 'bg-pf-primary text-white';
  const inactive = 'text-pf-alt-dark hover:bg-pf-bg-dark/60';
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border bg-pf-bg"
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

export function ShopViewToggle({
  view,
  onChange,
  showShop = true,
  showPartyStash = false,
}: {
  view: ShopView;
  onChange: (v: ShopView) => void;
  showShop?: boolean;
  showPartyStash?: boolean;
}): React.ReactElement {
  const base = 'px-2 py-1 text-xs font-medium uppercase tracking-widest transition-colors';
  const active = 'bg-pf-primary text-white';
  const inactive = 'text-pf-alt-dark hover:bg-pf-bg-dark/60';
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border bg-pf-bg"
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
      {showShop && (
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
      )}
      {showPartyStash && (
        <button
          type="button"
          className={`${base} border-l border-pf-border ${view === 'party-stash' ? active : inactive}`}
          aria-pressed={view === 'party-stash'}
          onClick={(): void => {
            onChange('party-stash');
          }}
        >
          Party Stash
        </button>
      )}
    </div>
  );
}

// Compact gear-menu variant of the shop debug controls. Lives inline
// with the coins strip / shop-view toggle so it doesn't eat a whole
// row of vertical space. Uses <details> for click-to-open without
// having to wire up outside-click dismissal manually — and because
// the browser handles focus-trap and keyboard behaviour for free.
export function ShopGearMenu({
  shopMode,
  tileColumns,
  onTileColumnsChange,
}: {
  shopMode: ReturnType<typeof useShopMode>;
  tileColumns: number;
  onTileColumnsChange: (n: number) => void;
}): React.ReactElement {
  return (
    <details className="relative" data-section="shop-debug">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded border border-pf-border bg-pf-bg text-base leading-none text-pf-alt-dark hover:bg-pf-bg-dark/40"
        title="Shop settings"
        aria-label="Shop settings"
        data-testid="shop-gear"
      >
        <span aria-hidden="true">⚙</span>
      </summary>
      <div
        className="absolute right-0 top-full z-20 mt-1 w-64 rounded border border-pf-border bg-pf-bg p-3 text-xs text-pf-text shadow-lg"
        data-role="shop-gear-menu"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Debug · Shop Mode</p>
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
        <label className="mt-2 flex items-center gap-2">
          <span className="w-16 shrink-0">Chip size</span>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={tileColumns}
            onChange={(e): void => {
              onTileColumnsChange(Number(e.target.value));
            }}
            className="flex-1 accent-pf-primary"
          />
          <span className="w-10 text-right font-mono tabular-nums">{tileColumns} col</span>
        </label>
        <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
          Visible rarities
        </p>
        {(['common', 'uncommon', 'rare', 'unique'] as const).map((r) => (
          <label key={r} className="flex items-center gap-2 capitalize">
            <input
              type="checkbox"
              checked={!shopMode.disabledRarities.includes(r)}
              onChange={(e): void => {
                const next = e.target.checked
                  ? shopMode.disabledRarities.filter((x) => x !== r)
                  : [...shopMode.disabledRarities, r];
                shopMode.setDisabledRarities(next);
              }}
            />
            <span>{r}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
