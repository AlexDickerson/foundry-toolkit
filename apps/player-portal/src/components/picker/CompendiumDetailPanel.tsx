import { useEffect, useState } from 'react';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { api, ApiRequestError } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch } from '../../api/types';

type Resolution =
  | { kind: 'loading' }
  | { kind: 'ok'; document: CompendiumDocument }
  | { kind: 'error'; message: string };

interface Props {
  target: CompendiumMatch;
  onPick: () => void;
  onClose: () => void;
  /** Prefix for the detail panel and Pick button data-testid attributes. */
  testIdPrefix?: string;
}

// Generic detail panel for the built-in CompendiumPicker detail flow.
// Fetches the full document for description + price + spell metadata,
// and renders a Pick button so callers can confirm the selection.
// Picker callers that need prereq-aware detail (the character creator
// and Progression class-feat picker) provide their own panel via the
// CompendiumPicker `splitPane` prop instead.
export function CompendiumDetailPanel({ target, onPick, onClose, testIdPrefix }: Props): React.ReactElement {
  const [state, setState] = useState<Resolution>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void api
      .getCompendiumDocument(target.uuid)
      .then(({ document }) => {
        if (!cancelled) setState({ kind: 'ok', document });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        setState({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [target.uuid]);

  const docTraits = state.kind === 'ok' ? readTraits(state.document) : null;
  const traits = docTraits ?? target.traits ?? [];
  const rarity = state.kind === 'ok' ? readRarity(state.document) : null;
  const price = state.kind === 'ok' ? readPrice(state.document) : null;
  const description = state.kind === 'ok' ? readDescription(state.document) : '';
  const castCost = state.kind === 'ok' ? readCastCost(state.document) : null;
  const range = state.kind === 'ok' ? readSystemString(state.document, 'range') : null;
  const targetField = state.kind === 'ok' ? readSystemString(state.document, 'target') : null;
  const area = state.kind === 'ok' ? readArea(state.document) : null;
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  return (
    <div
      className="flex w-full flex-1 flex-col"
      data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-detail` : undefined}
    >
      <div className="flex items-start gap-3 border-b border-pf-border px-4 py-3">
        <img
          src={target.img}
          alt=""
          className="h-12 w-12 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-pf-text">{target.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pf-alt-dark">
            {target.level !== undefined && <span>Level {target.level}</span>}
            {rarity !== null && rarity !== 'common' && (
              <span className="font-semibold uppercase tracking-widest">{rarity}</span>
            )}
            {castCost !== null && <span>Cast {castCost}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm text-pf-text">
        {traits.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {traits.map((t) => (
              <li
                key={t}
                className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
              >
                {humanizeSlug(t)}
              </li>
            ))}
          </ul>
        )}
        {(price !== null || range !== null || targetField !== null || area !== null) && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-pf-alt-dark">
            {price !== null && (
              <>
                <dt className="font-semibold uppercase tracking-widest">Price</dt>
                <dd>{price}</dd>
              </>
            )}
            {range !== null && (
              <>
                <dt className="font-semibold uppercase tracking-widest">Range</dt>
                <dd>{range}</dd>
              </>
            )}
            {area !== null && (
              <>
                <dt className="font-semibold uppercase tracking-widest">Area</dt>
                <dd>{area}</dd>
              </>
            )}
            {targetField !== null && (
              <>
                <dt className="font-semibold uppercase tracking-widest">Targets</dt>
                <dd>{targetField}</dd>
              </>
            )}
          </dl>
        )}
        {state.kind === 'loading' && <p className="mt-3 italic text-pf-alt">Loading details…</p>}
        {state.kind === 'error' && (
          <p className="mt-3 text-pf-primary">Failed to load: {state.message}</p>
        )}
        {state.kind === 'ok' &&
          (enriched.length > 0 ? (
            <div
              className="mt-3 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: enriched }}
            />
          ) : (
            <p className="mt-3 italic text-pf-alt">No description.</p>
          ))}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
        <button
          type="button"
          onClick={onPick}
          data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-pick` : undefined}
          className="rounded border border-pf-primary bg-pf-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-primary hover:bg-pf-primary/20"
        >
          Pick
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readTraits(doc: CompendiumDocument): string[] | null {
  const system = doc.system as { traits?: { value?: unknown } };
  const value = system?.traits?.value;
  if (!Array.isArray(value)) return null;
  return value.filter((t): t is string => typeof t === 'string');
}

function readRarity(doc: CompendiumDocument): string | null {
  const system = doc.system as { traits?: { rarity?: unknown } };
  const r = system?.traits?.rarity;
  return typeof r === 'string' ? r : null;
}

function readDescription(doc: CompendiumDocument): string {
  const system = doc.system as { description?: { value?: unknown } };
  const v = system?.description?.value;
  return typeof v === 'string' ? v : '';
}

function readPrice(doc: CompendiumDocument): string | null {
  const system = doc.system as { price?: { value?: Record<string, unknown> } };
  const value = system?.price?.value;
  if (!value || typeof value !== 'object') return null;
  const parts: string[] = [];
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const n = value[denom];
    if (typeof n === 'number' && n > 0) parts.push(`${n.toString()} ${denom}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function readSystemString(doc: CompendiumDocument, key: string): string | null {
  const system = doc.system as Record<string, unknown>;
  const field = system[key];
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const v = (field as { value?: unknown }).value;
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return null;
}

function readCastCost(doc: CompendiumDocument): string | null {
  const system = doc.system as { time?: { value?: unknown } };
  const v = system?.time?.value;
  if (typeof v !== 'string' || v === '') return null;
  if (v === '1') return '◆';
  if (v === '2') return '◆◆';
  if (v === '3') return '◆◆◆';
  if (v === 'reaction') return '↺';
  if (v === 'free') return '◇';
  return v;
}

function readArea(doc: CompendiumDocument): string | null {
  const system = doc.system as { area?: { type?: unknown; value?: unknown } };
  const area = system?.area;
  if (!area) return null;
  const value = area.value;
  if (value === undefined || value === '' || value === 0) return null;
  const v =
    typeof value === 'number' ? `${value.toString()}-foot` : typeof value === 'string' ? value : null;
  if (v === null) return null;
  return typeof area.type === 'string' && area.type !== '' ? `${v} ${area.type}` : v;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
