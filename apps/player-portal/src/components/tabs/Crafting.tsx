import { useEffect, useMemo, useState } from 'react';
import { api, ApiRequestError } from '../../api/client';
import type {
  CompendiumDocument,
  CraftingAbilityData,
  CraftingField,
  CraftingFormulaEntry,
  PreparedFormulaData,
} from '../../api/types';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  crafting: CraftingField;
}

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
export function Crafting({ crafting }: Props): React.ReactElement {
  const formulas = crafting.formulas;
  const entries = useMemo(
    // Sort by label for deterministic rendering — Object.values order
    // is insertion-order which varies by how pf2e built the entries map.
    () => Object.values(crafting.entries).sort((a, b) => a.label.localeCompare(b.label)),
    [crafting.entries],
  );
  const uuids = useMemo(() => collectUuids(formulas, entries), [formulas, entries]);
  const resolutions = useUuidResolutions(uuids);

  return (
    <section className="space-y-6">
      <div>
        <SectionHeader>Formula Book</SectionHeader>
        {formulas.length === 0 ? (
          <p className="text-xs italic text-neutral-400">No formulas known yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {formulas.map((formula) => (
              <FormulaCard key={formula.uuid} formula={formula} resolution={resolutions.get(formula.uuid)} />
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
    </section>
  );
}

function FormulaCard({
  formula,
  resolution,
}: {
  formula: CraftingFormulaEntry;
  resolution: Resolution | undefined;
}): React.ReactElement {
  const state = resolution ?? { kind: 'loading' as const };
  const name = state.kind === 'ok' ? state.document.name : null;
  const img = state.kind === 'ok' ? state.document.img : null;
  const level = state.kind === 'ok' ? readLevel(state.document) : null;

  return (
    <li
      className="flex items-start gap-3 rounded border border-pf-border bg-white px-3 py-2"
      data-formula-uuid={formula.uuid}
    >
      {img !== null ? (
        <img src={img} alt="" className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      ) : (
        <div className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      )}
      <div className="min-w-0 flex-1">
        {state.kind === 'loading' && <span className="text-sm text-neutral-400">Loading…</span>}
        {state.kind === 'error' && (
          <>
            <span className="text-sm text-red-700">Unresolved formula</span>
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
    </li>
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

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
