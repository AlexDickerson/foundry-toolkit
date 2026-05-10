import { useEffect, useState } from 'react';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { api, ApiRequestError } from '@/features/characters/api';
import type { CompendiumDocument, CompendiumMatch } from '@/features/characters/types';
import { useUuidHover } from '@/shared/hooks/useUuidHover';
import type { Evaluation } from '@/features/characters/internal/prereqs';
import { getAncestryArt, getClassArt, getHeritageArt } from './character-art';
import { CharacterArtGallery } from './CharacterArtGallery';

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
  /** When true, suppress the top header (image + name + meta + traits).
   *  Useful when the surrounding picker dialog already shows the name
   *  and the body content carries enough visual identity on its own
   *  (e.g. class panels, where the lore + initial-proficiencies block
   *  is long enough that the header just costs vertical space). The
   *  footer's "Back" button still provides a way to close the panel. */
  hideHeader?: boolean;
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
  hideHeader = false,
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
        const message = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [target.uuid, docCache]);

  const doc = state.kind === 'ok' ? state.document : null;
  const ancestryStats = doc && target.type === 'ancestry' ? readAncestryStats(doc) : null;
  const backgroundStats = doc && target.type === 'background' ? readBackgroundStats(doc) : null;
  const classStats = doc && target.type === 'class' ? readClassStats(doc) : null;
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

  // Decorative AoN reference art for ancestry / heritage / class detail
  // panels. Heritage art is stored alongside ancestry art in
  // pf2e-art.json — versatile heritages (Aiuvarin, Changeling, etc.)
  // get their own entries. No-op for other types.
  const characterArt =
    target.type === 'ancestry'
      ? getAncestryArt(target.name)
      : target.type === 'heritage'
        ? getHeritageArt(target.name)
        : target.type === 'class'
          ? getClassArt(target.name)
          : null;

  const failed = evaluation === 'fails';

  return (
    <aside
      className="flex w-full min-w-0 flex-1 flex-col"
      data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-detail` : undefined}
      data-detail-uuid={target.uuid}
    >
      {!hideHeader && (
        <header className="flex items-start gap-3 border-b border-pf-border px-4 py-3">
          {target.img && (
            <img src={target.img} alt="" className="h-12 w-12 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-base font-semibold text-pf-text">{target.name}</h3>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-pf-alt">
              {target.packLabel}
              {target.level !== undefined && ` · L${target.level.toString()}`}
              {rarity != null && rarity !== 'common' && ` · ${rarity}`}
              {castCost !== null && ` · Cast ${castCost}`}
            </p>
            {(target.type === 'ancestry' && rarity !== null) || traits.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1">
                {/* Ancestries always show their rarity as the first pill so
                  players can spot uncommon/rare ancestries at a glance.
                  Other doc types keep rarity in the meta line only. */}
                {target.type === 'ancestry' && rarity !== null && (
                  <li
                    className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${rarityPillClasses(rarity)}`}
                  >
                    {humanizeSlug(rarity)}
                  </li>
                )}
                {traits.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                  >
                    {humanizeSlug(t)}
                  </li>
                ))}
              </ul>
            ) : null}
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
      )}

      {/* When art is present we need overflow-hidden here so the flex chain can
          drive the image to fill the exact available height without creating an
          outer scroll. The description column gets its own overflow-y-auto. */}
      <div
        className={`flex-1 text-sm text-pf-text ${characterArt ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto px-4 py-3'}`}
      >
        {state.kind === 'loading' && <p className="px-4 py-3 italic text-pf-alt">Loading…</p>}
        {state.kind === 'error' && <p className="px-4 py-3 text-pf-primary">Failed to load: {state.message}</p>}
        {state.kind === 'ok' &&
          (characterArt ? (
            // ── Ancestry / class: side-by-side, art fills available height ──
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Detail rows (rare for ancestry/class, but possible) */}
              {(prerequisites?.length ||
                actions ||
                trigger ||
                frequency ||
                requirements ||
                price ||
                range ||
                area ||
                targetField) && (
                <div className="space-y-2 border-b border-pf-border px-4 py-3">
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
                </div>
              )}
              {/* Two-column: description+mechanics left, art right. flex-1 min-h-0 lets
                  this row consume all remaining body height. */}
              <div className="flex min-h-0 flex-1 gap-4 px-4 py-3">
                {/* Delegation handlers live on this scroller so they catch
                    [data-uuid] hovers in BOTH the enriched description and
                    the mechanical-feature chips below it. */}
                <div {...uuidHover.delegationHandlers} className="min-w-0 flex-1 overflow-y-auto">
                  {enriched.length > 0 ? (
                    <div
                      className="leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
                      dangerouslySetInnerHTML={{ __html: enriched }}
                    />
                  ) : (
                    <p className="italic text-pf-alt">No description.</p>
                  )}
                  {/* Mechanical effects sit below the lore so the flavor text reads first. */}
                  {ancestryStats !== null && <AncestryMechanics stats={ancestryStats} />}
                  {classStats !== null && <ClassMechanics stats={classStats} />}
                </div>
                {/* Art column: flex-col so the gallery can fill h-full */}
                <div className="flex w-[28rem] shrink-0 flex-col">
                  <CharacterArtGallery art={characterArt} subjectName={target.name} />
                </div>
              </div>
              {uuidHover.popover}
            </div>
          ) : (
            // ── All other types (and ancestries without art): stacked layout ──
            // Delegation handlers on the outer wrapper so [data-uuid] hovers
            // fire for both the enriched description and the mechanical-feature
            // chips below it.
            <div {...uuidHover.delegationHandlers} className="space-y-3">
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
                  className="leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
                  dangerouslySetInnerHTML={{ __html: enriched }}
                />
              ) : (
                <p className="italic text-pf-alt">No description.</p>
              )}
              {/* Mechanical effects sit below the lore so the flavor text reads first. */}
              {ancestryStats !== null && <AncestryMechanics stats={ancestryStats} />}
              {backgroundStats !== null && <BackgroundMechanics stats={backgroundStats} />}
              {classStats !== null && <ClassMechanics stats={classStats} />}
              {uuidHover.popover}
            </div>
          ))}
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

