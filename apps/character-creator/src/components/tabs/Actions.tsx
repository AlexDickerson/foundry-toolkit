import { useState } from 'react';
import type { Ability, AbilityKey, ActionItem, PreparedActorItem, Strike } from '../../api/types';
import { isActionItem } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  actions: Strike[];
  items: PreparedActorItem[];
  abilities?: Record<AbilityKey, Ability>;
}

// Actions tab — strikes (from system.actions[]) plus action-type items
// split into Actions / Reactions / Free Actions. pf2e's full Actions tab
// also has Encounter/Exploration/Downtime sub-tabs, which we skip since
// the split mostly mirrors the same item data with a sub-trait filter.
export function Actions({ actions, items, abilities }: Props): React.ReactElement {
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
              <StrikeCard key={strike.slug} strike={strike} abilities={abilities} />
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

function StrikeCard({
  strike,
  abilities,
}: {
  strike: Strike;
  abilities: Record<AbilityKey, Ability> | undefined;
}): React.ReactElement {
  const allTraits = [...strike.traits, ...strike.weaponTraits];
  const damageText = formatStrikeDamage(strike, abilities);
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
              <span
                className="flex-shrink-0 font-mono text-xs tabular-nums text-neutral-500"
                data-role="strike-damage"
              >
                {damageText}
              </span>
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

// Compose the damage string from the weapon's static `system.damage`
// plus striking runes, ability modifier, and any flat bonus damage.
//
// Rules we encode (pf2e Player Core "Damage Rolls"):
//   - Base: `dice`d`die` (e.g. 1d8).
//   - Striking runes add dice: +1 die for striking, +2 for greater,
//     +3 for major. Applied to the base die size.
//   - Ability mod to damage:
//       • Melee strike           → STR
//       • Ranged strike, thrown  → STR
//       • Ranged strike, propulsive → floor(STR/2) if positive, full if negative
//       • Otherwise               → none
//   - Flat bonus: `bonusDamage.value` (typically from weapon specialization
//     feats or runes). Weapon specialization is NOT recomputed here —
//     we only show what pf2e already folded into `bonusDamage`.
//
// Property runes are intentionally left out of the main line — they're
// typically conditional damage (on-crit, on-trigger) and their formulas
// vary by rune, so listing them as always-on would mislead.
function formatStrikeDamage(
  strike: Strike,
  abilities: Record<AbilityKey, Ability> | undefined,
): string | null {
  const dmg = strike.item.system.damage;
  if (!dmg) return null;

  const strikingExtra = strike.item.system.runes?.striking ?? 0;
  const dice = dmg.dice + strikingExtra;
  // Base die is shown as-is. The 'two-hand-dX' trait would swap it when
  // the weapon is wielded two-handed, but the prepared payload doesn't
  // expose the current grip reliably — we let the trait chip communicate
  // the alternative instead of speculating.
  let out = `${dice.toString()}${dmg.die}`;

  const abilityMod = computeDamageAbilityMod(strike, abilities);
  const bonus = strike.item.system.bonusDamage?.value ?? 0;
  const flat = abilityMod + bonus;
  if (flat > 0) out += `+${flat.toString()}`;
  else if (flat < 0) out += flat.toString();

  out += ` ${dmg.damageType}`;
  return out;
}

function computeDamageAbilityMod(
  strike: Strike,
  abilities: Record<AbilityKey, Ability> | undefined,
): number {
  if (!abilities) return 0;
  const domains = strike.domains ?? [];
  const isMelee = domains.includes('melee-strike-attack-roll');
  const isRanged = domains.includes('ranged-strike-attack-roll');
  const traitNames = new Set(strike.weaponTraits.map((t) => t.name));
  const strMod = abilities.str.mod;

  if (isMelee) return strMod;
  if (isRanged) {
    if (traitNames.has('thrown')) return strMod;
    if (traitNames.has('propulsive')) return strMod >= 0 ? Math.floor(strMod / 2) : strMod;
    return 0;
  }
  return 0;
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
  const [expanded, setExpanded] = useState(false);
  const description = item.system.description?.value ?? '';
  const hasDescription = description.trim() !== '';
  const enriched = hasDescription ? enrichDescription(description) : '';

  const toggle = (): void => {
    setExpanded((v) => !v);
  };

  return (
    <li
      className="rounded border border-neutral-200 bg-white"
      data-action-id={item.id}
      data-action-kind={kind}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-pf-bg-dark/40"
        data-testid="action-card-toggle"
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
            <span className="ml-auto text-[10px] text-neutral-500" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
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
      </button>
      {expanded && (
        <div
          className="border-t border-neutral-200 bg-pf-bg/60 px-3 py-2 text-sm text-pf-text"
          data-role="action-description"
        >
          {hasDescription ? (
            <div
              className="leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: enriched }}
            />
          ) : (
            <p className="italic text-neutral-400">No description.</p>
          )}
        </div>
      )}
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
