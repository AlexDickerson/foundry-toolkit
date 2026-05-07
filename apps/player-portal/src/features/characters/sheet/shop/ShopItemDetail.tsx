import { useEffect, useState } from 'react';
import { api } from '@/features/characters/api';
import type { CompendiumDocument, CompendiumMatch } from '@/features/characters/types';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { formatCp, priceToCp } from '@/features/characters/lib/coins';
import { extractPriceFromDocument, qualityLabel, rarityChipClass, type ItemGroup } from './shop-utils';

// ─── Document helpers (private) ──────────────────────────────────────────

function extractDescriptionFromDocument(doc: CompendiumDocument): string {
  const sys = doc.system as { description?: { value?: unknown } };
  const v = sys.description?.value;
  return typeof v === 'string' ? v : '';
}

function extractTraitsFromDocument(doc: CompendiumDocument | null): string[] {
  if (!doc) return [];
  const raw = (doc.system as { traits?: { value?: unknown } }).traits?.value;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

// ─── Full-document overlay ───────────────────────────────────────────────

/**
 * Anchored over the grid via absolute positioning. Lazily fetches the
 * compendium document for description + traits. Dismissed via ×, Esc,
 * or clicking the backdrop.
 */
export function ShopItemDetail({
  group,
  purseCp,
  pending,
  onBuy,
  onClose,
}: {
  group: ItemGroup;
  purseCp: number;
  pending: Set<string>;
  onBuy: (match: CompendiumMatch, unitPriceCp: number) => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const activeVariant = (group.variants[Math.min(selectedVariantIdx, group.variants.length - 1)] ??
    group.variants[0]) as CompendiumMatch;
  const multiVariant = group.variants.length > 1;

  const [doc, setDoc] = useState<CompendiumDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDoc(null);
      setDocError(null);
      setDocLoading(true);
    });
    api
      .getCompendiumDocument(activeVariant.uuid)
      .then((result) => {
        if (cancelled) return;
        setDoc(result.document);
        setDocLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDocError(err instanceof Error ? err.message : String(err));
        setDocLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [activeVariant.uuid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const price = activeVariant.price ?? (doc ? extractPriceFromDocument(doc) : null);
  const unitPriceCp = price ? priceToCp(price) : 0;
  const priceText = price ? formatCp(unitPriceCp) : '—';
  const canAfford = unitPriceCp === 0 || purseCp >= unitPriceCp;
  const buying = pending.has(activeVariant.uuid);
  const traits = activeVariant.traits ?? extractTraitsFromDocument(doc);
  const description = doc ? extractDescriptionFromDocument(doc) : '';
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${group.displayName} details`}
      data-testid="shop-item-detail"
      onClick={(e): void => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="absolute inset-x-0 top-0 z-20 flex items-start justify-center bg-black/10 p-2"
    >
      <div className="w-full flex-col rounded border border-pf-border bg-pf-bg shadow-lg">
        <header className="flex items-start gap-3 border-b border-pf-border p-3">
          <img
            src={activeVariant.img}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="font-serif text-base font-semibold text-pf-text">{group.displayName}</h3>
              {activeVariant.rarity && activeVariant.rarity !== 'common' && (
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${rarityChipClass(activeVariant.rarity)}`}>
                  {activeVariant.rarity}
                </span>
              )}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
              {activeVariant.type}
              {typeof activeVariant.level === 'number' && ` · Level ${activeVariant.level.toString()}`}
              {priceText !== '—' && ` · ${priceText}`}
            </p>
            {multiVariant && (
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Variant">
                {group.variants.map((v, i) => (
                  <li key={v.uuid}>
                    <button
                      type="button"
                      onClick={(): void => {
                        setSelectedVariantIdx(i);
                      }}
                      className={[
                        'rounded border px-2 py-0.5 text-[10px] font-medium',
                        i === selectedVariantIdx
                          ? 'border-pf-primary bg-pf-primary text-white'
                          : 'border-pf-border bg-pf-bg-dark text-pf-alt-dark hover:bg-pf-bg-dark/60',
                      ].join(' ')}
                    >
                      {qualityLabel(v.name)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {traits.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {traits.slice(0, 8).map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            data-testid="shop-detail-close"
            className="shrink-0 rounded border border-pf-border bg-white px-2 py-0.5 text-sm text-pf-alt-dark hover:bg-pf-bg-dark/40"
          >
            ×
          </button>
        </header>
        <div className="max-h-96 overflow-y-auto p-3 text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2">
          {docLoading && !doc ? (
            <p className="italic text-pf-alt-dark">Loading…</p>
          ) : docError !== null ? (
            <p className="italic text-pf-primary">Couldn&apos;t load description: {docError}</p>
          ) : enriched.length > 0 ? (
            <div dangerouslySetInnerHTML={{ __html: enriched }} />
          ) : (
            <p className="italic text-pf-alt-dark">No description.</p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-pf-border bg-white px-3 py-1 text-xs text-pf-alt-dark hover:bg-pf-bg-dark/40"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!canAfford || buying}
            onClick={(): void => {
              void onBuy(activeVariant, unitPriceCp);
            }}
            data-testid="shop-detail-buy"
            className={[
              'rounded border px-3 py-1 text-xs font-semibold uppercase tracking-wider',
              !canAfford
                ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
                : buying
                  ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                  : 'border-pf-primary bg-pf-primary text-white hover:bg-pf-primary-dark',
            ].join(' ')}
          >
            {buying ? 'Buying…' : canAfford ? `Buy ${priceText}` : 'Too rich'}
          </button>
        </footer>
      </div>
    </div>
  );
}