function DetailRow({ label, value, fail }: { label: string; value: string; fail?: boolean }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</dt>
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
  const v = typeof value === 'number' ? `${value.toString()}-foot` : typeof value === 'string' ? value : null;
  if (v === null) return null;
  return typeof area.type === 'string' && area.type !== '' ? `${v} ${area.type}` : v;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// PF2e rarity tiers map to standard system colors — amber for uncommon,
// blue for rare, purple for unique. Common gets a muted grey pill.
function rarityPillClasses(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'uncommon':
      return 'border border-amber-500 bg-amber-100 text-amber-900';
    case 'rare':
      return 'border border-blue-500 bg-blue-100 text-blue-900';
    case 'unique':
      return 'border border-purple-500 bg-purple-100 text-purple-900';
    default:
      // common — neutral chip so the field is always visible without
      // shouting.
      return 'border border-pf-border bg-pf-bg-dark text-pf-alt-dark';
  }
}

// ─── Ancestry mechanical stats ───────────────────────────────────────────────

interface BoostSlot {
  options: string[];
}

interface AncestryStats {
  hp: number | null;
  size: string | null;
  speed: number | null;
  boosts: BoostSlot[];
  flaws: BoostSlot[];
  fixedLanguages: string[];
  bonusLanguageCount: number;
  vision: string | null;
  features: { uuid: string; name: string; img: string }[];
}

function readAncestryStats(doc: CompendiumDocument): AncestryStats {
  const sys = doc.system as {
    hp?: unknown;
    size?: unknown;
    speed?: unknown;
    boosts?: unknown;
    flaws?: unknown;
    languages?: { value?: unknown };
    additionalLanguages?: { count?: unknown };
    vision?: unknown;
    items?: Record<string, unknown>;
  };

  const hp = typeof sys.hp === 'number' ? sys.hp : null;
  const size = typeof sys.size === 'string' ? sys.size : null;
  const speed = typeof sys.speed === 'number' ? sys.speed : null;
  const vision = typeof sys.vision === 'string' && sys.vision !== 'normal' ? sys.vision : null;

  const boosts = readBoostRecord(sys.boosts);
  const flaws = readBoostRecord(sys.flaws);

  const fixedLanguages = Array.isArray(sys.languages?.value)
    ? sys.languages.value.filter((v): v is string => typeof v === 'string')
    : [];

  const bonusLanguageCount = typeof sys.additionalLanguages?.count === 'number' ? sys.additionalLanguages.count : 0;

  const features = readAncestryFeatures(sys.items);

  return { hp, size, speed, boosts, flaws, fixedLanguages, bonusLanguageCount, vision, features };
}

