import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import type { FocusPool, PreparedActorItem, SpellItem, SpellcastingEntryItem } from '../../api/types';
import { isCantripSpell, isSpellItem, isSpellcastingEntryItem } from '../../api/types';
import { api } from '../../api/client';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { useUuidHover } from '../../lib/useUuidHover';
import { useActorAction } from '../../lib/useActorAction';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  items: PreparedActorItem[];
  characterLevel: number;
  actorId: string;
  onCast: () => void;
  focusPoints: FocusPool;
}

export function Spells({ items, characterLevel, actorId, onCast, focusPoints }: Props): React.ReactElement {
  // Hook first — must run on every render regardless of empty-state.
  const uuidHover = useUuidHover();
  const entries = items.filter(isSpellcastingEntryItem);
  const spells = items.filter(isSpellItem);

  if (entries.length === 0 && spells.length === 0) {
    return <p className="text-sm text-pf-text-muted">No spellcasting.</p>;
  }

  const byEntry = new Map<string, SpellItem[]>();
  const orphans: SpellItem[] = [];
  const entryIds = new Set(entries.map((e) => e.id));
  for (const spell of spells) {
    const loc = spell.system.location?.value ?? null;
    if (loc !== null && entryIds.has(loc)) {
      const arr = byEntry.get(loc) ?? [];
      arr.push(spell);
      byEntry.set(loc, arr);
    } else {
      orphans.push(spell);
    }
  }

  return (
    <section
      className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      {entries.map((entry) => (
        <EntryBlock
          key={entry.id}
          entry={entry}
          spells={byEntry.get(entry.id) ?? []}
          characterLevel={characterLevel}
          actorId={actorId}
          onCast={onCast}
          focusPoints={focusPoints}
        />
      ))}
      {orphans.length > 0 && (
        <div data-testid="spells-orphans">
          <SectionHeader band>Orphaned Spells</SectionHeader>
          {/* Orphaned spells have no entry context — render read-only. */}
          <RankedSpellList spells={orphans} characterLevel={characterLevel} />
        </div>
      )}
      {uuidHover.popover}
    </section>
  );
}

function EntryBlock({
  entry,
  spells,
  characterLevel,
  actorId,
  onCast,
  focusPoints,
}: {
  entry: SpellcastingEntryItem;
  spells: SpellItem[];
  characterLevel: number;
  actorId: string;
  onCast: () => void;
  focusPoints: FocusPool;
}): React.ReactElement {
  const traditionRaw = entry.system.tradition.value;
  const tradition = traditionRaw !== '' ? traditionRaw : null;
  const prepRaw = entry.system.prepared.value;
  const prep = prepRaw.length > 0 ? prepRaw : null;
  const flexible = entry.system.prepared.flexible === true;
  const meta = [
    tradition !== null ? capitalise(tradition) : null,
    prep !== null ? (flexible ? `Flexible ${capitalise(prep)}` : capitalise(prep)) : null,
  ].filter((s): s is string => s !== null);

  const isFocus = prepRaw === 'focus';

  return (
    <div data-spellcasting-entry-id={entry.id}>
      <div className="-mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-x-2 rounded-t-lg border-b border-pf-border bg-pf-bg px-4 pb-2.5 pt-3">
        <h2 className="font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">{entry.name}</h2>
        {meta.length > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-pf-text-muted">{meta.join(' · ')}</span>
        )}
        {isFocus && focusPoints.max > 0 && (
          <FocusControl focusPoints={focusPoints} actorId={actorId} onChanged={onCast} />
        )}
      </div>
      {spells.length === 0 ? (
        <p className="text-xs italic text-neutral-400">No spells.</p>
      ) : (
        <RankedSpellListWithEntry
          entry={entry}
          spells={spells}
          characterLevel={characterLevel}
          actorId={actorId}
          onCast={onCast}
          focusPoints={focusPoints}
        />
      )}
    </div>
  );
}

