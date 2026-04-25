import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import type { AbilityKey, CompendiumMatch } from '../../../api/types';
import { ABILITY_KEYS } from '../../../api/types';
import { BoostedMod } from '../../../components/creator/AbilityBoostPicker';
import { ABILITY_LABEL, BOOSTS_REQUIRED } from '../constants';
import type { Draft } from '../types';

// Boost-slot shape normalised from pf2e's compendium data. Ancestry
// and background both store `system.boosts` as an indexed record of
// slots; class stores a single `system.keyAbility`. Each slot's
// `value` array is: one entry for fixed, 2+ entries for a
// constrained choice, all six (or empty) for a free pick.
type SlotKind = 'fixed' | 'free';
interface ParsedSlot {
  kind: SlotKind;
  options: AbilityKey[];
}
type SourceDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; slots: ParsedSlot[] }
  | { kind: 'error'; uuid: string; message: string };

export function AttributesStep({
  actorId,
  ancestryPick,
  ancestryItemId,
  backgroundPick,
  backgroundItemId,
  classPick,
  classItemId,
  levelOneBoosts,
  ancestryBoosts,
  backgroundBoosts,
  classKeyAbility,
  onDraftPatch,
}: {
  actorId: string | null;
  ancestryPick: CompendiumMatch | null;
  ancestryItemId: string | null;
  backgroundPick: CompendiumMatch | null;
  backgroundItemId: string | null;
  classPick: CompendiumMatch | null;
  classItemId: string | null;
  levelOneBoosts: AbilityKey[];
  ancestryBoosts: (AbilityKey | null)[];
  backgroundBoosts: (AbilityKey | null)[];
  classKeyAbility: AbilityKey | null;
  onDraftPatch: (patch: Partial<Draft>) => void;
}): React.ReactElement {
  const ancestryDoc = useSourceSlots(ancestryPick, parseAncestryOrBackgroundSlots);
  // Flaws are parsed separately from the same ancestry doc — pf2e
  // applies them automatically when the item attaches, so we surface
  // them as read-only context inside the Ancestry section.
  const ancestryFlaws = useSourceSlots(ancestryPick, parseAncestryFlaws);
  const backgroundDoc = useSourceSlots(backgroundPick, parseAncestryOrBackgroundSlots);
  const classDoc = useSourceSlots(classPick, (sys) => {
    const slot = parseClassKeyAbility(sys);
    return slot !== null ? [slot] : [];
  });

  // Seed the draft picks once the docs arrive with fixed slots
  // pre-filled. Runs when the slot shape changes so switching
  // ancestry/class mid-step resets correctly.
  useEffect(() => {
    if (ancestryDoc.kind !== 'ready') return;
    if (ancestryBoosts.length === ancestryDoc.slots.length) return;
    onDraftPatch({ ancestryBoosts: seedPicks(ancestryDoc.slots) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestryDoc.kind === 'ready' ? ancestryDoc.uuid : null, ancestryDoc.kind]);
  useEffect(() => {
    if (backgroundDoc.kind !== 'ready') return;
    if (backgroundBoosts.length === backgroundDoc.slots.length) return;
    onDraftPatch({ backgroundBoosts: seedPicks(backgroundDoc.slots) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundDoc.kind === 'ready' ? backgroundDoc.uuid : null, backgroundDoc.kind]);
  useEffect(() => {
    if (classDoc.kind !== 'ready') return;
    if (classKeyAbility !== null) return;
    const first = classDoc.slots[0];
    if (first === undefined) return;
    if (first.kind === 'fixed' && first.options[0] !== undefined) {
      onDraftPatch({ classKeyAbility: first.options[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classDoc.kind === 'ready' ? classDoc.uuid : null, classDoc.kind]);

  // L1 free boosts live directly on the actor's build attributes —
  // pf2e's attribute builder writes them here, no per-item plumbing.
  const patchFreeBoosts = (next: AbilityKey[]): void => {
    if (actorId === null) return;
    void api
      .updateActor(actorId, {
        system: { build: { attributes: { boosts: { 1: next } } } },
      })
      .catch((err: unknown) => {
        console.warn('Failed to flush level-1 boosts', err);
      });
  };

  // Ancestry / background / class selections live on the embedded
  // items themselves (e.g. `ancestry.system.boosts.2.selected`).
  // pf2e derives `actor.system.build.attributes.boosts.*` from those
  // on actor prepare, so writing the actor path directly gets
  // overwritten next prep. We use dot-notation keys so Foundry's
  // deep-merge targets the exact nested field.
  const patchItem = (itemId: string | null, systemKey: string, value: unknown): void => {
    if (actorId === null || itemId === null) return;
    void api.updateActorItem(actorId, itemId, { system: { [systemKey]: value } }).catch((err: unknown) => {
      console.warn(`Failed to flush ${systemKey}`, err);
    });
  };

  const toggleFreeBoost = (key: AbilityKey): void => {
    let next: AbilityKey[];
    if (levelOneBoosts.includes(key)) {
      next = levelOneBoosts.filter((k) => k !== key);
    } else if (levelOneBoosts.length >= BOOSTS_REQUIRED) {
      return;
    } else {
      next = [...levelOneBoosts, key];
    }
    onDraftPatch({ levelOneBoosts: next });
    patchFreeBoosts(next);
  };

  const setAncestrySlot = (slotIdx: number, key: AbilityKey): void => {
    const next = [...ancestryBoosts];
    next[slotIdx] = key;
    onDraftPatch({ ancestryBoosts: next });
    patchItem(ancestryItemId, `boosts.${slotIdx.toString()}.selected`, key);
  };

  const setBackgroundSlot = (slotIdx: number, key: AbilityKey): void => {
    const next = [...backgroundBoosts];
    next[slotIdx] = key;
    onDraftPatch({ backgroundBoosts: next });
    patchItem(backgroundItemId, `boosts.${slotIdx.toString()}.selected`, key);
  };

  const setClassKeyAbility = (key: AbilityKey): void => {
    onDraftPatch({ classKeyAbility: key });
    patchItem(classItemId, 'keyAbility.selected', key);
  };

  return (
    <div className="space-y-5">
      <BoostSourceBlock
        label={ancestryPick !== null ? `Ancestry · ${ancestryPick.name}` : 'Ancestry'}
        state={ancestryDoc}
        placeholderText="Pick an ancestry on the previous step to see its boosts."
        picks={ancestryBoosts}
        onPick={setAncestrySlot}
        flaws={ancestryFlaws}
      />
      <BoostSourceBlock
        label={backgroundPick !== null ? `Background · ${backgroundPick.name}` : 'Background'}
        state={backgroundDoc}
        placeholderText="Pick a background on the previous step to see its boosts."
        picks={backgroundBoosts}
        onPick={setBackgroundSlot}
      />
      <BoostSourceBlock
        label={classPick !== null ? `Class · ${classPick.name} key attribute` : 'Class key attribute'}
        state={classDoc}
        placeholderText="Pick a class on the previous step to choose its key attribute."
        picks={classKeyAbility !== null ? [classKeyAbility] : [null]}
        onPick={(_slot, key): void => {
          setClassKeyAbility(key);
        }}
      />
      <FreeBoostBlock selected={levelOneBoosts} onToggle={toggleFreeBoost} />
    </div>
  );
}

// Lazy-fetches the compendium document for a picked item and parses
// its boost config. Cached per-pick so flipping between sources
// doesn't refetch. Returns an SourceDocState; callers render from
// whichever state surfaces.
function useSourceSlots(pick: CompendiumMatch | null, parse: (system: unknown) => ParsedSlot[]): SourceDocState {
  const [state, setState] = useState<SourceDocState>({ kind: 'idle' });
  useEffect(() => {
    if (pick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'idle' });
      return;
    }
    const uuid = pick.uuid;

    setState({ kind: 'loading', uuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(uuid)
      .then((res) => {
        if (cancelled) return;
        setState({ kind: 'ready', uuid, slots: parse(res.document.system) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', uuid, message });
      });
    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.uuid]);
  return state;
}

function BoostSourceBlock({
  label,
  state,
  placeholderText,
  picks,
  onPick,
  flaws,
}: {
  label: string;
  state: SourceDocState;
  placeholderText: string;
  picks: (AbilityKey | null)[];
  onPick: (slotIdx: number, key: AbilityKey) => void;
  /** Optional read-only flaw slots (ancestry only for pf2e). The
   *  picks aren't ours — pf2e applies them automatically — so we
   *  just display them as context. */
  flaws?: SourceDocState;
}): React.ReactElement {
  const flawSlots = flaws?.kind === 'ready' ? flaws.slots : [];
  return (
    <section>
      <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</h3>
      {state.kind === 'idle' && <p className="text-xs italic text-pf-alt-dark">{placeholderText}</p>}
      {state.kind === 'loading' && <p className="text-xs italic text-pf-alt-dark">Loading…</p>}
      {state.kind === 'error' && <p className="text-xs text-pf-primary">Couldn&apos;t load: {state.message}</p>}
      {state.kind === 'ready' && state.slots.length === 0 && (
        <p className="text-xs italic text-pf-alt-dark">No boosts from this source.</p>
      )}
      {state.kind === 'ready' && state.slots.length > 0 && (
        <ul className="space-y-2">
          {state.slots.map((slot, idx) => (
            <li key={idx.toString()} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] uppercase tracking-widest text-pf-alt">Boost {idx + 1}</span>
              <BoostSlotPicker
                slot={slot}
                selected={picks[idx] ?? null}
                onPick={(key): void => {
                  onPick(idx, key);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {flawSlots.length > 0 && <FlawChips slots={flawSlots} />}
    </section>
  );
}

function FlawChips({ slots }: { slots: ParsedSlot[] }): React.ReactElement {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-2" data-role="ancestry-flaws">
      <li className="text-[10px] uppercase tracking-widest text-pf-alt">Flaws</li>
      {slots.map((slot, idx) => {
        if (slot.kind === 'fixed') {
          const ability = slot.options[0];
          return (
            <li key={idx.toString()}>
              <span
                className="inline-flex items-center gap-1 rounded border border-pf-primary/40 bg-pf-primary/10 px-2 py-1 font-mono text-xs tabular-nums text-pf-primary"
                data-flaw={ability}
                title="Applied automatically by pf2e"
              >
                −1 {ability?.toUpperCase()}
              </span>
            </li>
          );
        }
        // Rare: ancestry with a choice of flaws. pf2e still applies
        // the selection; we surface the options as-is so the reader
        // knows a flaw is pending. MVP renders them read-only.
        return (
          <li key={idx.toString()}>
            <span className="inline-flex items-center gap-1 rounded border border-pf-primary/40 bg-pf-primary/10 px-2 py-1 text-[10px] uppercase tracking-widest text-pf-primary">
              −1 choice: {slot.options.map((o) => o.toUpperCase()).join(' / ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Parse `system.flaws` the same way we handle `system.boosts`, but
// drop empty slots (pf2e encodes "no flaw" as an empty-value entry,
// as with humans and half-elves). A flaw that becomes `kind: 'free'`
// with all six abilities is a no-op too — that's the empty-slot case
// re-hydrated by the shared parser, so discard it.
function parseAncestryFlaws(system: unknown): ParsedSlot[] {
  const raw = parseAncestryOrBackgroundSlots({ boosts: (system as { flaws?: unknown } | null)?.flaws });
  return raw.filter((slot) => {
    if (slot.options.length === 0) return false;
    if (slot.kind === 'free' && slot.options.length === ABILITY_KEYS.length) return false;
    return true;
  });
}

function BoostSlotPicker({
  slot,
  selected,
  onPick,
}: {
  slot: ParsedSlot;
  selected: AbilityKey | null;
  onPick: (key: AbilityKey) => void;
}): React.ReactElement {
  if (slot.kind === 'fixed') {
    const only = slot.options[0];
    return (
      <span
        className="rounded border border-pf-border bg-pf-tertiary/40 px-2 py-1 font-mono text-xs tabular-nums text-pf-alt-dark"
        data-boost-fixed={only}
      >
        {only?.toUpperCase()} (fixed)
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slot.options.map((key) => {
        const isActive = selected === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={(): void => {
              onPick(key);
            }}
            data-boost-option={key}
            className={[
              'rounded border px-2 py-1 text-xs font-semibold uppercase tracking-widest transition-colors',
              isActive
                ? 'border-pf-primary bg-pf-tertiary/40 text-pf-primary'
                : 'border-pf-border bg-pf-bg text-pf-alt-dark hover:bg-pf-tertiary/20',
            ].join(' ')}
          >
            {key.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function FreeBoostBlock({
  selected,
  onToggle,
}: {
  selected: AbilityKey[];
  onToggle: (key: AbilityKey) => void;
}): React.ReactElement {
  const remaining = BOOSTS_REQUIRED - selected.length;
  return (
    <section>
      <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
        Level 1 · Free Boosts
      </h3>
      <p className="mb-2 text-xs text-pf-alt-dark">
        Pick {BOOSTS_REQUIRED} attributes to boost — on top of the fixed/choice boosts above.{' '}
        <span className="tabular-nums">{selected.length}</span>/{BOOSTS_REQUIRED} selected.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const picked = selected.includes(key);
          const locked = !picked && selected.length >= BOOSTS_REQUIRED;
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              data-attribute-tile={key}
              aria-pressed={picked}
              onClick={(): void => {
                onToggle(key);
              }}
              className={[
                'flex flex-col items-center rounded border px-2 py-3 transition-colors',
                picked
                  ? 'border-pf-primary bg-pf-tertiary/40'
                  : locked
                    ? 'cursor-not-allowed border-pf-border bg-pf-bg opacity-40'
                    : 'border-pf-border bg-pf-bg hover:bg-pf-tertiary/20',
              ].join(' ')}
            >
              <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                {key.toUpperCase()}
              </span>
              <BoostedMod mod={0} boosted={picked} />
              <span className="text-[10px] text-pf-alt">{ABILITY_LABEL[key]}</span>
            </button>
          );
        })}
      </div>
      {remaining > 0 && (
        <p className="mt-1 text-xs italic text-pf-alt-dark">
          {remaining} more free pick{remaining === 1 ? '' : 's'} remaining.
        </p>
      )}
    </section>
  );
}

// Parse pf2e's `system.boosts` record on ancestries/backgrounds into
// ordered slot configs. A slot with a single-entry `value` array is
// pre-determined (fixed); multi-entry arrays are a constrained pick
// and empty arrays (rare flaw/legacy cases) are treated as free.
function parseAncestryOrBackgroundSlots(system: unknown): ParsedSlot[] {
  const boosts = (system as { boosts?: unknown } | null)?.boosts;
  if (boosts === undefined || boosts === null || typeof boosts !== 'object') return [];
  const out: ParsedSlot[] = [];
  // Iterate numerically indexed keys in order.
  const keys = Object.keys(boosts)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    const slot = (boosts as Record<string, unknown>)[k] as { value?: unknown } | null;
    const raw = slot?.value;
    if (!Array.isArray(raw)) continue;
    const options = raw.filter(
      (v): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v),
    );
    if (options.length === 1) {
      out.push({ kind: 'fixed', options });
    } else if (options.length === 0) {
      // pf2e treats empty as "any"; surface all six.
      out.push({ kind: 'free', options: [...ABILITY_KEYS] });
    } else {
      out.push({ kind: 'free', options });
    }
  }
  return out;
}

function parseClassKeyAbility(system: unknown): ParsedSlot | null {
  const key = (system as { keyAbility?: { value?: unknown } } | null)?.keyAbility?.value;
  if (!Array.isArray(key)) return null;
  const options = key.filter(
    (v): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v),
  );
  if (options.length === 0) return null;
  if (options.length === 1) return { kind: 'fixed', options };
  return { kind: 'free', options };
}

// Seed initial picks from a slot config: fixed slots pre-fill,
// choice/free slots start null.
function seedPicks(slots: ParsedSlot[]): (AbilityKey | null)[] {
  return slots.map((s) => (s.kind === 'fixed' ? (s.options[0] ?? null) : null));
}
