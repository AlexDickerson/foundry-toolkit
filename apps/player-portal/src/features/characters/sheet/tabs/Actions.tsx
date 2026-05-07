import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import { api } from '@/features/characters/api';
import type { Ability, AbilityKey, ActionItem, PreparedActorItem, Strike } from '@/features/characters/types';
import { isActionItem } from '@/features/characters/types';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { useActorAction, type ActorActionState } from '@/_quarantine/lib/useActorAction';
import { SectionHeader } from '@/shared/ui/SectionHeader';

interface Props {
  actions: Strike[];
  items: PreparedActorItem[];
  abilities?: Record<AbilityKey, Ability>;
  actorId: string;
  /** Called after an item use succeeds — Strike rolls are chat-only and
   *  don't trigger this. Wire to the parent's `reloadActor` so any charge
   *  / quantity updates show up. */
  onItemUsed: () => void;
}

// Actions tab — strikes (from system.actions[]) plus action-type items
// split into Actions / Reactions / Free Actions. pf2e's full Actions tab
// also has Encounter/Exploration/Downtime sub-tabs, which we skip since
// the split mostly mirrors the same item data with a sub-trait filter.
export function Actions({ actions, items, abilities, actorId, onItemUsed }: Props): React.ReactElement {
  const strikes = actions.filter((a) => a.type === 'strike' && a.visible);
  const actionItems = items.filter(isActionItem);
  const regularActions = actionItems.filter((a) => a.system.actionType.value === 'action');
  const reactions = actionItems.filter((a) => a.system.actionType.value === 'reaction');
  const freeActions = actionItems.filter((a) => a.system.actionType.value === 'free');

  const hasAny = strikes.length > 0 || actionItems.length > 0;
  if (!hasAny) {
    return <p className="text-sm text-pf-text-muted">No actions available.</p>;
  }

  return (
    <section className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4">
      {strikes.length > 0 && (
        <div>
          <SectionHeader band>Strikes</SectionHeader>
          <ul className="grid grid-cols-2 gap-2">
            {strikes.map((strike) => (
              <StrikeCard key={strike.slug} strike={strike} abilities={abilities} actorId={actorId} />
            ))}
          </ul>
        </div>
      )}

      <ActionSection title="Actions" kind="action" items={regularActions} actorId={actorId} onUsed={onItemUsed} />
      <ActionSection title="Reactions" kind="reaction" items={reactions} actorId={actorId} onUsed={onItemUsed} />
      <ActionSection
        title="Free Actions"
        kind="free"
        items={freeActions}
        actorId={actorId}
        onUsed={onItemUsed}
      />
    </section>
  );
}

// ─── Strike card (existing) ────────────────────────────────────────────

