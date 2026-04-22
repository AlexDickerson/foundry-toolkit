import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../api/client';
import type { CompendiumDocument, CraftingField, CraftingFormulaEntry } from '../../api/types';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  crafting: CraftingField;
}

type Resolution =
  | { kind: 'loading' }
  | { kind: 'ok'; document: CompendiumDocument }
  | { kind: 'error'; message: string };

// Crafting tab — read-only formula book. pf2e's formulas are compendium
// UUID references, so we resolve each via `/api/compendium/document` to
// show a name/image. Daily-prep entries (alchemist bombs, herbalist
// remedies, etc.) live on `system.crafting.entries` but intentionally
// aren't rendered here — they belong with the daily-prep sub-app that
// the sheet port plan defers.
export function Crafting({ crafting }: Props): React.ReactElement {
  const formulas = crafting.formulas;
  const resolutions = useFormulaResolutions(formulas);

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

// ─── Helpers ───────────────────────────────────────────────────────────

function useFormulaResolutions(formulas: readonly CraftingFormulaEntry[]): Map<string, Resolution> {
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(() => new Map());
  // Re-run whenever the set of uuids changes. Joining into a string keys
  // the effect on value rather than array identity.
  const uuidsKey = formulas.map((f) => f.uuid).join('|');

  useEffect(() => {
    let cancelled = false;
    const uuids = formulas.map((f) => f.uuid);
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