// Read-only ranked list (used for orphaned spells with no entry context).
function RankedSpellList({
  spells,
  characterLevel,
}: {
  spells: SpellItem[];
  characterLevel: number;
}): React.ReactElement {
  const cantrips = spells.filter(isCantripSpell);
  const regular = spells.filter((s) => !isCantripSpell(s));

  const byRank = new Map<number, SpellItem[]>();
  for (const s of regular) {
    const rank = effectiveRank(s, characterLevel);
    const arr = byRank.get(rank) ?? [];
    arr.push(s);
    byRank.set(rank, arr);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const sortByName = (a: SpellItem, b: SpellItem): number => a.name.localeCompare(b.name);

  return (
    <div className="space-y-4">
      {cantrips.length > 0 && (
        <RankGroup label="Cantrips" rank={null} spells={[...cantrips].sort(sortByName)} characterLevel={characterLevel} />
      )}
      {ranks.map((r) => (
        <RankGroup
          key={r}
          label={`${ordinal(r)}-Rank Spells`}
          rank={r}
          spells={[...(byRank.get(r) ?? [])].sort(sortByName)}
          characterLevel={characterLevel}
        />
      ))}
    </div>
  );
}

// Interactive ranked list with entry context — used for all entries.
function RankedSpellListWithEntry({
  entry,
  spells,
  characterLevel,
  actorId,
  onCast,
  focusPoints,
}: {
  entry: SpellcastingEntryItem;
  spells: SpellItem[];
  characterLevel: number;
  actorId: string;
  onCast: () => void;
  focusPoints: FocusPool;
}): React.ReactElement {
  const cantrips = spells.filter(isCantripSpell);
  const regular = spells.filter((s) => !isCantripSpell(s));

  const byRank = new Map<number, SpellItem[]>();
  for (const s of regular) {
    const rank = effectiveRank(s, characterLevel);
    const arr = byRank.get(rank) ?? [];
    arr.push(s);
    byRank.set(rank, arr);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const sortByName = (a: SpellItem, b: SpellItem): number => a.name.localeCompare(b.name);

  return (
    <div className="space-y-4">
      {cantrips.length > 0 && (
        <RankGroupWithEntry
          label="Cantrips"
          rank={null}
          spells={[...cantrips].sort(sortByName)}
          characterLevel={characterLevel}
          entry={entry}
          actorId={actorId}
          onCast={onCast}
          focusPoints={focusPoints}
        />
      )}
      {ranks.map((r) => (
        <RankGroupWithEntry
          key={r}
          label={`${ordinal(r)}-Rank Spells`}
          rank={r}
          spells={[...(byRank.get(r) ?? [])].sort(sortByName)}
          characterLevel={characterLevel}
          entry={entry}
          actorId={actorId}
          onCast={onCast}
          focusPoints={focusPoints}
        />
      ))}
    </div>
  );
}

// Read-only rank group (orphans).
function RankGroup({
  label,
  rank: _rank,
  spells,
  characterLevel,
}: {
  label: string;
  rank: number | null;
  spells: SpellItem[];
  characterLevel: number;
}): React.ReactElement {
  return (
    <div data-spell-rank={label}>
      <h3 className="mb-1 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</h3>
      <ul className="space-y-1">
        {spells.map((spell) => (
          <SpellCard key={spell.id} spell={spell} characterLevel={characterLevel} />
        ))}
      </ul>
    </div>
  );
}

// Interactive rank group with slot display and Cast buttons.
function RankGroupWithEntry({
  label,
  rank,
  spells,
  characterLevel,
  entry,
  actorId,
  onCast,
  focusPoints,
}: {
  label: string;
  rank: number | null;
  spells: SpellItem[];
  characterLevel: number;
  entry: SpellcastingEntryItem;
  actorId: string;
  onCast: () => void;
  focusPoints: FocusPool;
}): React.ReactElement {
  const mode = entry.system.prepared.value;

  // Spontaneous: show remaining slots next to the rank heading.
  let slotBadge: React.ReactElement | null = null;
  if (rank !== null && mode === 'spontaneous') {
    const slot = entry.system.slots?.[`slot${rank.toString()}`];
    if (slot && slot.max > 0) {
      const remaining = slot.value ?? 0;
      slotBadge = (
        <span
          className="ml-1 rounded-full bg-pf-bg-dark px-1.5 py-0.5 font-mono text-[10px] text-pf-alt-dark"
          aria-label={`${remaining.toString()} of ${slot.max.toString()} slots remaining`}
        >
          {remaining}/{slot.max}
        </span>
      );
    }
  }

  return (
    <div data-spell-rank={label}>
      <h3 className="mb-1 flex items-baseline gap-1 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
        {label}
        {slotBadge}
      </h3>
      <ul className="space-y-1">
        {spells.map((spell) => (
          <SpellCardWithCast
            key={spell.id}
            spell={spell}
            characterLevel={characterLevel}
            entry={entry}
            actorId={actorId}
            onCast={onCast}
            focusPoints={focusPoints}
          />
        ))}
      </ul>
    </div>
  );
}

// Read-only spell card (no entry / orphan).
function SpellCard({ spell, characterLevel }: { spell: SpellItem; characterLevel: number }): React.ReactElement {
  const traits = spell.system.traits.value.filter((t) => t !== 'cantrip');
  const castCost = formatCastCost(spell.system.time?.value);
  const description = spell.system.description?.value ?? '';
  const heightening = computeHeighteningStep(spell, characterLevel);
  const enriched =
    description.length > 0 ? enrichDescription(description, heightening !== null ? { heightening } : undefined) : '';

  return (
    <li
      className="rounded border border-pf-border bg-pf-bg"
      data-item-id={spell.id}
      data-spell-slug={spell.system.slug ?? ''}
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-pf-bg-dark/40">
          <img src={spell.img} alt="" className="h-6 w-6 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          <span className="truncate text-sm font-medium text-pf-text">{spell.name}</span>
          {castCost !== null && (
            <span
              className="flex-shrink-0 rounded border border-pf-border bg-pf-bg px-1 font-mono text-[10px] text-pf-alt-dark"
              aria-label={`Cast ${castCost}`}
            >
              {castCost}
            </span>
          )}
          {traits.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {traits.slice(0, 6).map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                >
                  {capitaliseSlug(t)}
                </li>
              ))}
            </ul>
          )}
          <span className="ml-auto text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-auto hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        <div className="border-t border-pf-border bg-pf-bg/60 px-3 py-2 text-sm text-pf-text">
          <SpellMeta spell={spell} />
          {enriched.length > 0 ? (
            <div
              className="mt-2 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: enriched }}
            />
          ) : (
            <p className="mt-2 italic text-neutral-400">No description.</p>
          )}
        </div>
      </details>
    </li>
  );
}

