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
import { useActorAction } from '../../lib/useActorAction';
import { useUuidHover } from '../../lib/useUuidHover';
import { SectionHeader } from '../common/SectionHeader';
import { FormulaPicker } from '../crafting/FormulaPicker';

interface Props {
  actorId: string;
  crafting: CraftingField;
}

// Short-lived local copy of the formula list — an add or remove
// updates this immediately so the UI doesn't wait on the actor event
// channel to round-trip before reflecting the change. The next
// `/prepared` refetch (triggered by the `actors` channel update on
// `system.crafting.formulas`) replaces it with the canonical set.
type OptimisticFormulas = { formulas: CraftingFormulaEntry[] } | null;

type Resolution =
  | { kind: 'loading' }
  | { kind: 'ok'; document: CompendiumDocument }
  | { kind: 'error'; message: string };

// Crafting tab — read-only view of the character's formula book plus
// each crafting ability (alchemist infused reagents, herbalist remedies,
// magical crafting, etc.). pf2e stores abilities on
// `system.crafting.entries` keyed by slug; each one has its own prepared
// formula list plus metadata. We render generically — no class-specific
// logic — so new abilities from future class features show up without
// code changes. Daily-prep mutations (prep/expend slots) aren't part of
// this read-only phase; see the standalone-play-surface plan for the
// outbound-actions step.
export function Crafting({ actorId, crafting }: Props): React.ReactElement {
  const uuidHover = useUuidHover();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticFormulas>(null);
  // Drop the optimistic override once the prop set converges with it —
  // means the bridge round-trip landed + `/prepared` refetched.
  useEffect(() => {
    if (optimistic !== null && sameFormulaSet(optimistic.formulas, crafting.formulas)) {
      setOptimistic(null);
    }
  }, [crafting.formulas, optimistic]);

  const formulas = optimistic?.formulas ?? crafting.formulas;
  const entries = useMemo(
    // Sort by label for deterministic rendering — Object.values order
    // is insertion-order which varies by how pf2e built the entries map.
    () => Object.values(crafting.entries).sort((a, b) => a.label.localeCompare(b.label)),
    [crafting.entries],
  );
  const uuids = useMemo(() => collectUuids(formulas, entries), [formulas, entries]);
  const resolutions = useUuidResolutions(uuids);
  const knownUuids = useMemo(() => new Set(formulas.map((f) => f.uuid)), [formulas]);

  const addFormula = (uuid: string): void => {
    if (knownUuids.has(uuid)) return;
    const next = [...formulas, { uuid }];
    setOptimistic({ formulas: next });
    void api.addFormula(actorId, uuid).catch(() => {
      // Revert on failure — the canonical set wins on next refetch,
      // but an immediate rollback keeps the UI honest until then.
      setOptimistic({ formulas });
    });
  };
  const removeFormula = (uuid: string): void => {
    const next = formulas.filter((f) => f.uuid !== uuid);
    setOptimistic({ formulas: next });
    void api.removeFormula(actorId, uuid).catch(() => {
      setOptimistic({ formulas });
    });
  };

  return (
    <section
      className="space-y-6"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-pf-border pb-1">
          <h2 className="font-serif text-base font-semibold uppercase tracking-wide text-pf-alt-dark">
            Formula Book
          </h2>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
            }}
            className="rounded border border-pf-primary bg-pf-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-pf-primary hover:bg-pf-primary/20"
            data-testid="add-formula-button"
          >
            + Add Formula
          </button>
        </div>
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
                onRemove={() => {
                  removeFormula(formula.uuid);
                }}
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
      {pickerOpen && (
        <FormulaPicker
          alreadyKnown={knownUuids}
          onPick={(match) => {
            addFormula(match.uuid);
            setPickerOpen(false);
          }}
          onClose={() => {
            setPickerOpen(false);
          }}
        />
      )}
    </section>
  );
}

function sameFormulaSet(a: readonly CraftingFormulaEntry[], b: readonly CraftingFormulaEntry[]): boolean {
  if (a.length !== b.length) return false;
  const aSet = new Set(a.map((f) => f.uuid));
  return b.every((f) => aSet.has(f.uuid));
}

