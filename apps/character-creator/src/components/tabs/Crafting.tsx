import { useEffect, useMemo, useState } from 'react';
import { api, ApiRequestError } from '../../api/client';
import type {
  CompendiumDocument,
  CraftingAbilityData,
  CraftingField,
  CraftingFormulaEntry,
  PreparedFormulaData,
} from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { useUuidHover } from '../../lib/useUuidHover';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  actorId: string;
  crafting: CraftingField;
}

type Resolution =
  | { kind: 'loading' }
  | { kind: 'ok'; document: CompendiumDocument }
  | { kind: 'error'; message: string };

// Crafting tab — read-only view of the character's formula book plus
// each crafting ability (alchemist infused reagents, herbalist remedies,
// magical crafting, etc.). Each formula card expands to a detail panel
// with description, traits, price, and a Craft button that fires the
// generic `POST /api/actors/:id/actions/craft` endpoint.
//
// Daily-prep mutations (prep / expend slots) aren't part of this phase;
// see the standalone-play-surface plan for those.
export function Crafting({ actorId, crafting }: Props): React.ReactElement {
  const uuidHover = useUuidHover();
  const formulas = crafting.formulas;
  const entries = useMemo(
    () => Object.values(crafting.entries).sort((a, b) => a.label.localeCompare(b.label)),
    [crafting.entries],
  );
  const uuids = useMemo(() => collectUuids(formulas, entries), [formulas, entries]);
  const resolutions = useUuidResolutions(uuids);

  return (
    <section
      className="space-y-6"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <div>
        <SectionHeader>Formula Book</SectionHeader>
        {formulas.length === 0 ? (
          <p className="text-xs italic text-neutral-400">No formulas known yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {formulas.map((formula) => (
              <FormulaCard
                key={formula.uuid}
                actorId={actorId}
                formula={formula}
                resolution={resolutions.get(formula.uuid)}
              />
            ))}
          </ul>
        )}
      </div>

      {entries.length > 0 && (
        <div>
          <SectionHeader>Crafting Abilities</SectionHeader>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {entries.map((entry) => (
              <CraftingAbilityCard key={entry.slug} entry={entry} resolutions={resolutions} />
            ))}
          </ul>
        </div>
      )}
      {uuidHover.popover}
    </section>
  );
}

// ─── Formula card with detail panel + Craft button ─────────────────────

function FormulaCard({
  actorId,
  formula,
  resolution,
}: {
  actorId: string;
  formula: CraftingFormulaEntry;
  resolution: Resolution | undefined;
}): React.ReactElement {
  const state = resolution ?? { kind: 'loading' as const };
  const name = state.kind === 'ok' ? state.document.name : null;
  const img = state.kind === 'ok' ? state.document.img : null;
  const level = state.kind === 'ok' ? readLevel(state.document) : null;

  return (
    <li className="relative" data-formula-uuid={formula.uuid}>
      <details className="group rounded border border-pf-border bg-white open:rounded-b-none open:border-pf-primary/60 open:shadow-lg">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-2 hover:bg-pf-bg-dark/40">
          {img !== null ? (
            <img
              src={img}
              alt=""
              className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
            />
          ) : (
            <div className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          )}
          <div className="min-w-0 flex-1">
            {state.kind === 'loading' && <span className="text-sm text-neutral-400">Loading…</span>}
            {state.kind === 'error' && (
              <>
                <span className="block text-sm text-red-700">Unresolved formula</span>
                <span className="block truncate font-mono text-[10px] text-neutral-500">{formula.uuid}</span>
              </>
            )}
            {state.kind === 'ok' && name !== null && (
              <span className="block truncate text-sm font-medium text-pf-text">{name}</span>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
            {level !== null && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">Lv {level}</span>
            )}
            {formula.batch !== undefined && formula.batch > 1 && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">×{formula.batch}</span>
            )}
          </div>
          <span className="ml-1 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-1 hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        {/* Absolute-positioned body overlays the grid below instead of
            pushing siblings down — matches the Feats tab pattern. */}
        <div className="absolute left-0 right-0 top-full z-20 rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg px-3 py-2 text-sm text-pf-text shadow-lg">
          <FormulaDetail actorId={actorId} formula={formula} state={state} />
        </div>
      </details>
    </li>
  );
}