// Interactive spell card with Cast button and slot state.
function SpellCardWithCast({
  spell,
  characterLevel,
  entry,
  actorId,
  onCast,
  focusPoints,
}: {
  spell: SpellItem;
  characterLevel: number;
  entry: SpellcastingEntryItem;
  actorId: string;
  onCast: () => void;
  focusPoints: FocusPool;
}): React.ReactElement {
  const traits = spell.system.traits.value.filter((t) => t !== 'cantrip');
  const castCost = formatCastCost(spell.system.time?.value);
  const description = spell.system.description?.value ?? '';
  const rank = effectiveRank(spell, characterLevel);
  const heightening = computeHeighteningStep(spell, characterLevel);
  const enriched =
    description.length > 0 ? enrichDescription(description, heightening !== null ? { heightening } : undefined) : '';

  const isCantrip = isCantripSpell(spell);
  const mode = entry.system.prepared.value;

  // Per-spell usability state.
  const slotKey = `slot${rank.toString()}`;
  const slotData = entry.system.slots?.[slotKey];

  const isExpended =
    mode === 'prepared'
      ? (slotData?.prepared?.find((p) => p.id === spell.id)?.expended ?? false)
      : false;

  const noSlotsLeft = !isCantrip && mode === 'spontaneous' && (slotData?.value ?? 0) <= 0;

  const noFocus = !isCantrip && mode === 'focus' && focusPoints.value <= 0;

  const { state, trigger } = useActorAction({
    run: () => createPf2eClient(api.dispatch, api.invokeActorAction).spellEntry(actorId, entry.id).cast(spell.id, rank),
    onSuccess: onCast,
  });
  const pending = state === 'pending';
  const castError = typeof state === 'object' ? state.error : null;
  const castDisabled = pending || isExpended || noSlotsLeft || noFocus;

  return (
    <li
      className="rounded border border-pf-border bg-pf-bg"
      data-item-id={spell.id}
      data-spell-slug={spell.system.slug ?? ''}
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-pf-bg-dark/40">
          <img src={spell.img} alt="" className="h-6 w-6 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          <span
            className={
              isExpended
                ? 'truncate text-sm font-medium text-pf-text-muted line-through'
                : 'truncate text-sm font-medium text-pf-text'
            }
          >
            {spell.name}
          </span>
          {castCost !== null && (
            <span
              className="flex-shrink-0 rounded border border-pf-border bg-pf-bg px-1 font-mono text-[10px] text-pf-alt-dark"
              aria-label={`Cast ${castCost}`}
            >
              {castCost}
            </span>
          )}
          {traits.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {traits.slice(0, 6).map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                >
                  {capitaliseSlug(t)}
                </li>
              ))}
            </ul>
          )}
          {/* Cast button — stopPropagation prevents toggling the <details>. */}
          <button
            type="button"
            disabled={castDisabled}
            onClick={(e) => {
              e.preventDefault();
              trigger();
            }}
            className="ml-auto flex-shrink-0 rounded border border-pf-primary/60 bg-pf-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-pf-primary transition-colors hover:bg-pf-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={pending ? 'Casting…' : `Cast ${spell.name}`}
          >
            {pending ? '…' : 'Cast'}
          </button>
          <span className="flex-shrink-0 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="flex-shrink-0 hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        <div className="border-t border-pf-border bg-pf-bg/60 px-3 py-2 text-sm text-pf-text">
          {castError !== null && (
            <p className="mb-2 rounded border border-red-400/40 bg-red-400/10 px-2 py-1 text-xs text-red-400">
              {castError}
            </p>
          )}
          <SpellMeta spell={spell} />
          {enriched.length > 0 ? (
            <div
              className="mt-2 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: enriched }}
            />
          ) : (
            <p className="mt-2 italic text-neutral-400">No description.</p>
          )}
        </div>
      </details>
    </li>
  );
}