function FormulaCard({
  actorId,
  formula,
  resolution,
  onRemove,
}: {
  actorId: string;
  formula: CraftingFormulaEntry;
  resolution: Resolution | undefined;
  onRemove: () => void;
}): React.ReactElement {
  const state = resolution ?? { kind: 'loading' as const };
  const name = state.kind === 'ok' ? state.document.name : null;
  const img = state.kind === 'ok' ? state.document.img : null;
  const level = state.kind === 'ok' ? readLevel(state.document) : null;

  // One craft state machine per card — the button lives in the
  // summary row so it's always one click from the collapsed state.
  // Clicking it must NOT toggle the parent <details>, hence the
  // preventDefault + stopPropagation in the handler.
  const craft = useActorAction({
    run: () => api.craft(actorId, formula.uuid, 1),
  });
  const pending = craft.state === 'pending';
  const craftError = typeof craft.state === 'object' ? craft.state.error : null;

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
            {craftError !== null && (
              <span className="mt-1 block truncate text-[10px] text-red-700">{craftError}</span>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {level !== null && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">Lv {level}</span>
              )}
              {formula.batch !== undefined && formula.batch > 1 && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
                  ×{formula.batch}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                // Button sits inside <summary> — prevent the native
                // toggle so clicking Craft doesn't also expand/collapse.
                e.preventDefault();
                e.stopPropagation();
                void craft.trigger();
              }}
              disabled={pending}
              className="rounded border border-pf-primary bg-pf-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-pf-primary hover:bg-pf-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              data-craft-uuid={formula.uuid}
            >
              {pending ? 'Crafting…' : 'Craft'}
            </button>
          </div>
          <span className="ml-1 self-center text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-1 hidden self-center text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        {/* Absolute-positioned body overlays the grid below rather
            than pushing siblings down — matches the Feats tab pattern.
            Containing block is the relative <li>, so left/right: 0
            align body to the summary's border-box. */}
        <div className="absolute left-0 right-0 top-full z-20 rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg px-3 py-2 text-sm text-pf-text shadow-lg">
          <FormulaDetail state={state} uuid={formula.uuid} onRemove={onRemove} />
        </div>
      </details>
    </li>
  );
}

function FormulaDetail({
  state,
  uuid,
  onRemove,
}: {
  state: Resolution;
  uuid: string;
  onRemove: () => void;
}): React.ReactElement {
  if (state.kind === 'loading') {
    return <p className="italic text-neutral-400">Loading item details…</p>;
  }
  if (state.kind === 'error') {
    return (
      <>
        <p className="text-xs text-red-700">Couldn&apos;t load this formula: {state.message}</p>
        <p className="mt-1 font-mono text-[10px] text-neutral-500">{uuid}</p>
        <div className="mt-2 flex justify-end">
          <RemoveFormulaButton onClick={onRemove} />
        </div>
      </>
    );
  }

  const doc = state.document;
  const traits = readTraits(doc);
  const rarity = readRarity(doc);
  const price = readPrice(doc);
  const description = readDescription(doc);
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  return (
    <>
      {(rarity !== null && rarity !== 'common') || price !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-pf-alt-dark">
          {rarity !== null && rarity !== 'common' && (
            <span className="font-semibold uppercase tracking-widest">{rarity}</span>
          )}
          {price !== null && (
            <span>
              <span className="font-semibold uppercase tracking-widest">Price</span> {price}
            </span>
          )}
        </div>
      ) : null}
      {traits.length > 0 && <TraitChips traits={traits} />}
      {enriched.length > 0 ? (
        <div
          className="mt-2 max-h-[28rem] overflow-y-auto pr-1 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
          dangerouslySetInnerHTML={{ __html: enriched }}
        />
      ) : (
        <p className="mt-2 italic text-neutral-400">No description.</p>
      )}
      <div className="mt-2 flex justify-end">
        <RemoveFormulaButton onClick={onRemove} />
      </div>
    </>
  );
}

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

function RemoveFormulaButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-700 hover:bg-red-100"
      data-remove-formula="true"
    >
      Remove
    </button>
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

// Collect every compendium UUID we need to resolve across the formula
// book + every crafting ability's prepared slots. Deduped so a formula
// that's also prepared only triggers one lookup.
function collectUuids(formulas: readonly CraftingFormulaEntry[], entries: readonly CraftingAbilityData[]): string[] {
  const set = new Set<string>();
  for (const f of formulas) set.add(f.uuid);
  for (const e of entries) for (const p of e.preparedFormulaData) set.add(p.uuid);
  return Array.from(set);
}

function useUuidResolutions(uuids: readonly string[]): Map<string, Resolution> {
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(() => new Map());
  // Key the effect on value rather than array identity so a new array
  // with the same contents doesn't retrigger the fetch.
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

// pf2e prices: `{ value: { pp, gp, sp, cp } }`. Render a compact
// "X gp, Y sp" summary, skipping zero denominations. Returns null if
// the item has no declared price.
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

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
