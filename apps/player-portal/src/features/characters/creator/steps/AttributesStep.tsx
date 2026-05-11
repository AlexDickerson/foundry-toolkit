import { useEffect, useState } from 'react';
import { api } from '@/features/characters/api';
import type { AbilityKey, CompendiumMatch } from '@/features/characters/types';
import { ABILITY_KEYS } from '@/features/characters/types';
import { BoostedMod } from '@/features/characters/internal/AbilityBoostPicker';
import { ABILITY_LABEL, BOOSTS_REQUIRED } from '../constants';
import type { Draft } from '../types';

// Boost-slot shape normalised from pf2e's compendium data. Ancestry
// and background both store `system.boosts` as an indexed record of
// slots; class stores a single `system.keyAbility`. Each slot's
// `value` array is: one entry for fixed, 2+ entries for a
// constrained choice, all six (or empty) for a free pick.
type SlotKind = 'fixed' | 'free';
export interface ParsedSlot {
  kind: SlotKind;
  options: AbilityKey[];
}
type SourceDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; slots: ParsedSlot[] }
  | { kind: 'error'; uuid: string; message: string };

// ─── 18-cap enforcement ──────────────────────────────────────────────────────
// PF2e level-1 rule: ability scores can't exceed 18. Starting at 10,
// each boost adds +2, so no ability can be boosted more than 4 times
// across all sources. An ancestry flaw lowers the floor by 2, allowing
// one extra boost (5 total) before hitting 18.

export const BOOST_CAP = 4;

export function tallyBoosts(picks: (AbilityKey | null)[]): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const k of picks) {
    if (k !== null) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function mergeBoostTallies(...tallies: Partial<Record<AbilityKey, number>>[]): Record<AbilityKey, number> {
  const out = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])) as Record<AbilityKey, number>;
  for (const tally of tallies) {
    for (const [k, n] of Object.entries(tally) as [AbilityKey, number][]) {
      out[k] += n;
    }
  }
  return out;
}

export function flawCountsFromSlots(slots: ParsedSlot[]): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const slot of slots) {
    if (slot.kind === 'fixed') {
      for (const k of slot.options) {
        out[k] = (out[k] ?? 0) + 1;
      }
    }
  }
  return out;
}

// Returns keys that are disabled for slot `slotIdx` in a source.
// A key is disabled when either:
//   (a) it would push the ability past the 18-cap across all sources, or
//   (b) it is already picked by a different slot within the same source
//       (each source can only boost a given ability once).
export function disabledKeysForSlot(
  slotIdx: number,
  sourcePicks: (AbilityKey | null)[],
  allBoosts: Record<AbilityKey, number>,
  flawCounts: Partial<Record<AbilityKey, number>>,
): Set<AbilityKey> {
  const currentPick = sourcePicks[slotIdx] ?? null;
  const disabled = new Set<AbilityKey>();
  for (const key of ABILITY_KEYS) {
    // (a) Cap: strip this slot's own contribution, then test if adding it
    //     would hit the ceiling.
    const cap = BOOST_CAP + (flawCounts[key] ?? 0);
    const boostedExcludingThisSlot = allBoosts[key] - (currentPick === key ? 1 : 0);
    if (boostedExcludingThisSlot >= cap) {
      disabled.add(key);
      continue;
    }
    // (b) Same-source duplicate: another slot in this source already holds key.
    for (let i = 0; i < sourcePicks.length; i++) {
      if (i !== slotIdx && sourcePicks[i] === key) {
        disabled.add(key);
        break;
      }
    }
  }
  return disabled;
}