function readBoostRecord(raw: unknown): BoostSlot[] {
  if (!raw || typeof raw !== 'object') return [];
  const slots: BoostSlot[] = [];
  const keys = Object.keys(raw)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    const slot = (raw as Record<string, unknown>)[k];
    if (!slot || typeof slot !== 'object') continue;
    const value = (slot as { value?: unknown }).value;
    if (!Array.isArray(value)) continue;
    const options = value.filter((v): v is string => typeof v === 'string');
    // pf2e compendium docs ship a fixed-size boost record where unused
    // slots are encoded as `{ "value": [] }` — a placeholder, not a real
    // boost. The actual encodings for a slot the player can fill are
    // either all six abilities listed (free pick) or a constrained subset
    // (fixed / choice). Skip the placeholder so a 3-slot Human ancestry
    // renders the correct "Free, Free" instead of "Free, Free, Free".
    if (options.length === 0) continue;
    slots.push({ options });
  }
  return slots;
}

function readAncestryFeatures(
  items: Record<string, unknown> | undefined,
): { uuid: string; name: string; img: string }[] {
  if (!items) return [];
  const out: { uuid: string; name: string; img: string }[] = [];
  for (const raw of Object.values(items)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { uuid?: unknown; name?: unknown; img?: unknown };
    if (typeof entry.uuid !== 'string' || typeof entry.name !== 'string') continue;
    out.push({ uuid: entry.uuid, name: entry.name, img: typeof entry.img === 'string' ? entry.img : '' });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const SIZE_LABELS: Record<string, string> = {
  tiny: 'Tiny',
  sm: 'Small',
  med: 'Medium',
  lg: 'Large',
  huge: 'Huge',
  grg: 'Gargantuan',
};

const ABILITY_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

const ABILITY_LABEL_COUNT = Object.keys(ABILITY_LABELS).length;

function formatBoostSlot(slot: BoostSlot): string {
  // Empty array OR all six abilities listed both encode an unconstrained
  // free boost — render plainly as "Free" without a redundant ability list.
  if (slot.options.length === 0 || slot.options.length === ABILITY_LABEL_COUNT) return 'Free';
  if (slot.options.length === 1) return ABILITY_LABELS[slot.options[0] ?? ''] ?? slot.options[0] ?? 'Free';
  const labels = slot.options.map((o) => ABILITY_LABELS[o] ?? o.toUpperCase());
  return `Free (${labels.join('/')})`;
}

function formatVision(vision: string): string {
  if (vision === 'darkvision') return 'Darkvision';
  if (vision === 'lowLightVision') return 'Low-Light Vision';
  return humanizeSlug(vision);
}

function AncestryMechanics({ stats }: { stats: AncestryStats }): React.ReactElement {
  const hasCoreStats = stats.hp !== null || stats.size !== null || stats.speed !== null;
  const hasBoosts = stats.boosts.length > 0;
  const hasFlaws = stats.flaws.some((f) => f.options.length > 0);
  const hasLanguages = stats.fixedLanguages.length > 0 || stats.bonusLanguageCount > 0;
  const hasVision = stats.vision !== null;
  const hasFeatures = stats.features.length > 0;

  return (
    <div className="mt-4 border-t border-pf-border pt-3 text-xs text-pf-text">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Mechanical effects</p>

      {hasCoreStats && (
        <dl className="mb-2 grid grid-cols-3 gap-x-2 gap-y-1">
          {stats.hp !== null && (
            <>
              <dt className="text-pf-alt-dark">HP</dt>
              <dd className="col-span-2 font-medium">{stats.hp}</dd>
            </>
          )}
          {stats.size !== null && (
            <>
              <dt className="text-pf-alt-dark">Size</dt>
              <dd className="col-span-2 font-medium">{SIZE_LABELS[stats.size] ?? humanizeSlug(stats.size)}</dd>
            </>
          )}
          {stats.speed !== null && (
            <>
              <dt className="text-pf-alt-dark">Speed</dt>
              <dd className="col-span-2 font-medium">{stats.speed} ft.</dd>
            </>
          )}
        </dl>
      )}

      {hasBoosts && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Boosts: </span>
          <span className="font-medium">{stats.boosts.map(formatBoostSlot).join(', ')}</span>
        </div>
      )}

      {hasFlaws && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Flaws: </span>
          <span className="font-medium">
            {stats.flaws
              .filter((f) => f.options.length > 0)
              .map(formatBoostSlot)
              .join(', ')}
          </span>
        </div>
      )}

      {hasLanguages && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Languages: </span>
          <span className="font-medium">
            {stats.fixedLanguages.map(humanizeSlug).join(', ')}
            {stats.bonusLanguageCount > 0 && (
              <span className="ml-1 text-pf-alt-dark">(+{stats.bonusLanguageCount} bonus)</span>
            )}
          </span>
        </div>
      )}

      {hasVision && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Senses: </span>
          <span className="font-medium">{stats.vision !== null ? formatVision(stats.vision) : ''}</span>
        </div>
      )}

      {hasFeatures && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
            Ancestry features ({stats.features.length})
          </summary>
          <ul className="mt-1 flex flex-wrap gap-1">
            {stats.features.map((f) => (
              <li
                key={f.uuid}
                data-uuid={f.uuid}
                className="inline-flex cursor-default items-center gap-1 rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[11px] text-pf-text transition-colors hover:border-pf-primary/60 hover:bg-pf-tertiary/20"
              >
                {f.img && <img src={f.img} alt="" className="h-3.5 w-3.5 rounded" />}
                {f.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Background mechanical stats ─────────────────────────────────────────────

interface BackgroundStats {
  boosts: BoostSlot[];
  trainedSkills: string[];
  loreSkills: string[];
  features: { uuid: string; name: string; img: string }[];
}

function readBackgroundStats(doc: CompendiumDocument): BackgroundStats {
  const sys = doc.system as {
    boosts?: unknown;
    trainedSkills?: { value?: unknown; lore?: unknown };
    items?: Record<string, unknown>;
  };

  const boosts = readBoostRecord(sys.boosts);

  const trainedSkills = Array.isArray(sys.trainedSkills?.value)
    ? sys.trainedSkills.value.filter((v): v is string => typeof v === 'string')
    : [];

  const loreSkills = Array.isArray(sys.trainedSkills?.lore)
    ? sys.trainedSkills.lore.filter((v): v is string => typeof v === 'string')
    : [];

  const features = readAncestryFeatures(sys.items);

  return { boosts, trainedSkills, loreSkills, features };
}

function BackgroundMechanics({ stats }: { stats: BackgroundStats }): React.ReactElement {
  const hasBoosts = stats.boosts.length > 0;
  const hasSkills = stats.trainedSkills.length > 0 || stats.loreSkills.length > 0;
  const hasFeatures = stats.features.length > 0;

  return (
    <div className="mt-4 border-t border-pf-border pt-3 text-xs text-pf-text">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Mechanical effects</p>

      {hasBoosts && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Boosts: </span>
          <span className="font-medium">{stats.boosts.map(formatBoostSlot).join(', ')}</span>
        </div>
      )}

      {hasSkills && (
        <div className="mb-1">
          <span className="text-pf-alt-dark">Trained skills: </span>
          <span className="font-medium">
            {[...stats.trainedSkills.map(humanizeSlug), ...stats.loreSkills].join(', ')}
          </span>
        </div>
      )}

      {hasFeatures && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
            Background abilities ({stats.features.length})
          </summary>
          <ul className="mt-1 flex flex-wrap gap-1">
            {stats.features.map((f) => (
              <li
                key={f.uuid}
                data-uuid={f.uuid}
                className="inline-flex cursor-default items-center gap-1 rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[11px] text-pf-text transition-colors hover:border-pf-primary/60 hover:bg-pf-tertiary/20"
              >
                {f.img && <img src={f.img} alt="" className="h-3.5 w-3.5 rounded" />}
                {f.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Class mechanical stats ──────────────────────────────────────────────────

interface ClassStats {
  perception: number;
  savingThrows: { fortitude: number; reflex: number; will: number };
  trainedSkills: string[];
  additionalSkills: number;
  attacks: {
    simple: number;
    martial: number;
    advanced: number;
    unarmed: number;
    other: { name: string; rank: number } | null;
  };
  defenses: { unarmored: number; light: number; medium: number; heavy: number };
  classDC: number | null;
  spellcasting: number | null;
  features: { uuid: string; name: string; img: string }[];
}

function readClassStats(doc: CompendiumDocument): ClassStats {
  const sys = doc.system as {
    perception?: unknown;
    savingThrows?: { fortitude?: unknown; reflex?: unknown; will?: unknown };
    trainedSkills?: { value?: unknown; additional?: unknown };
    attacks?: { simple?: unknown; martial?: unknown; advanced?: unknown; unarmed?: unknown; other?: unknown };
    defenses?: { unarmored?: unknown; light?: unknown; medium?: unknown; heavy?: unknown };
    classDC?: unknown;
    spellcasting?: unknown;
    items?: Record<string, unknown>;
  };

  const num = (raw: unknown): number => (typeof raw === 'number' ? raw : 0);

  const perception = num(sys.perception);
  const savingThrows = {
    fortitude: num(sys.savingThrows?.fortitude),
    reflex: num(sys.savingThrows?.reflex),
    will: num(sys.savingThrows?.will),
  };
  const trainedSkills = Array.isArray(sys.trainedSkills?.value)
    ? sys.trainedSkills.value.filter((v): v is string => typeof v === 'string')
    : [];
  const additionalSkills = num(sys.trainedSkills?.additional);
  const attacks = {
    simple: num(sys.attacks?.simple),
    martial: num(sys.attacks?.martial),
    advanced: num(sys.attacks?.advanced),
    unarmed: num(sys.attacks?.unarmed),
    other: readOtherAttack(sys.attacks?.other),
  };
  const defenses = {
    unarmored: num(sys.defenses?.unarmored),
    light: num(sys.defenses?.light),
    medium: num(sys.defenses?.medium),
    heavy: num(sys.defenses?.heavy),
  };
  // pf2e omits `classDC` on classes without one (e.g. Bard). Treat any
  // non-number — including missing — as null so the section is hidden.
  const classDC = typeof sys.classDC === 'number' ? sys.classDC : null;
  // Single rank covers both spell attack and spell DC; null for
  // non-spellcasters.
  const spellcasting = typeof sys.spellcasting === 'number' && sys.spellcasting > 0 ? sys.spellcasting : null;

  // Classes pack their full per-level feature progression into
  // `system.items`. The detail panel is a level-1 preview, so only
  // surface the features granted at L1.
  const features = readClassL1Features(sys.items);

  return {
    perception,
    savingThrows,
    trainedSkills,
    additionalSkills,
    attacks,
    defenses,
    classDC,
    spellcasting,
    features,
  };
}

function readOtherAttack(raw: unknown): { name: string; rank: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { name?: unknown; rank?: unknown };
  if (typeof o.name !== 'string' || o.name.length === 0) return null;
  if (typeof o.rank !== 'number' || o.rank <= 0) return null;
  return { name: o.name, rank: o.rank };
}

// pf2e class items embed every level's class feature in `system.items`,
// each tagged with the level it's granted at. The detail panel is a
// level-1 preview, so only surface entries with `level === 1` — the
// rest (subclass picks, level-3 ability boosts, level-5 features, etc.)
// don't apply yet and would otherwise crowd the chip list.
function readClassL1Features(
  items: Record<string, unknown> | undefined,
): { uuid: string; name: string; img: string }[] {
  if (!items) return [];
  const out: { uuid: string; name: string; img: string }[] = [];
  for (const raw of Object.values(items)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { uuid?: unknown; name?: unknown; img?: unknown; level?: unknown };
    if (typeof entry.uuid !== 'string' || typeof entry.name !== 'string') continue;
    if (typeof entry.level !== 'number' || entry.level !== 1) continue;
    out.push({ uuid: entry.uuid, name: entry.name, img: typeof entry.img === 'string' ? entry.img : '' });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// PF2e proficiency ladder: 0 untrained, 1 trained, 2 expert, 3 master,
// 4 legendary. Used only to format display strings.
const RANK_LABELS = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'] as const;
function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? 'Untrained';
}

// Group entries by rank tier so we can render a single line per tier
// like "Trained in simple weapons · martial weapons · unarmed attacks".
// Drops anything at rank 0 — the Player Core's class block omits
// untrained categories and we mirror that to keep the panel scannable.
function groupByRank(entries: { rank: number; label: string }[]): { rank: number; labels: string[] }[] {
  const byRank = new Map<number, string[]>();
  for (const e of entries) {
    if (e.rank <= 0) continue;
    const list = byRank.get(e.rank) ?? [];
    list.push(e.label);
    byRank.set(e.rank, list);
  }
  // Sort descending so higher proficiencies surface first.
  return [...byRank.entries()].sort((a, b) => b[0] - a[0]).map(([rank, labels]) => ({ rank, labels }));
}

function ClassMechanics({ stats }: { stats: ClassStats }): React.ReactElement {
  const attackEntries = [
    { rank: stats.attacks.simple, label: 'simple weapons' },
    { rank: stats.attacks.martial, label: 'martial weapons' },
    { rank: stats.attacks.advanced, label: 'advanced weapons' },
    { rank: stats.attacks.unarmed, label: 'unarmed attacks' },
    ...(stats.attacks.other ? [{ rank: stats.attacks.other.rank, label: stats.attacks.other.name }] : []),
  ];
  const defenseEntries = [
    { rank: stats.defenses.light, label: 'light armor' },
    { rank: stats.defenses.medium, label: 'medium armor' },
    { rank: stats.defenses.heavy, label: 'heavy armor' },
    { rank: stats.defenses.unarmored, label: 'unarmored defense' },
  ];
  const saveEntries = [
    { rank: stats.savingThrows.fortitude, label: 'Fortitude' },
    { rank: stats.savingThrows.reflex, label: 'Reflex' },
    { rank: stats.savingThrows.will, label: 'Will' },
  ];

  const hasFeatures = stats.features.length > 0;

  return (
    <div className="mt-4 border-t border-pf-border pt-3 text-xs text-pf-text">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Initial proficiencies</p>

      <ProficiencyRow heading="Perception">
        <p>{rankLabel(stats.perception)} in Perception</p>
      </ProficiencyRow>

      <ProficiencyRow heading="Saving throws">
        {groupByRank(saveEntries).map(({ rank, labels }) => (
          <p key={rank}>
            {rankLabel(rank)} in {labels.join(' · ')}
          </p>
        ))}
      </ProficiencyRow>

      <ProficiencyRow heading="Skills">
        {stats.trainedSkills.length > 0 && <p>Trained in {stats.trainedSkills.map(humanizeSlug).join(', ')}</p>}
        {stats.additionalSkills > 0 && (
          <p>
            Trained in {stats.additionalSkills} additional skill{stats.additionalSkills === 1 ? '' : 's'} plus your
            Intelligence modifier
          </p>
        )}
      </ProficiencyRow>

      <ProficiencyRow heading="Attacks">
        {groupByRank(attackEntries).map(({ rank, labels }) => (
          <p key={rank}>
            {rankLabel(rank)} in {labels.join(' · ')}
          </p>
        ))}
      </ProficiencyRow>

      <ProficiencyRow heading="Defenses">
        {groupByRank(defenseEntries).map(({ rank, labels }) => (
          <p key={rank}>
            {rankLabel(rank)} in {labels.join(' · ')}
          </p>
        ))}
      </ProficiencyRow>

      {stats.classDC !== null && stats.classDC > 0 && (
        <ProficiencyRow heading="Class DC">
          <p>{rankLabel(stats.classDC)} in class DC</p>
        </ProficiencyRow>
      )}

      {stats.spellcasting !== null && (
        <ProficiencyRow heading="Spells">
          <p>{rankLabel(stats.spellcasting)} in spell attack modifier and spell DC</p>
        </ProficiencyRow>
      )}

      {hasFeatures && (
        // Class features are always-visible: there are only a handful at
        // L1 (Composition Spells, the muse pick, etc. for Bard) and they
        // matter for the build decision the player is making right now.
        // Other panels (ancestry / background) keep their <details>
        // wrapper because their lists can be longer and less central.
        <ProficiencyRow heading={`Class features (${stats.features.length})`}>
          <ul className="flex flex-wrap gap-1">
            {stats.features.map((f) => (
              <li
                key={f.uuid}
                data-uuid={f.uuid}
                className="inline-flex cursor-default items-center gap-1 rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[11px] text-pf-text transition-colors hover:border-pf-primary/60 hover:bg-pf-tertiary/20"
              >
                {f.img && <img src={f.img} alt="" className="h-3.5 w-3.5 rounded" />}
                {f.name}
              </li>
            ))}
          </ul>
        </ProficiencyRow>
      )}
    </div>
  );
}

function ProficiencyRow({ heading, children }: { heading: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-pf-alt-dark">{heading}</p>
      <div className="ml-1 [&_p]:leading-tight">{children}</div>
    </div>
  );
}