function FormulaDetail({
  actorId,
  formula,
  state,
}: {
  actorId: string;
  formula: CraftingFormulaEntry;
  state: Resolution;
}): React.ReactElement {
  if (state.kind === 'loading') {
    return <p className="italic text-neutral-400">Loading item details…</p>;
  }
  if (state.kind === 'error') {
    return (
      <>
        <p className="text-xs text-red-700">Couldn&apos;t load this formula: {state.message}</p>
        <p className="mt-1 font-mono text-[10px] text-neutral-500">{formula.uuid}</p>
      </>
    );
  }

  const doc = state.document;
  const traits = readTraits(doc);
  const price = readPrice(doc);
  const rarity = readRarity(doc);
  const description = readDescription(doc);
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-pf-alt-dark">
        {rarity !== null && rarity !== 'common' && <span className="font-semibold capitalize">{rarity}</span>}
        {price !== null && (
          <span>
            <span className="font-semibold uppercase tracking-widest">Price</span> {price}
          </span>
        )}
      </div>
      {traits.length > 0 && <TraitChips traits={traits} />}

      {enriched.length > 0 ? (
        <div
          className="mt-2 max-h-[28rem] overflow-y-auto pr-1 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
          dangerouslySetInnerHTML={{ __html: enriched }}
        />
      ) : (
        <p className="mt-2 italic text-neutral-400">No description.</p>
      )}

      <div className="mt-3 flex items-center justify-end">
        <CraftButton actorId={actorId} itemUuid={formula.uuid} />
      </div>
    </>
  );
}

// ─── Craft button ──────────────────────────────────────────────────────

type CraftState =
  | { kind: 'idle' }
  | { kind: 'crafting' }
  | { kind: 'error'; message: string }
  | { kind: 'done' };

