import type { FeatCategory, FeatItem, PreparedActorItem } from '@/features/characters/types';
import { isFeatItem } from '@/features/characters/types';
import { FEAT_CATEGORY_LABEL, FEAT_CATEGORY_ORDER, resolveFeatCategory } from '@/shared/lib/pf2e-maps';
import { useUuidHover } from '@/shared/hooks/useUuidHover';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { DetailsCard } from '@/shared/ui/DetailsCard';
import { EnrichedDescription } from '@/shared/ui/EnrichedDescription';
import { TraitChips } from '@/shared/ui/TraitChips';

interface Props {
  items: PreparedActorItem[];
}

// Canonical categories that always render a section, empty or not — so
// the reader can see which slots exist even when unfilled (in particular
// Bonus Feats, which many low-level characters don't have yet).
// `pfsboon` stays hidden when empty since it only matters for organized
// play.
const ALWAYS_SHOW: readonly FeatCategory[] = ['ancestry', 'class', 'classfeature', 'skill', 'general', 'bonus'];

// Feats tab — groups character's feat items by `system.category`, ordered
// to roughly match how pf2e's sheet lays them out. Canonical categories
// render even when empty to advertise the slot. Each card is a
// details/summary so the user can expand for prereqs + description.
export function Feats({ items }: Props): React.ReactElement {
  // One uuid-hover instance serves every expanded description; the
  // delegation handlers on the section catch mouseovers on every
  // `<a data-uuid>` anchor produced by `enrichDescription`.
  const uuidHover = useUuidHover();
  const feats = items.filter(isFeatItem);
  const grouped = groupByCategory(feats);

  return (
    <section
      className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      {FEAT_CATEGORY_ORDER.map((category) => {
        const inCategory = grouped.get(category) ?? [];
        const isCanonical = ALWAYS_SHOW.includes(category);
        if (inCategory.length === 0 && !isCanonical) return null;
        return (
          <div key={category} data-feat-category={category}>
            <SectionHeader band>{FEAT_CATEGORY_LABEL[category] ?? category}</SectionHeader>
            {inCategory.length === 0 ? (
              <p className="text-xs italic text-pf-text-muted">None yet</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {inCategory.map((feat) => (
                  <FeatCard key={feat.id} feat={feat} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {renderUnknownCategories(grouped)}
      {uuidHover.popover}
    </section>
  );
}

function FeatCard({ feat }: { feat: FeatItem }): React.ReactElement {
  const level = feat.system.level.value;
  const traits = feat.system.traits.value.filter((t) => t !== feat.system.category);
  const description = feat.system.description?.value ?? '';
  const prereqs = (feat.system.prerequisites?.value ?? [])
    .map((p) => p.value)
    .filter((v) => typeof v === 'string' && v.length > 0);

  return (
    <DetailsCard
      data-item-id={feat.id}
      data-feat-slug={feat.system.slug ?? ''}
      panelClassName="absolute left-0 top-full z-20 flex w-[calc(200%+0.5rem)] rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg shadow-lg"
      summary={
        <>
          <img
            src={feat.img}
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
          <span className="line-clamp-2 min-h-[2.5em] min-w-0 flex-1 text-sm font-medium leading-tight text-pf-text">{feat.name}</span>
        </>
      }
    >
      {/* Two-column interior — panel spans 2x summary width to avoid z-index
       *  overlap with the sibling card to the right. */}
      <div className="w-36 flex-shrink-0 border-r border-t border-pf-primary/60 px-3 py-3 text-sm text-pf-text">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">Level {level}</p>
        <TraitChips traits={traits} className="mt-1 flex flex-wrap gap-1" />
        {prereqs.length > 0 && (
          <p className="mt-2 text-xs text-pf-alt-dark">
            <span className="font-semibold uppercase tracking-widest">Prerequisites</span>{' '}
            {prereqs.join('; ')}
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1 border-t border-pf-primary/60 px-4 py-3 text-sm text-pf-text">
        <EnrichedDescription raw={description} maxHeightClass="max-h-[28rem]" />
      </div>
    </DetailsCard>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function groupByCategory(feats: FeatItem[]): Map<string, FeatItem[]> {
  const out = new Map<string, FeatItem[]>();
  for (const feat of feats) {
    const key = resolveFeatCategory(feat);
    const arr = out.get(key) ?? [];
    arr.push(feat);
    out.set(key, arr);
  }
  // Sort within each group by level asc, then name.
  for (const [, arr] of out) {
    arr.sort((a, b) => a.system.level.value - b.system.level.value || a.name.localeCompare(b.name));
  }
  return out;
}

function renderUnknownCategories(grouped: Map<string, FeatItem[]>): React.ReactElement | null {
  const known = new Set(FEAT_CATEGORY_ORDER);
  const extras = Array.from(grouped.entries()).filter(([cat]) => !known.has(cat));
  if (extras.length === 0) return null;
  return (
    <>
      {extras.map(([category, feats]) => (
        <div key={category} data-feat-category={category}>
          <SectionHeader band>{FEAT_CATEGORY_LABEL[category] ?? capitaliseSlug(category)}</SectionHeader>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {feats.map((feat) => (
              <FeatCard key={feat.id} feat={feat} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function capitaliseSlug(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