function FocusControl({
  focusPoints,
  actorId,
  onChanged,
}: {
  focusPoints: FocusPool;
  actorId: string;
  onChanged: () => void;
}): React.ReactElement {
  const adjust = useActorAction({
    run: (delta: number) => api.adjustActorResource(actorId, 'focus-points', delta),
    onSuccess: onChanged,
  });
  return (
    <span className="flex items-center gap-1" data-stat="focus">
      <button
        type="button"
        onClick={() => { adjust.trigger(-1); }}
        disabled={adjust.state === 'pending'}
        className="rounded border border-pf-border bg-pf-bg px-1 py-0.5 font-mono text-[10px] text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
      >
        −
      </button>
      <FocusDots value={focusPoints.value} max={focusPoints.max} />
      <button
        type="button"
        onClick={() => { adjust.trigger(1); }}
        disabled={adjust.state === 'pending'}
        className="rounded border border-pf-border bg-pf-bg px-1 py-0.5 font-mono text-[10px] text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
      >
        +
      </button>
    </span>
  );
}

function FocusDots({ value, max }: { value: number; max: number }): React.ReactElement {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Focus: ${value.toString()} of ${max.toString()}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={
            i < value
              ? 'h-2 w-2 rounded-full bg-pf-primary border border-pf-primary'
              : 'h-2 w-2 rounded-full bg-transparent border border-pf-primary/40'
          }
        />
      ))}
    </span>
  );
}