// PF2e "Alternative Ancestry Boosts" optional rule (Player Core p. 27):
// a character may forgo their ancestry's listed boosts/flaws and instead
// take exactly two free ability boosts.
const ALTERNATE_BOOST_COUNT = 2;

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
  alternateAncestryBoosts,
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
  /** Null when the optional rule is off; an array — possibly empty —
   *  when on, with the two picks. */
  alternateAncestryBoosts: AbilityKey[] | null;
  onDraftPatch: (patch: Partial<Draft>) => void;
}): React.ReactElement {
  const useAlternateBoosts = alternateAncestryBoosts !== null;
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
    // Deselecting is always allowed.
    if (levelOneBoosts.includes(key)) {
      const next = levelOneBoosts.filter((k) => k !== key);
      onDraftPatch({ levelOneBoosts: next });
      patchFreeBoosts(next);
      return;
    }
    if (levelOneBoosts.length >= BOOSTS_REQUIRED) return;
    // Enforce 18-cap: don't add a free boost to an ability already at the ceiling.
    const cap = BOOST_CAP + (flawCounts[key] ?? 0);
    if (allBoosts[key] >= cap) return;
    const next = [...levelOneBoosts, key];
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

  // PF2e "Alternative Ancestry Boosts" toggle. Truthy presence of
  // `ancestry.system.alternateAncestryBoosts` (any array, even empty)
  // makes pf2e's ancestry-prep skip the listed boosts AND flaws and
  // instead grant the picks recorded in the array. `null` disables the
  // rule. We send `null` for off so the system's `if (...alternateAncestryBoosts)`
  // check evaluates false; the field then sits as null in the embedded
  // item — pf2e treats null and absent identically.
  const toggleAlternateBoosts = (enabled: boolean): void => {
    const next: AbilityKey[] | null = enabled ? [] : null;
    onDraftPatch({ alternateAncestryBoosts: next });
    patchItem(ancestryItemId, 'alternateAncestryBoosts', next);
  };
  // Tile-toggle picker for the alternate boosts: click an ability to
  // add/remove it. Order doesn't matter to pf2e (the array is just
  // pushed into `build.attributes.boosts.ancestry` verbatim), and a
  // grid avoids the positional-hole problem a two-slot row would have
  // if the user clicked slot 2 first.
  const toggleAlternateBoost = (key: AbilityKey): void => {
    if (alternateAncestryBoosts === null) return;
    let next: AbilityKey[];
    if (alternateAncestryBoosts.includes(key)) {
      next = alternateAncestryBoosts.filter((k) => k !== key);
    } else {
      if (alternateAncestryBoosts.length >= ALTERNATE_BOOST_COUNT) return;
      // 18-cap still applies here — these picks count toward the
      // per-ability cap like any other boost.
      const cap = BOOST_CAP + (flawCounts[key] ?? 0);
      if (allBoosts[key] >= cap) return;
      next = [...alternateAncestryBoosts, key];
    }
    onDraftPatch({ alternateAncestryBoosts: next });
    patchItem(ancestryItemId, 'alternateAncestryBoosts', next);
  };

  // Compute all committed boosts across every source so child pickers
  // can enforce the 18-cap. When the alternative-ancestry-boosts rule
  // is on we tally the two alternate picks instead of the ancestry's
  // normal slots, and we zero out flaw counts (flaws don't apply under
  // the alternate rule).
  const flawCounts = useAlternateBoosts
    ? {}
    : flawCountsFromSlots(ancestryFlaws.kind === 'ready' ? ancestryFlaws.slots : []);
  const ancestryTally = useAlternateBoosts ? tallyBoosts(alternateAncestryBoosts ?? []) : tallyBoosts(ancestryBoosts);
  const allBoosts = mergeBoostTallies(
    ancestryTally,
    tallyBoosts(backgroundBoosts),
    tallyBoosts(classKeyAbility !== null ? [classKeyAbility] : []),
    tallyBoosts(levelOneBoosts),
  );

  const classPicks: (AbilityKey | null)[] = classKeyAbility !== null ? [classKeyAbility] : [null];

  return (
    <div className="space-y-5">
      <p
        className="rounded border border-pf-border bg-pf-bg-dark/40 px-3 py-2 text-xs text-pf-alt-dark"
        data-role="attributes-cap-note"
      >
        <span className="font-semibold text-pf-alt-dark">Level 1 cap:</span> no attribute can be raised above{' '}
        <span className="font-semibold text-pf-text">18 (+4)</span>. Each source (ancestry, background, class key, free
        boosts) contributes one boost per attribute, and no ability can take more than 4 boosts total. An ancestry flaw
        raises the cap by 1 boost for that attribute. Options at the cap are disabled.
      </p>
      <p
        className="rounded border border-pf-border bg-pf-bg-dark/40 px-3 py-2 text-xs text-pf-alt-dark"
        data-role="attributes-key-note"
      >
        <span className="font-semibold text-pf-alt-dark">Key attribute tip:</span> PF2e's encounter math is tight —
        attack rolls, class DC, and trained-skill checks all key off your{' '}
        <span className="font-semibold text-pf-text">class key attribute</span>. Most characters want to start at{' '}
        <span className="font-semibold text-pf-text">+4</span> in that attribute (the class boost plus one of your free
        boosts). Falling short of +4 here usually costs you accuracy at every level.
      </p>
      <AncestryBoostSection
        ancestryPick={ancestryPick}
        ancestryDoc={ancestryDoc}
        ancestryFlaws={ancestryFlaws}
        ancestryBoosts={ancestryBoosts}
        alternateAncestryBoosts={alternateAncestryBoosts}
        useAlternateBoosts={useAlternateBoosts}
        onPickSlot={setAncestrySlot}
        onToggleAlternateBoost={toggleAlternateBoost}
        onToggleAlternate={toggleAlternateBoosts}
        allBoosts={allBoosts}
        flawCounts={flawCounts}
      />
      <BoostSourceBlock
        label={backgroundPick !== null ? `Background · ${backgroundPick.name}` : 'Background'}
        state={backgroundDoc}
        placeholderText="Pick a background on the previous step to see its boosts."
        picks={backgroundBoosts}
        onPick={setBackgroundSlot}
        allBoosts={allBoosts}
        flawCounts={flawCounts}
      />
      <BoostSourceBlock
        label={classPick !== null ? `Class · ${classPick.name} key attribute` : 'Class key attribute'}
        state={classDoc}
        placeholderText="Pick a class on the previous step to choose its key attribute."
        picks={classPicks}
        onPick={(_slot, key): void => {
          setClassKeyAbility(key);
        }}
        allBoosts={allBoosts}
        flawCounts={flawCounts}
      />
      <FreeBoostBlock
        selected={levelOneBoosts}
        allBoosts={allBoosts}
        flawCounts={flawCounts}
        onToggle={toggleFreeBoost}
      />
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

// Ancestry section composes the standard BoostSourceBlock with the
// "Alternative Ancestry Boosts" toggle. When the rule is on, the
// ancestry's listed boosts/flaws are replaced by a two-slot free-boost
// picker — same wire format pf2e uses internally
// (`system.alternateAncestryBoosts: AbilityKey[]`).
function AncestryBoostSection({
  ancestryPick,
  ancestryDoc,
  ancestryFlaws,
  ancestryBoosts,
  alternateAncestryBoosts,
  useAlternateBoosts,
  onPickSlot,
  onToggleAlternateBoost,
  onToggleAlternate,
  allBoosts,
  flawCounts,
}: {
  ancestryPick: CompendiumMatch | null;
  ancestryDoc: SourceDocState;
  ancestryFlaws: SourceDocState;
  ancestryBoosts: (AbilityKey | null)[];
  alternateAncestryBoosts: AbilityKey[] | null;
  useAlternateBoosts: boolean;
  onPickSlot: (slotIdx: number, key: AbilityKey) => void;
  onToggleAlternateBoost: (key: AbilityKey) => void;
  onToggleAlternate: (enabled: boolean) => void;
  allBoosts: Record<AbilityKey, number>;
  flawCounts: Partial<Record<AbilityKey, number>>;
}): React.ReactElement {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
          {ancestryPick !== null ? `Ancestry · ${ancestryPick.name}` : 'Ancestry'}
        </h3>
        {ancestryPick !== null && (
          <label
            className="flex cursor-pointer items-center gap-1.5 text-[10px] uppercase tracking-widest text-pf-alt-dark"
            data-role="alternate-ancestry-boosts-toggle"
            title="Forgo the ancestry's listed boosts and flaws; take two free ability boosts instead."
          >
            <input
              type="checkbox"
              checked={useAlternateBoosts}
              onChange={(e): void => {
                onToggleAlternate(e.target.checked);
              }}
              className="h-3.5 w-3.5 rounded border-pf-border"
            />
            Use 2 free boosts
          </label>
        )}
      </div>
      {useAlternateBoosts ? (
        <AlternateAncestryBoostPicker
          picks={alternateAncestryBoosts ?? []}
          onToggle={onToggleAlternateBoost}
          allBoosts={allBoosts}
          flawCounts={flawCounts}
        />
      ) : (
        <BoostSourceBlock
          label=""
          state={ancestryDoc}
          placeholderText="Pick an ancestry on the previous step to see its boosts."
          picks={ancestryBoosts}
          onPick={onPickSlot}
          flaws={ancestryFlaws}
          allBoosts={allBoosts}
          flawCounts={flawCounts}
          hideHeading
        />
      )}
    </section>
  );
}

// Tile-grid picker for the two alternate ancestry boosts. Mirrors the
// L1 free-boost tiles below so the visual language is identical — the
// only differences are the cap (2 vs 4) and the source the picks land on
// (the ancestry item's `alternateAncestryBoosts` field, not the actor's
// `build.attributes.boosts.1`).
function AlternateAncestryBoostPicker({
  picks,
  onToggle,
  allBoosts,
  flawCounts,
}: {
  picks: AbilityKey[];
  onToggle: (key: AbilityKey) => void;
  allBoosts: Record<AbilityKey, number>;
  flawCounts: Partial<Record<AbilityKey, number>>;
}): React.ReactElement {
  const remaining = ALTERNATE_BOOST_COUNT - picks.length;
  return (
    <>
      <p className="mb-2 text-xs text-pf-alt-dark">
        Pick {ALTERNATE_BOOST_COUNT} attributes — these replace your ancestry’s listed boosts and flaws.{' '}
        <span className="tabular-nums">{picks.length}</span>/{ALTERNATE_BOOST_COUNT} selected.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const picked = picks.includes(key);
          // 18-cap: `allBoosts` already includes this picker's contribution
          // when `picked`, so the cap test only blocks adding a new boost.
          const atCap = !picked && allBoosts[key] >= BOOST_CAP + (flawCounts[key] ?? 0);
          const locked = !picked && (picks.length >= ALTERNATE_BOOST_COUNT || atCap);
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              data-alt-ancestry-tile={key}
              aria-pressed={picked}
              onClick={(): void => {
                onToggle(key);
              }}
              title={atCap ? 'Already at 18 — cannot boost further' : undefined}
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
          {remaining} more pick{remaining === 1 ? '' : 's'} remaining.
        </p>
      )}
    </>
  );
}

