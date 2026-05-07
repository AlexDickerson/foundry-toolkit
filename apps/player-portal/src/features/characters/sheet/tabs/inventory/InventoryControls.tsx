import { useEffect, useState } from 'react';
import { LayoutGrid, List, Settings, ShoppingBag, UserRound, UsersRound } from 'lucide-react';
import { api } from '@/features/characters/api';
import type { PhysicalItem, PreparedActorItem } from '@/features/characters/types';
import { useShopMode } from '@/_quarantine/lib/useShopMode';
import { coinItemsByDenom, coinSlugFor, type Denom } from '@/_quarantine/lib/coins';
import type { ViewMode, ShopView } from './inventory-categories';

// Slug → denomination order (largest first — pp > gp > sp > cp). Amiri's
// coin items have slugs like "silver-pieces" / "gold-pieces"; unknown
// slugs fall back to reading system.price.value for the denomination
// weight, multiplied by quantity.
const COIN_SLUG_DENOM: Record<string, Denom> = {
  'platinum-pieces': 'pp',
  'gold-pieces': 'gp',
  'silver-pieces': 'sp',
  'copper-pieces': 'cp',
};

const DENOMS: readonly Denom[] = ['pp', 'gp', 'sp', 'cp'];

export function CoinStrip({
  coins,
  actorId,
  items,
  onActorChanged,
  onError,
}: {
  coins: PhysicalItem[];
  /** When provided alongside items + onActorChanged, the strip renders an
   *  "Edit coins" button that opens a dialog for batched +/- per-denomination
   *  edits. */
  actorId?: string;
  items?: readonly PreparedActorItem[];
  onActorChanged?: () => void;
  onError?: (msg: string | null) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const editable = actorId !== undefined && items !== undefined && onActorChanged !== undefined;

  const totals: Record<Denom, number> = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const coin of coins) {
    const denom = coin.system.slug ? COIN_SLUG_DENOM[coin.system.slug] : undefined;
    if (denom) {
      totals[denom] += coin.system.quantity;
    }
  }

  const handleApply = async (deltas: Partial<Record<Denom, number>>): Promise<void> => {
    if (actorId === undefined || items === undefined || onActorChanged === undefined) return;
    onError?.(null);
    const coinItems = coinItemsByDenom(items);
    // Per-denom direct updates so the user's "−2 sp" doesn't drain a gp via
    // largest-first greedy logic. Sequential awaits — each touches a different
    // coin item, so there's no cross-contamination of stale quantities.
    for (const denom of DENOMS) {
      const delta = deltas[denom];
      if (delta === undefined || delta === 0) continue;
      const item = coinItems[denom];
      const currentQty = item?.system.quantity ?? 0;
      const newQty = currentQty + delta;
      if (newQty < 0) {
        throw new Error(`Cannot remove ${(-delta).toString()} ${denom} — only ${currentQty.toString()} on hand.`);
      }
      if (item) {
        await api.updateActorItem(actorId, item.id, { system: { quantity: newQty } });
      } else if (delta > 0) {
        // No existing stack for this denom — pull a fresh one from the
        // pf2e equipment pack at the requested quantity. Mirrors grantCoins'
        // missing-stack fallback.
        await api.addItemFromCompendium(actorId, {
          packId: 'pf2e.equipment-srd',
          itemId: coinSlugFor(denom),
          quantity: delta,
        });
      }
    }
    onActorChanged();
  };

  return (
    <>
      {editing && editable && (
        <CoinEditDialog
          items={items}
          onClose={(): void => {
            setEditing(false);
          }}
          onApply={handleApply}
          {...(onError !== undefined ? { onError } : {})}
        />
      )}
      <div
        className="flex flex-wrap items-center gap-3 rounded border border-pf-tertiary-dark bg-pf-tertiary/20 px-3 py-2"
        data-section="coins"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">Coins</span>
        {DENOMS.map((denom) => (
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
        {editable && (
          <button
            type="button"
            aria-label="Edit coins"
            data-testid="coin-edit-button"
            onClick={(): void => {
              setEditing(true);
            }}
            className="ml-auto rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-[11px] font-semibold text-pf-text hover:bg-pf-bg-dark"
          >
            Edit
          </button>
        )}
      </div>
    </>
  );
}

// ─── Coin edit dialog ────────────────────────────────────────────────────────

function CoinEditDialog({
  items,
  onClose,
  onApply,
  onError,
}: {
  items: readonly PreparedActorItem[];
  onClose: () => void;
  onApply: (deltas: Partial<Record<Denom, number>>) => Promise<void>;
  onError?: (msg: string | null) => void;
}): React.ReactElement {
  const [deltas, setDeltas] = useState<Record<Denom, string>>({ pp: '', gp: '', sp: '', cp: '' });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return (): void => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const coinItems = coinItemsByDenom(items);
  const currentQty: Record<Denom, number> = {
    pp: coinItems.pp?.system.quantity ?? 0,
    gp: coinItems.gp?.system.quantity ?? 0,
    sp: coinItems.sp?.system.quantity ?? 0,
    cp: coinItems.cp?.system.quantity ?? 0,
  };

  // Parse non-empty inputs into ints, dropping zeros and unparseable values.
  const parsedDeltas: Partial<Record<Denom, number>> = {};
  for (const denom of DENOMS) {
    const text = deltas[denom].trim();
    if (text === '' || text === '-' || text === '+') continue;
    const n = parseInt(text, 10);
    if (Number.isInteger(n) && n !== 0) parsedDeltas[denom] = n;
  }

  // Inline validation: any negative delta whose abs() exceeds current qty.
  let validationError: string | null = null;
  for (const denom of DENOMS) {
    const delta = parsedDeltas[denom];
    if (delta === undefined) continue;
    if (delta < 0 && Math.abs(delta) > currentQty[denom]) {
      validationError = `Cannot remove ${Math.abs(delta).toString()} ${denom} — only ${currentQty[denom].toString()} on hand.`;
      break;
    }
  }

  const hasChanges = Object.keys(parsedDeltas).length > 0;
  const canApply = hasChanges && validationError === null && !applying;

  const handleApply = async (): Promise<void> => {
    setApplyError(null);
    setApplying(true);
    try {
      await onApply(parsedDeltas);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApplyError(msg);
      onError?.(msg);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="coin-edit-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Edit coins"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded border border-pf-border bg-pf-bg shadow-2xl"
        data-testid="coin-edit-dialog"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-pf-text">Edit coins</h2>
          <p className="mt-1 text-[11px] text-pf-text-muted">
            Positive values add coins; negative values remove them.
          </p>
          <div className="mt-3 space-y-2">
            {DENOMS.map((denom) => (
              <div
                key={denom}
                className="flex items-center gap-3 text-xs"
                data-coin-edit-row={denom}
              >
                <span className="w-8 font-semibold uppercase tracking-wider text-pf-alt-dark">{denom}</span>
                <span className="w-12 text-right font-mono tabular-nums text-pf-text">
                  {currentQty[denom]}
                </span>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  aria-label={`${denom} delta`}
                  value={deltas[denom]}
                  onChange={(e): void => {
                    setDeltas((prev) => ({ ...prev, [denom]: e.target.value }));
                  }}
                  className="w-24 rounded border border-pf-border bg-pf-bg px-2 py-1 text-center font-mono text-pf-text"
                />
              </div>
            ))}
          </div>
          {(applyError ?? validationError) !== null && (
            <p
              className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800"
              data-role="coin-edit-error"
            >
              {applyError ?? validationError}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border bg-pf-bg-dark/60 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            data-testid="coin-edit-cancel"
            className="rounded border border-pf-border bg-pf-bg px-3 py-1.5 text-sm text-pf-text hover:bg-pf-bg-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={(): void => {
              void handleApply();
            }}
            data-testid="coin-edit-apply"
            className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-pf-primary-dark disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </footer>
      </div>
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
  const base = 'flex items-center justify-center px-2 py-2 transition-colors';
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
        aria-label="Grid view"
        onClick={(): void => {
          onChange('grid');
        }}
      >
        <LayoutGrid size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${base} border-l border-pf-border ${view === 'list' ? active : inactive}`}
        aria-pressed={view === 'list'}
        aria-label="List view"
        onClick={(): void => {
          onChange('list');
        }}
      >
        <List size={14} aria-hidden="true" />
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
  const base = 'flex items-center justify-center px-2 py-2 transition-colors';
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
        aria-label="Player inventory"
        onClick={(): void => {
          onChange('inventory');
        }}
      >
        <UserRound size={14} aria-hidden="true" />
      </button>
      {showPartyStash && (
        <button
          type="button"
          className={`${base} border-l border-pf-border ${view === 'party-stash' ? active : inactive}`}
          aria-pressed={view === 'party-stash'}
          aria-label="Party stash"
          onClick={(): void => {
            onChange('party-stash');
          }}
        >
          <UsersRound size={14} aria-hidden="true" />
        </button>
      )}
      {showShop && (
        <button
          type="button"
          className={`${base} border-l border-pf-border ${view === 'shop' ? active : inactive}`}
          aria-pressed={view === 'shop'}
          aria-label="Shop"
          onClick={(): void => {
            onChange('shop');
          }}
        >
          <ShoppingBag size={14} aria-hidden="true" />
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
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded border border-pf-border bg-pf-bg text-base leading-none text-pf-alt-dark hover:bg-pf-bg-dark/40"
        title="Shop settings"
        aria-label="Shop settings"
        data-testid="shop-gear"
      >
        <Settings size={14} aria-hidden="true" />
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
