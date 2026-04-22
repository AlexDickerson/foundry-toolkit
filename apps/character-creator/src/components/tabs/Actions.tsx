import type { ActionItem, PreparedActorItem, Strike } from '../../api/types';
import { isActionItem } from '../../api/types';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  actions: Strike[];
  items: PreparedActorItem[];
}

// Actions tab — strikes (from system.actions[]) plus action-type items
// split into Actions / Reactions / Free Actions. pf2e's full Actions tab
// also has Encounter/Exploration/Downtime sub-tabs, which we skip since
// the split mostly mirrors the same item data with a sub-trait filter.
export function Actions({ actions, items }: Props): React.ReactElement {
  const strikes = actions.filter((a) => a.type === 'strike' && a.visible);
  const actionItems = items.filter(isActionItem);
  const regularActions = actionItems.filter((a) => a.system.actionType.value === 'action');
  const reactions = actionItems.filter((a) => a.system.actionType.value === 'reaction');
  const freeActions = actionItems.filter((a) => a.system.actionType.value === 'free');

  const hasAny = strikes.length > 0 || actionItems.length > 0;
  if (!hasAny) {
    return <p className="text-sm text-neutral-500">No actions available.</p>;
  }

  return (
    <section className="space-y-6">
      {strikes.length > 0 && (
        <div>
          <SectionHeader>Strikes</SectionHeader>
          <ul className="space-y-2">
            {strikes.map((strike) => (
              <StrikeCard key={strike.slug} strike={strike} />
            ))}
          </ul>
        </div>
      )}

      <ActionSection title="Actions" kind="action" items={regularActions} />
      <ActionSection title="Reactions" kind="reaction" items={reactions} />
      <ActionSection title="Free Actions" kind="free" items={freeActions} />
    </section>
  );
}

// ─── Strike card (existing) ────────────────────────────────────────────

function StrikeCard({ strike }: { strike: Strike }): React.ReactElement {
  const allTraits = [...strike.traits, ...strike.weaponTraits];
  const damage = strike.item.system.damage;
  const damageText = damage ? `${damage.dice.toString()}${damage.die} ${damage.damageType}` : null;
  const range = strike.item.system.range;

  return (
    <li
      className="rounded border border-neutral-200 bg-white p-3"
      data-strike-slug={strike.slug}
      data-ready={strike.ready ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        <img
          src={strike.item.img}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded border border-neutral-200 bg-neutral-50"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-neutral-900">
              {strike.label}
              {strike.quantity > 1 && (
                <span className="ml-2 text-xs font-normal text-neutral-500">×{strike.quantity}</span>
              )}
            </span>
            {damageText !== null && (
              <span className="flex-shrink-0 font-mono text-xs tabular-nums text-neutral-500">{damageText}</span>
            )}
          </div>
          <VariantStrip variants={strike.variants} />
          {allTraits.length > 0 && <TraitChips traits={allTraits} />}
          {range !== null && range !== undefined && (
            <p className="mt-1 text-[10px] text-neutral-500">Range: {range} ft</p>
          )}
        </div>
      </div>
    </li>
  );
}

function VariantStrip({ variants }: { variants: { label: string }[] }): React.ReactElement {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Attack variants">
      {variants.map((v, i) => (
        <li
          key={`${i.toString()}-${v.label}`}
          className={[
            'rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums',
            i === 0
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-neutral-200 bg-neutral-50 text-neutral-700',
          ].join(' ')}
        >
          {v.label}
        </li>
      ))}
    </ul>
  );
}

// ─── Action section (Actions / Reactions / Free Actions) ──────────────

function ActionSection({
  title,
  kind,
  items,
}: {
  title: string;
  kind: string;
  items: ActionItem[];
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div data-action-section={kind}>
      <SectionHeader>{title}</SectionHeader>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <ActionCard key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function ActionCard({ item }: { item: ActionItem }): React.ReactElement {
  const kind = item.system.actionType.value;
  const count = item.system.actions.value;
  const traits = item.system.traits.value;

  return (
    <li
      className="flex items-start gap-3 rounded border border-neutral-200 bg-white px-3 py-2"
      data-action-id={item.id}
      data-action-kind={kind}
    >
      <img
        src={item.img}
        alt=""
        className="mt-0.5 h-8 w-8 flex-shrink-0 rounded border border-neutral-200 bg-neutral-50"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-neutral-900">{item.name}</span>
          <ActionCostBadge kind={kind} count={count} />
        </div>
        {traits.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {traits.map((slug) => (
              <li
                key={slug}
                className="rounded-full border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-[10px] text-neutral-600"
              >
                {capitaliseSlug(slug)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function ActionCostBadge({ kind, count }: { kind: string; count: number | null }): React.ReactElement {
  // PF2e renders these as decorative glyphs; we use short text so the
  // viewer reads the same on any font/render surface.
  let label = '—';
  if (kind === 'action') {
    label = count === 1 ? '1A' : count === 2 ? '2A' : count === 3 ? '3A' : 'A';
  } else if (kind === 'reaction') label = 'R';
  else if (kind === 'free') label = 'F';
  else if (kind === 'passive') label = 'P';

  const palette: Record<string, string> = {
    action: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    reaction: 'border-sky-300 bg-sky-50 text-sky-800',
    free: 'border-violet-300 bg-violet-50 text-violet-800',
    passive: 'border-neutral-300 bg-neutral-50 text-neutral-600',
  };
  return (
    <span
      className={[
        'flex-shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums',
        palette[kind] ?? palette['passive'] ?? '',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────

function TraitChips({ traits }: { traits: { name: string; label: string }[] }): React.ReactElement {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {traits.map((t) => (
        <li
          key={t.name}
          className="rounded-full border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-[10px] text-neutral-600"
          title={t.name}
        >
          {t.label}
        </li>
      ))}
    </ul>
  );
}

function capitaliseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
