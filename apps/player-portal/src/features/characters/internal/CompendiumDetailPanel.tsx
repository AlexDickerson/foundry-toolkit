import { useEffect, useState } from 'react';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { api, ApiRequestError } from '@/features/characters/api';
import type { CompendiumDocument, CompendiumMatch } from '@/features/characters/types';
import { useUuidHover } from '@/_quarantine/lib/useUuidHover';
import type { Evaluation } from '@/features/characters/internal/prereqs';

type Resolution =
  | { kind: 'loading' }
  | { kind: 'ok'; document: CompendiumDocument }
  | { kind: 'error'; message: string };

interface Props {
  target: CompendiumMatch;
  onPick: () => void;
  onClose: () => void;
  /** Optional prereq evaluation for this match. Drives the prereq-row tint. */
  evaluation?: Evaluation;
  /** Optional warm doc cache (e.g. populated by the character creator's
   *  background prefetch). Hit short-circuits the fetch. */
  docCache?: Map<string, CompendiumDocument>;
  /** Prefix for the detail panel + Pick button data-testid attributes. */
  testIdPrefix?: string;
}

// Generic detail panel for the built-in CompendiumPicker detail flow.
// Reads PF2e item / spell / feat fields conservatively so the panel
// works for every document type — only fields that are present render.
// Picker callers that need extra behavior layer it in via props (e.g.
// `evaluation` for prereq tinting, `docCache` to skip the doc fetch).
export function CompendiumDetailPanel({
  target,
  onPick,
  onClose,
  evaluation,
  docCache,
  testIdPrefix,
}: Props): React.ReactElement {
  const uuidHover = useUuidHover();
  const [state, setState] = useState<Resolution>(() => {
    const cached = docCache?.get(target.uuid);
    return cached ? { kind: 'ok', document: cached } : { kind: 'loading' };
  });

  useEffect(() => {
    const cached = docCache?.get(target.uuid);
    if (cached) {
      setState({ kind: 'ok', document: cached });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void api
      .getCompendiumDocument(target.uuid)
      .then(({ document }) => {
        if (cancelled) return;
        docCache?.set(target.uuid, document);
        setState({ kind: 'ok', document });
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
  }, [target.uuid, docCache]);

  const doc = state.kind === 'ok' ? state.document : null;
  const docTraits = doc ? readTraits(doc) : null;
  const traits = docTraits ?? target.traits ?? [];
  const rarity = doc ? readRarity(doc) : null;
  const description = doc ? readDescription(doc) : '';
  const prerequisites = doc ? readPrerequisites(doc) : null;
  const actions = doc ? readActions(doc) : null;
  const trigger = doc ? readSystemTopLevelString(doc, 'trigger') : null;
  const frequency = doc ? readSystemString(doc, 'frequency') : null;
  const requirements = doc ? readSystemTopLevelString(doc, 'requirements') : null;
  const price = doc ? readPrice(doc) : null;
  const castCost = doc ? readCastCost(doc) : null;
  const range = doc ? readSystemString(doc, 'range') : null;
  const targetField = doc ? readSystemString(doc, 'target') : null;
  const area = doc ? readArea(doc) : null;
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  const failed = evaluation === 'fails';

  return (
    <aside
      className="flex w-full min-w-0 flex-1 flex-col"
      data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-detail` : undefined}
      data-detail-uuid={target.uuid}
    >
      <header className="flex items-start gap-3 border-b border-pf-border px-4 py-3">
        {target.img && (
          <img
            src={target.img}
            alt=""
            className="h-12 w-12 shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-pf-text">{target.name}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-pf-alt">
            {target.packLabel}
            {target.level !== undefined && ` · L${target.level.toString()}`}
            {rarity != null && rarity !== 'common' && ` · ${rarity}`}
            {castCost !== null && ` · Cast ${castCost}`}
          </p>
          {traits.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
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
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.kind === 'loading' && <p className="text-sm italic text-pf-alt">Loading…</p>}
        {state.kind === 'error' && (
          <p className="text-sm text-pf-primary">Failed to load: {state.message}</p>
        )}
        {state.kind === 'ok' && (
          <div className="space-y-3 text-sm text-pf-text">
            {prerequisites && prerequisites.length > 0 && (
              <DetailRow label="Prerequisites" value={prerequisites.join('; ')} fail={failed} />
            )}
            {actions != null && <DetailRow label="Actions" value={actions} />}
            {trigger != null && <DetailRow label="Trigger" value={trigger} />}
            {frequency != null && <DetailRow label="Frequency" value={frequency} />}
            {requirements != null && <DetailRow label="Requirements" value={requirements} />}
            {price != null && <DetailRow label="Price" value={price} />}
            {range != null && <DetailRow label="Range" value={range} />}
            {area != null && <DetailRow label="Area" value={area} />}
            {targetField != null && <DetailRow label="Targets" value={targetField} />}
            {enriched.length > 0 ? (
              <div
                {...uuidHover.delegationHandlers}
                className="leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
                dangerouslySetInnerHTML={{ __html: enriched }}
              />
            ) : (
              <p className="italic text-pf-alt">No description.</p>
            )}
            {uuidHover.popover}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-pf-border bg-pf-bg px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark hover:text-pf-primary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onPick}
          data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-pick` : undefined}
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white hover:brightness-110"
        >
          Pick {target.name}
        </button>
      </footer>
    </aside>
  );
}

function DetailRow({
  label,
  value,
  fail,
}: {
  label: string;
  value: string;
  fail?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        {label}
      </dt>
      <dd className={fail === true ? 'text-pf-primary' : 'text-pf-text'}>{value}</dd>
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
  const system = doc.system;
  const field = system[key];
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const v = (field as { value?: unknown }).value;
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return null;
}

function readSystemTopLevelString(doc: CompendiumDocument, key: string): string | null {
  const system = doc.system;
  const field = system[key];
  if (typeof field === 'string' && field.trim() !== '') return field;
  // Fall through to the {value} shape pf2e sometimes uses for the same field.
  return readSystemString(doc, key);
}

function readPrerequisites(doc: CompendiumDocument): string[] | null {
  const system = doc.system as { prerequisites?: { value?: unknown } };
  const raw = system?.prerequisites?.value;
  if (!Array.isArray(raw)) return null;
  const entries = raw
    .map((p) => (typeof p === 'string' ? p : (p as { value?: unknown } | undefined)?.value))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return entries.length > 0 ? entries : null;
}

function readActions(doc: CompendiumDocument): string | null {
  const system = doc.system;
  const actionsField = system['actions'] as { value?: unknown } | undefined;
  const av = actionsField?.value;
  if (typeof av === 'number') return `${av.toString()} action${av === 1 ? '' : 's'}`;
  if (typeof av === 'string' && av.length > 0) return av;
  const actionTypeField = system['actionType'] as { value?: unknown } | undefined;
  const at = actionTypeField?.value;
  if (typeof at === 'string' && at.length > 0) return at.charAt(0).toUpperCase() + at.slice(1);
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