function BoostSourceBlock({
  label,
  state,
  placeholderText,
  picks,
  onPick,
  flaws,
  allBoosts,
  flawCounts,
  hideHeading = false,
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
  allBoosts: Record<AbilityKey, number>;
  flawCounts: Partial<Record<AbilityKey, number>>;
  /** Suppress the block's own heading when the caller is providing one
   *  (Ancestry section wraps this with its own header + toggle row). */
  hideHeading?: boolean;
}): React.ReactElement {
  const flawSlots = flaws?.kind === 'ready' ? flaws.slots : [];
  return (
    <section>
      {!hideHeading && (
        <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</h3>
      )}
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
                disabledKeys={disabledKeysForSlot(idx, picks, allBoosts, flawCounts)}
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
  disabledKeys,
  onPick,
}: {
  slot: ParsedSlot;
  selected: AbilityKey | null;
  /** Abilities that cannot be picked: at the 18-cap or already used by
   *  another slot in this source. */
  disabledKeys: Set<AbilityKey>;
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
        const isDisabled = !isActive && disabledKeys.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            disabled={isDisabled}
            onClick={(): void => {
              onPick(key);
            }}
            data-boost-option={key}
            title={isDisabled ? 'Already at 18 — cannot boost further' : undefined}
            className={[
              'rounded border px-2 py-1 text-xs font-semibold uppercase tracking-widest transition-colors',
              isActive
                ? 'border-pf-primary bg-pf-tertiary/40 text-pf-primary'
                : isDisabled
                  ? 'cursor-not-allowed border-pf-border bg-pf-bg text-pf-alt-dark opacity-40'
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
  allBoosts,
  flawCounts,
  onToggle,
}: {
  selected: AbilityKey[];
  /** Total boosts per ability across all sources (including free picks). */
  allBoosts: Record<AbilityKey, number>;
  flawCounts: Partial<Record<AbilityKey, number>>;
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
          // `allBoosts[key]` does NOT include key as a free pick when `!picked`,
          // so checking against cap tells us whether a new free boost is allowed.
          const atCap = !picked && allBoosts[key] >= BOOST_CAP + (flawCounts[key] ?? 0);
          const locked = !picked && (selected.length >= BOOSTS_REQUIRED || atCap);
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
              title={atCap ? 'Already at 18 — cannot boost further' : undefined}
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