function SpellMeta({ spell }: { spell: SpellItem }): React.ReactElement | null {
  const range = nonEmpty(spell.system.range?.value);
  const area = formatArea(spell.system.area);
  const target = nonEmpty(spell.system.target?.value);
  const parts: Array<[string, string]> = [];
  if (range !== null) parts.push(['Range', range]);
  if (area !== null) parts.push(['Area', area]);
  if (target !== null) parts.push(['Targets', target]);
  if (parts.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-pf-alt-dark">
      {parts.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold uppercase tracking-widest">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

// The rank a spell is actually cast/slotted at.
//  - Cantrips auto-heighten to ceil(characterLevel / 2); the stored
//    `location.heightenedLevel` is unreliable (often 0 or the base
//    rank regardless of the caster's level).
//  - Leveled spells use `location.heightenedLevel` when set by a
//    prepared-slot assignment; otherwise they sit at their base rank.
function effectiveRank(spell: SpellItem, characterLevel: number): number {
  const base = spell.system.level.value;
  if (isCantripSpell(spell)) {
    const auto = Math.max(1, Math.ceil(characterLevel / 2));
    return Math.max(base, auto);
  }
  const heightened = spell.system.location?.heightenedLevel;
  if (typeof heightened === 'number' && heightened > base) return heightened;
  return base;
}

// Heightening input for the damage enricher. Returns null when the
// spell isn't heightened above its base rank, lacks interval-type
// heightening, or exposes no damage step — those cases render the
// description unchanged.
function computeHeighteningStep(spell: SpellItem, characterLevel: number): { delta: number; perStep: string } | null {
  const base = spell.system.level.value;
  const cast = effectiveRank(spell, characterLevel);
  const delta = cast - base;
  if (delta <= 0) return null;
  const h = spell.system.heightening;
  if (h === undefined || h.type !== 'interval') return null;
  const interval = typeof h.interval === 'number' && h.interval > 0 ? h.interval : 1;
  const damageMap = h.damage;
  if (damageMap === undefined) return null;
  // Pick the first entry that parses as dice — pf2e sometimes emits
  // non-dice scalars (flat-add bonuses, condition durations) as
  // additional keys alongside the dice value.
  const perStep = Object.values(damageMap).find((v) => typeof v === 'string' && /^\s*\d+d\d+\s*$/.test(v));
  if (perStep === undefined) return null;
  // pf2e `interval` says "per N ranks". Scale delta accordingly.
  const steps = Math.floor(delta / interval);
  if (steps <= 0) return null;
  return { delta: steps, perStep };
}

function formatCastCost(time: string | undefined): string | null {
  if (time === undefined || time === '') return null;
  if (time === '1') return '◆';
  if (time === '2') return '◆◆';
  if (time === '3') return '◆◆◆';
  if (time === 'reaction') return '↺';
  if (time === 'free') return '◇';
  return time;
}

function formatArea(area: SpellItem['system']['area']): string | null {
  if (area === undefined || area === null) return null;
  const { value, type } = area;
  if (value === undefined || value === '' || value === 0) return null;
  const v = typeof value === 'number' ? `${value.toString()}-foot` : value;
  return type !== undefined && type !== '' ? `${v} ${type}` : v;
}

function nonEmpty(s: string | undefined): string | null {
  return s !== undefined && s.trim() !== '' ? s : null;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function capitaliseSlug(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th';
  return `${n.toString()}${suffix}`;
}
