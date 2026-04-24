import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import type { CompendiumMatch } from '../../../api/types';
import { useUuidHover } from '../../../lib/useUuidHover';
import { FeatSlot } from '../FeatSlot';
import { PickerCard } from '../PickerCard';

// After a class is picked we surface the auto-granted L1 features
// pulled off `class.system.items` — the pf2e class chassis lists
// each feature with its `{uuid, name, img, level}` and pf2e grants
// everything `level <= characterLevel` when the class item is
// attached. At creation we're always at level 1, so filter to that.
// The list is read-only for now; the Progression tab handles the
// per-level allocations once persistence is in place.
interface ClassFeatureEntry {
  uuid: string;
  name: string;
  img: string;
  level: number;
}

type ClassDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | {
      kind: 'ready';
      uuid: string;
      features: ClassFeatureEntry[];
      // pf2e's class chassis declares which levels grant a class
      // feat; we use this to decide whether the L1 class-feat slot
      // is valid (Wizard, Cleric, etc. don't grant L1 class feats).
      grantsL1ClassFeat: boolean;
    }
  | { kind: 'error'; uuid: string; message: string };

export function ClassStep({
  classPick,
  classFeat,
  classSlugResolved,
  onPickClass,
  onPickClassFeat,
  onL1FeatAvailability,
}: {
  classPick: CompendiumMatch | null;
  classFeat: CompendiumMatch | null;
  classSlugResolved: boolean;
  onPickClass: () => void;
  onPickClassFeat: () => void;
  // Bubbles the `classFeatLevels.value.includes(1)` result up to the
  // parent once the class doc resolves, so the Review section can
  // distinguish "slot vacant" from "class never granted a slot" for
  // classes like Wizard or Cleric.
  onL1FeatAvailability: (grants: boolean) => void;
}): React.ReactElement {
  const [docState, setDocState] = useState<ClassDocState>({ kind: 'idle' });
  // Hover previews on the feature chips reuse the same stack-based
  // popover plumbing as the rest of the app. Delegation handlers go
  // on the features container; `data-uuid` on each chip triggers the
  // fetch.
  const uuidHover = useUuidHover();

  useEffect(() => {
    if (classPick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocState({ kind: 'idle' });
      return;
    }
    const uuid = classPick.uuid;

    setDocState({ kind: 'loading', uuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(uuid)
      .then((res) => {
        if (cancelled) return;
        const features = extractLevel1Features(res.document.system);
        const grantsL1ClassFeat = extractGrantsL1ClassFeat(res.document.system);
        setDocState({ kind: 'ready', uuid, features, grantsL1ClassFeat });
        onL1FeatAvailability(grantsL1ClassFeat);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDocState({ kind: 'error', uuid, message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [classPick]);

  return (
    <div className="space-y-4">
      <PickerCard label="Class" selection={classPick} onOpen={onPickClass} />
      {classPick !== null && (
        <div
          className="space-y-4 border-t border-pf-border pt-4"
          onMouseOver={uuidHover.delegationHandlers.onMouseOver}
          onMouseOut={uuidHover.delegationHandlers.onMouseOut}
        >
          <div data-creator-subsection="class-features">
            <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
              Level 1 Features
            </h3>
            <ClassFeaturesList state={docState} />
          </div>
          {docState.kind === 'ready' && docState.grantsL1ClassFeat && (
            <div data-creator-subsection="class-feat">
              <FeatSlot
                label="Level 1 Class Feat"
                selection={classFeat}
                disabled={!classSlugResolved}
                onOpen={onPickClassFeat}
                {...(classSlugResolved ? {} : { disabledHint: 'Resolving class…' })}
              />
            </div>
          )}
          {docState.kind === 'ready' && !docState.grantsL1ClassFeat && (
            <p className="text-xs italic text-pf-alt-dark" data-creator-subsection="class-feat-skip">
              This class doesn&apos;t grant a class feat at level 1.
            </p>
          )}
          {uuidHover.popover}
        </div>
      )}
    </div>
  );
}

function ClassFeaturesList({ state }: { state: ClassDocState }): React.ReactElement {
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <p className="text-xs italic text-pf-alt">Loading features…</p>;
  }
  if (state.kind === 'error') {
    return <p className="text-xs text-pf-primary">Couldn&apos;t load class: {state.message}</p>;
  }
  if (state.features.length === 0) {
    return <p className="text-xs italic text-pf-alt">No auto-granted features at level 1.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" data-testid="class-l1-features">
      {state.features.map((f) => (
        <li
          key={f.uuid}
          data-uuid={f.uuid}
          className="inline-flex cursor-default items-center gap-1.5 rounded border border-pf-border bg-white px-2 py-1 text-xs text-pf-text"
        >
          <img src={f.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />
          <span className="truncate">{f.name}</span>
        </li>
      ))}
    </ul>
  );
}

function extractGrantsL1ClassFeat(system: unknown): boolean {
  const levels = (system as { classFeatLevels?: { value?: unknown } } | null)?.classFeatLevels?.value;
  return Array.isArray(levels) && levels.some((v) => v === 1);
}

function extractLevel1Features(system: unknown): ClassFeatureEntry[] {
  const items = (system as { items?: Record<string, unknown> } | null)?.items;
  if (items === undefined) return [];
  const out: ClassFeatureEntry[] = [];
  for (const raw of Object.values(items)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as { uuid?: unknown; name?: unknown; img?: unknown; level?: unknown };
    if (typeof entry.uuid !== 'string' || typeof entry.name !== 'string') continue;
    if (typeof entry.level !== 'number' || entry.level !== 1) continue;
    out.push({
      uuid: entry.uuid,
      name: entry.name,
      img: typeof entry.img === 'string' ? entry.img : '',
      level: entry.level,
    });
  }
  // Deterministic order: alphabetical so re-renders don't shuffle.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
