import type { FeatCategory, FeatItem, PreparedActorItem } from '../../api/types';
import { isFeatItem } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { FEAT_CATEGORY_LABEL, FEAT_CATEGORY_ORDER } from '../../lib/pf2e-maps';
import { useUuidHover } from '../../lib/useUuidHover';
import { SectionHeader } from '../common/SectionHeader';

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
      className="space-y-6"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      {FEAT_CATEGORY_ORDER.map((category) => {
        const inCategory = grouped.get(category) ?? [];
        const isCanonical = ALWAYS_SHOW.includes(category);
        if (inCategory.length === 0 && !isCanonical) return null;
        return (
          <div key={category} data-feat-category={category}>
            <SectionHeader>{FEAT_CATEGORY_LABEL[category] ?? category}</SectionHeader>
            {inCategory.length === 0 ? (
              <p className="text-xs italic text-neutral-400">None yet</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
  const enriched = description.length > 0 ? enrichDescription(description) : '';
  const prereqs = (feat.system.prerequisites?.value ?? [])
    .map((p) => p.value)
    .filter((v) => typeof v === 'string' && v.length > 0);

  return (
    <li className="relative" data-item-id={feat.id} data-feat-slug={feat.system.slug ?? ''}>
      <details className="group rounded border border-pf-border bg-white open:rounded-b-none open:border-pf-primary/60 open:shadow-lg">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-2 hover:bg-pf-bg-dark/40">
          <img
            src={feat.img}
            alt=""
            className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-pf-text">{feat.name}</span>
          <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
            Lv {level}
          </span>
          <span className="ml-1 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
          <span className="ml-1 hidden text-[10px] text-pf-alt-dark group-open:inline">▾</span>
        </summary>
        {/* Absolute-positioned body overlays the grid below instead of
            pushing siblings down. Containing block is the `<li>`
            (relative, no border/padding), so `left: 0 / right: 0`
            gives body the same border-box as the details above —
            matching border edges regardless of the grid cell's
            sub-pixel width. Summary drops bottom-corner rounding
            while open to seal the seam. */}
        <div className="absolute left-0 right-0 top-full z-20 rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg px-3 py-2 text-sm text-pf-text shadow-lg">
          {traits.length > 0 && <TraitChips traits={traits} />}
          {prereqs.length > 0 && (
            <p className="mt-2 text-xs text-pf-alt-dark">
              <span className="font-semibold uppercase tracking-widest">Prerequisites</span> {prereqs.join('; ')}
            </p>
          )}
          {enriched.length > 0 ? (
            <div
              className="mt-2 max-h-[28rem] overflow-y-auto pr-1 leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
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

function TraitChips({ traits }: { traits: string[] }): React.ReactElement {
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {traits.map((t) => (
        <li
          key={t}
          className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
        >
          {capitaliseSlug(t)}
        </li>
      ))}
    </ul>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function groupByCategory(feats: FeatItem[]): Map<string, FeatItem[]> {
  const out = new Map<string, FeatItem[]>();
  for (const feat of feats) {
    const arr = out.get(feat.system.category) ?? [];
    arr.push(feat);
    out.set(feat.system.category, arr);
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
          <SectionHeader>{FEAT_CATEGORY_LABEL[category] ?? capitaliseSlug(category)}</SectionHeader>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