function CraftButton({ actorId, itemUuid }: { actorId: string; itemUuid: string }): React.ReactElement {
  const [state, setState] = useState<CraftState>({ kind: 'idle' });

  const onClick = async (): Promise<void> => {
    setState({ kind: 'crafting' });
    try {
      await api.invokeActorAction(actorId, 'craft', { itemUuid, quantity: 1 });
      setState({ kind: 'done' });
      // Reset shortly so the button is ready for another craft; actor
      // state refresh comes via the `actors` SSE channel.
      setTimeout(() => {
        setState({ kind: 'idle' });
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    }
  };

  const label =
    state.kind === 'crafting' ? 'Crafting…' : state.kind === 'done' ? 'Craft rolled ✓' : 'Craft';

  return (
    <div className="flex items-center gap-2">
      {state.kind === 'error' && <span className="text-xs text-red-700">{state.message}</span>}
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={state.kind === 'crafting'}
        className="rounded border border-pf-primary bg-pf-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pf-primary hover:bg-pf-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

// ─── Crafting ability card (unchanged shape from phase 2) ─────────────

function CraftingAbilityCard({
  entry,
  resolutions,
}: {
  entry: CraftingAbilityData;
  resolutions: Map<string, Resolution>;
}): React.ReactElement {
  const prepared = entry.preparedFormulaData;
  const slotsUsed = prepared.length;
  const slotsMax = entry.maxSlots;

  return (
    <li className="rounded border border-pf-border bg-white p-3" data-ability-slug={entry.slug}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-pf-text">{entry.label}</h3>
        <div className="flex flex-shrink-0 flex-wrap items-start justify-end gap-1">
          {entry.isAlchemical && <Badge>Alchemical</Badge>}
          {entry.isDailyPrep && <Badge>Daily Prep</Badge>}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs text-pf-alt-dark">
        <dt className="font-semibold uppercase tracking-wide">Max level</dt>
        <dd>Lv {entry.maxItemLevel}</dd>
        {entry.batchSize > 1 && (
          <>
            <dt className="font-semibold uppercase tracking-wide">Batch size</dt>
            <dd>×{entry.batchSize}</dd>
          </>
        )}
        {entry.resource !== null && (
          <>
            <dt className="font-semibold uppercase tracking-wide">Resource</dt>
            <dd>{humanizeSlug(entry.resource)}</dd>
          </>
        )}
        <dt className="font-semibold uppercase tracking-wide">Slots</dt>
        <dd>
          {slotsUsed}
          {slotsMax !== null ? ` / ${slotsMax}` : ''}
        </dd>
      </dl>

      {prepared.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-pf-border pt-2">
          {prepared.map((pf, i) => (
            <PreparedFormulaRow key={`${pf.uuid}-${i}`} prepared={pf} resolution={resolutions.get(pf.uuid)} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-pf-border pt-2 text-xs italic text-neutral-400">No slots prepared.</p>
      )}
    </li>
  );
}

function PreparedFormulaRow({
  prepared,
  resolution,
}: {
  prepared: PreparedFormulaData;
  resolution: Resolution | undefined;
}): React.ReactElement {
  const state = resolution ?? { kind: 'loading' as const };
  const name = state.kind === 'ok' ? state.document.name : null;
  const img = state.kind === 'ok' ? state.document.img : null;

  return (
    <li
      className={`flex items-center gap-2 text-xs ${prepared.expended === true ? 'opacity-50 line-through' : ''}`}
      data-prepared-uuid={prepared.uuid}
    >
      {img !== null ? (
        <img src={img} alt="" className="h-5 w-5 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      ) : (
        <div className="h-5 w-5 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      )}
      <span className="min-w-0 flex-1 truncate text-pf-text">
        {state.kind === 'ok' && name !== null ? name : prepared.uuid}
      </span>
      {prepared.isSignatureItem === true && (
        <span className="font-mono text-[10px] text-pf-primary" title="Signature item">
          ★
        </span>
      )}
      {prepared.quantity !== undefined && prepared.quantity > 1 && (
        <span className="font-mono text-[10px] text-pf-alt-dark">×{prepared.quantity}</span>
      )}
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-pf-alt-dark">
      {children}
    </span>
  );
}

function TraitChips({ traits }: { traits: string[] }): React.ReactElement {
  return (
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
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function collectUuids(formulas: readonly CraftingFormulaEntry[], entries: readonly CraftingAbilityData[]): string[] {
  const set = new Set<string>();
  for (const f of formulas) set.add(f.uuid);
  for (const e of entries) for (const p of e.preparedFormulaData) set.add(p.uuid);
  return Array.from(set);
}

function useUuidResolutions(uuids: readonly string[]): Map<string, Resolution> {
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(() => new Map());
  const uuidsKey = uuids.join('|');

  useEffect(() => {
    let cancelled = false;
    if (uuids.length === 0) {
      setResolutions(new Map());
      return;
    }
    setResolutions(new Map(uuids.map((u) => [u, { kind: 'loading' as const }])));

    void Promise.all(
      uuids.map(async (uuid): Promise<[string, Resolution]> => {
        try {
          const { document } = await api.getCompendiumDocument(uuid);
          return [uuid, { kind: 'ok', document }];
        } catch (err: unknown) {
          const message =
            err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
          return [uuid, { kind: 'error', message }];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResolutions(new Map(entries));
    });

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuidsKey]);

  return resolutions;
}

function readLevel(doc: CompendiumDocument): number | null {
  const system = doc.system as { level?: { value?: unknown } | number };
  if (typeof system === 'object' && system !== null && 'level' in system) {
    const lvl = system.level;
    if (typeof lvl === 'number') return lvl;
    if (typeof lvl === 'object' && lvl !== null && typeof lvl.value === 'number') return lvl.value;
  }
  return null;
}

function readTraits(doc: CompendiumDocument): string[] {
  const system = doc.system as { traits?: { value?: unknown } };
  const value = system?.traits?.value;
  if (!Array.isArray(value)) return [];
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

// pf2e prices: `{ value: { pp, gp, sp, cp } }`. We render a compact
// "X gp, Y sp" summary, skipping zero denominations. Returns null if
// the item has no declared price.
function readPrice(doc: CompendiumDocument): string | null {
  const system = doc.system as { price?: { value?: Record<string, unknown> } };
  const value = system?.price?.value;
  if (!value || typeof value !== 'object') return null;
  const parts: string[] = [];
  for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
    const n = value[denom];
    if (typeof n === 'number' && n > 0) parts.push(`${n} ${denom}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