function StrikeCard({
  strike,
  abilities,
  actorId,
}: {
  strike: Strike;
  abilities: Record<AbilityKey, Ability> | undefined;
  actorId: string;
}): React.ReactElement {
  const allTraits = [...strike.traits, ...strike.weaponTraits].filter((t) => t.name !== 'attack');
  const damageText = formatStrikeDamage(strike, abilities);
  const range = strike.item.system.range;

  const attack = useActorAction({
    run: (variantIndex: number) => createPf2eClient(api.dispatch).weapon(actorId, strike.slug).rollAttack(variantIndex),
  });
  const damage = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, strike.slug).rollDamage(false),
  });
  const crit = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, strike.slug).rollDamage(true),
  });
  const error = firstError(attack.state, damage.state, crit.state);

  return (
    <li
      className="rounded border border-pf-border bg-pf-bg p-3"
      data-strike-slug={strike.slug}
      data-ready={strike.ready ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        <img
          src={strike.item.img}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-pf-text">
              {strike.label}
              {strike.quantity > 1 && (
                <span className="ml-2 text-xs font-normal text-pf-text-muted">×{strike.quantity}</span>
              )}
            </span>
            {damageText !== null && (
              <span
                className="flex-shrink-0 font-mono text-xs tabular-nums text-pf-text-muted"
                data-role="strike-damage"
              >
                {damageText}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label="Attack and damage">
            {strike.variants.map((v, i) => {
              const bonus = v.label.split(' ')[0] ?? v.label;
              const color =
                i === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                : i === 1 ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { attack.trigger(i); }}
                  disabled={attack.state === 'pending'}
                  title={v.label}
                  data-variant-index={i}
                  className={`rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums disabled:opacity-50 ${color}`}
                >
                  {bonus}
                </button>
              );
            })}
            <span aria-hidden className="mx-0.5 h-4 w-px bg-pf-border" />
            <button
              type="button"
              onClick={() => { damage.trigger(); }}
              disabled={damage.state === 'pending'}
              className="rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-[11px] font-semibold text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
              data-role="strike-damage-roll"
            >
              {damage.state === 'pending' ? 'Rolling…' : 'Damage'}
            </button>
            <button
              type="button"
              onClick={() => { crit.trigger(); }}
              disabled={crit.state === 'pending'}
              className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              data-role="strike-damage-crit"
            >
              {crit.state === 'pending' ? 'Rolling…' : 'Crit'}
            </button>
          </div>
          {error !== null && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
          {allTraits.length > 0 && <TraitChips traits={allTraits} />}
          {range !== null && range !== undefined && (
            <p className="mt-1 text-[10px] text-pf-text-muted">Range: {range} ft</p>
          )}
        </div>
      </div>
    </li>
  );
}

function firstError(...states: ActorActionState[]): string | null {
  for (const s of states) {
    if (typeof s === 'object') return s.error;
  }
  return null;
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

// ─── Action section (Actions / Reactions / Free Actions) ──────────────

function ActionSection({
  title,
  kind,
  items,
  actorId,
  onUsed,
}: {
  title: string;
  kind: string;
  items: ActionItem[];
  actorId: string;
  onUsed: () => void;
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div data-action-section={kind}>
      <SectionHeader band>{title}</SectionHeader>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <ActionCard key={item.id} item={item} actorId={actorId} onUsed={onUsed} />
        ))}
      </ul>
    </div>
  );
}

function ActionCard({
  item,
  actorId,
  onUsed,
}: {
  item: ActionItem;
  actorId: string;
  onUsed: () => void;
}): React.ReactElement {
  const kind = item.system.actionType.value;
  const count = item.system.actions.value;
  const traits = item.system.traits.value;
  const description = item.system.description?.value ?? '';
  const hasDescription = description.trim() !== '';
  const enriched = hasDescription ? enrichDescription(description) : '';
  const use = useActorAction({
    run: () => api.useItem(actorId, item.id),
    onSuccess: onUsed,
  });

  return (
    <li className="relative" data-action-id={item.id} data-action-kind={kind}>
      <details className="group rounded border border-pf-border bg-pf-bg open:rounded-b-none open:border-pf-primary/60 open:shadow-md">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <img
            src={item.img}
            alt=""
            className="h-6 w-6 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
          <span className="min-w-0 truncate text-sm font-medium text-pf-text">{item.name}</span>
          <ActionCostBadge kind={kind} count={count} />
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); use.trigger(); }}
            disabled={use.state === 'pending'}
            className="ml-auto rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
            data-role="action-use"
          >
            {use.state === 'pending' ? 'Using…' : 'Use'}
          </button>
          <span aria-hidden className="flex-shrink-0 text-[10px] text-pf-alt-dark group-open:hidden">▸</span>
        </summary>
        {typeof use.state === 'object' && (
          <p className="px-3 pb-1 text-[11px] text-red-700">{use.state.error}</p>
        )}
        <div
          className="absolute left-0 right-0 top-full z-20 rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg p-3 shadow-lg"
          data-role="action-description"
        >
          {traits.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1">
              {traits.map((slug) => (
                <li
                  key={slug}
                  className="rounded-full border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[10px] text-pf-text-muted"
                >
                  {capitaliseSlug(slug)}
                </li>
              ))}
            </ul>
          )}
          {hasDescription ? (
            <div
              className="text-sm leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: enriched }}
            />
          ) : (
            <p className="text-sm italic text-neutral-400">No description.</p>
          )}
        </div>
      </details>
    </li>
  );
}

function ActionCostBadge({ kind, count }: { kind: string; count: number | null }): React.ReactElement {
  let label = '—';
  if (kind === 'action') {
    label = count === 1 ? '◆' : count === 2 ? '◆◆' : count === 3 ? '◆◆◆' : '◆';
  } else if (kind === 'reaction') label = '↺';
  else if (kind === 'free') label = '◇';
  else if (kind === 'passive') label = '—';

  return (
    <span className="flex-shrink-0 rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-pf-alt-dark">
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
          className="rounded-full border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[10px] text-pf-text-muted"
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
