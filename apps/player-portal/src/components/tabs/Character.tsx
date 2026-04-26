import { useState } from 'react';
import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import { api } from '../../api/client';
import type {
  AbilityKey,
  CharacterSystem,
  IWREntry,
  PreparedActorItem,
  Save,
  Shield,
  SkillStatistic,
  SpellcastingEntryItem,
  Strike,
} from '../../api/types';
import { ABILITY_KEYS, isCantripSpell, isActionItem, isSpellItem, isSpellcastingEntryItem } from '../../api/types';
import { t } from '../../i18n/t';
import { formatSignedInt } from '../../lib/format';
import { useActorAction, type ActorActionState } from '../../lib/useActorAction';
import { ModifierTooltip } from '../common/ModifierTooltip';
import { RankChip } from '../common/RankChip';
import { SectionHeader } from '../common/SectionHeader';
import { QuickActionPicker, type QuickActionOption, type QAStrike, type QAItem, type QASpell } from '../sheet/QuickActionPicker';
import { useQuickActions } from '../../lib/useQuickActions';

interface Props {
  system: CharacterSystem;
  actorId: string;
  items: PreparedActorItem[];
  characterLevel: number;
  /** Fired after any server-acknowledged mutation from this tab — long
   *  rest, HP adjust, hero-point adjust — so the parent can refetch
   *  `/prepared` and redraw. */
  onActorChanged: () => void;
}

// Character landing tab — ability scores, headline defensive/offensive
// stats, hero points, speeds, languages, traits. Ported in structure
// from pf2e's static/templates/actors/character/tabs/character.hbs, but
// read-only (no input widgets) and Tailwind-styled.
export function Character({ system, actorId, items, characterLevel, onActorChanged }: Props): React.ReactElement {
  const keyAbility = system.details.keyability.value;
  const classDC = system.attributes.classDC;

  return (
    <section className="space-y-6">
      <AbilityBlock abilities={system.abilities} keyAbility={keyAbility} />

      <StatsBlock system={system} actorId={actorId} onActorChanged={onActorChanged} />

      <IWRBlock
        immunities={system.attributes.immunities}
        weaknesses={system.attributes.weaknesses}
        resistances={system.attributes.resistances}
      />

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <SkillsBlock skills={system.skills} actorId={actorId} condensed />
        </div>
        <QuickActionsBlock
          strikes={system.actions}
          items={items}
          characterLevel={characterLevel}
          focusPoints={system.resources.focus}
          actorId={actorId}
          onActorChanged={onActorChanged}
        />
      </div>

      <div data-section="conditions">
        <SectionHeader>Conditions</SectionHeader>
        <div className="space-y-3">
          <ConditionsRow
            dying={system.attributes.dying}
            wounded={system.attributes.wounded}
            doomed={system.attributes.doomed}
            actorId={actorId}
            onActorChanged={onActorChanged}
          />
          {system.attributes.shield.itemId !== null && <ShieldTile shield={system.attributes.shield} />}
        </div>
      </div>
    </section>
  );
}

// ─── Sub-sections ──────────────────────────────────────────────────────

function AbilityBlock({
  abilities,
  keyAbility,
}: {
  abilities: CharacterSystem['abilities'];
  keyAbility: AbilityKey;
}): React.ReactElement {
  return (
    <div>
      <SectionHeader>Ability Modifiers</SectionHeader>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_KEYS.map((ak) => {
          const a = abilities[ak];
          const isKey = ak === keyAbility;
          return (
            <li
              key={ak}
              data-attribute={ak}
              className={[
                'relative flex flex-col items-center rounded border px-2 py-3 shadow-sm',
                isKey ? 'border-pf-tertiary-dark bg-pf-tertiary/40' : 'border-pf-border bg-pf-bg',
              ].join(' ')}
            >
              {isKey && (
                <span
                  className="absolute right-1 top-1 text-[10px] font-semibold uppercase tracking-wider text-pf-primary"
                  title="Key attribute"
                >
                  KEY
                </span>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                {t(a.shortLabel)}
              </span>
              <span className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-pf-text">
                {formatSignedInt(a.mod)}
              </span>
              <span className="text-[10px] text-pf-alt">{t(a.label)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatsBlock({
  system,
  actorId,
  onActorChanged,
}: {
  system: CharacterSystem;
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const { ac, hp } = system.attributes;
  const { perception } = system;
  const saves = system.saves;

  const rollPerception = useActorAction({
    run: () => api.rollActorStatistic(actorId, 'perception'),
  });
  // All three saves go through the pf2e-rules Layer 1 client → generic
  // dispatcher (Layer 0).  createPf2eClient is pure and cheap; recreating
  // per render is fine for now — memoize if profiling shows it matters.
  const rollFortitude = useActorAction({
    run: () => createPf2eClient(api.dispatch).character(actorId).rollSave('fortitude'),
  });
  const rollReflex = useActorAction({
    run: () => createPf2eClient(api.dispatch).character(actorId).rollSave('reflex'),
  });
  const rollWill = useActorAction({
    run: () => createPf2eClient(api.dispatch).character(actorId).rollSave('will'),
  });
  const error =
    firstError(rollPerception.state, rollFortitude.state, rollReflex.state, rollWill.state);

  return (
    <div>
      <SectionHeader>Key Stats</SectionHeader>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="AC" value={ac.value.toString()} title={ac.breakdown} />
        <HpTile hp={hp} actorId={actorId} onActorChanged={onActorChanged} />
        <StatTile
          label="Perception"
          value={formatSignedInt(perception.value)}
          title={perception.breakdown}
          rank={perception.rank}
          data-stat="perception"
          onRoll={() => { rollPerception.trigger(); }}
          pending={rollPerception.state === 'pending'}
        />
        <StatTile
          label="Speed"
          value={primarySpeed(system.movement.speeds)}
          data-stat="speed"
        />
        {classDCTile(system)}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <SaveTile
          save={saves.fortitude}
          onRoll={() => { rollFortitude.trigger(); }}
          pending={rollFortitude.state === 'pending'}
        />
        <SaveTile
          save={saves.reflex}
          onRoll={() => { rollReflex.trigger(); }}
          pending={rollReflex.state === 'pending'}
        />
        <SaveTile
          save={saves.will}
          onRoll={() => { rollWill.trigger(); }}
          pending={rollWill.state === 'pending'}
        />
      </div>
      {error !== null && (
        <p className="mt-1 text-[11px] text-red-700" data-role="stats-roll-error">
          {error}
        </p>
      )}
    </div>
  );
}

function firstError(...states: ActorActionState[]): string | null {
  for (const s of states) {
    if (typeof s === 'object') return s.error;
  }
  return null;
}

// Replaces the plain HP `StatTile` with a stepper. Keeps the stat-card
// shape (label + value on top) and tucks −5 / −1 / +1 / +5 buttons
// below so the tile still sits flush with the other stats in the grid.
function HpTile({
  hp,
  actorId,
  onActorChanged,
}: {
  hp: CharacterSystem['attributes']['hp'];
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const value = hp.temp > 0 ? `${hp.value.toString()} (+${hp.temp.toString()})` : `${hp.value.toString()} / ${hp.max.toString()}`;
  const { state, trigger } = useActorAction({
    run: (delta: number) => api.adjustActorResource(actorId, 'hp', delta),
    onSuccess: onActorChanged,
  });
  const isError = typeof state === 'object';

  return (
    <div
      className="flex flex-col items-center rounded border border-pf-border bg-pf-bg px-2 py-2 shadow-sm"
      title={hp.breakdown}
      data-stat="hp"
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">HP</span>
      <span className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-pf-text">{value}</span>
      <div className="mt-1 flex gap-0.5" data-role="hp-stepper">
        <StepButton label="−5" disabled={state === 'pending'} onClick={() => { trigger(-5); }} />
        <StepButton label="−1" disabled={state === 'pending'} onClick={() => { trigger(-1); }} />
        <StepButton label="+1" disabled={state === 'pending'} onClick={() => { trigger(1); }} />
        <StepButton label="+5" disabled={state === 'pending'} onClick={() => { trigger(5); }} />
      </div>
      {isError && <span className="mt-1 text-[10px] text-red-700">{state.error}</span>}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-pf-border bg-pf-bg px-1 py-0.5 font-mono text-[10px] text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function classDCTile(system: CharacterSystem): React.ReactElement {
  const classDC = system.attributes.classDC;
  if (!classDC) return <StatTile label="Class DC" value="—" />;
  return (
    <StatTile
      label="Class DC"
      value={classDC.dc.toString()}
      title={classDC.breakdown}
      rank={classDC.rank}
      data-stat="class-dc"
    />
  );
}

function SaveTile({
  save,
  onRoll,
  pending,
}: {
  save: Save;
  onRoll: () => void;
  pending: boolean;
}): React.ReactElement {
  return (
    <StatTile
      label={t(save.label)}
      value={formatSignedInt(save.value)}
      title={save.breakdown}
      rank={save.rank}
      data-stat={`save-${save.slug}`}
      onRoll={onRoll}
      pending={pending}
    />
  );
}

function StatTile({
  label,
  value,
  title,
  rank,
  onRoll,
  pending,
  ...rest
}: {
  label: string;
  value: string;
  title?: string;
  rank?: import('../../api/types').ProficiencyRank;
  /** When set, the tile becomes a clickable button that fires a
   *  roll. Omit to keep it as a display-only stat card. */
  onRoll?: () => void;
  pending?: boolean;
  'data-stat'?: string;
}): React.ReactElement {
  const contents = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</span>
      <span className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-pf-text">
        {pending === true ? '…' : value}
      </span>
      {rank !== undefined && <RankChip rank={rank} className="mt-1" />}
    </>
  );

  if (onRoll === undefined) {
    return (
      <div
        className="flex flex-col items-center rounded border border-pf-border bg-pf-bg px-3 py-2 shadow-sm"
        title={title}
        {...rest}
      >
        {contents}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={pending === true}
      title={title}
      className="flex flex-col items-center rounded border border-pf-border bg-pf-bg px-3 py-2 shadow-sm hover:border-pf-tertiary-dark hover:bg-pf-tertiary/40 disabled:opacity-60 disabled:hover:bg-pf-bg"
      {...rest}
    >
      {contents}
    </button>
  );
}


function ShieldTile({ shield }: { shield: Shield }): React.ReactElement {
  const name = t(shield.name);
  return (
    <div
      className="flex items-center gap-3 rounded border border-pf-border bg-pf-bg px-3 py-2"
      data-stat="shield"
      title={`Hardness ${shield.hardness.toString()} · Broken Threshold ${shield.brokenThreshold.toString()}`}
    >
      {shield.icon && (
        <img src={shield.icon} alt="" className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      )}
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-pf-text">{name}</span>
        <span className="text-xs text-pf-text-muted">
          <span className="font-semibold">+{shield.ac}</span> AC
        </span>
        <span className="text-xs text-pf-text-muted">
          HP{' '}
          <span className="font-mono tabular-nums">
            {shield.hp.value}/{shield.hp.max}
          </span>
        </span>
        <span className="text-xs text-pf-text-muted">
          Hardness <span className="font-mono tabular-nums">{shield.hardness}</span>
        </span>
        {shield.raised && (
          <span className="rounded-full border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
            Raised
          </span>
        )}
        {shield.broken && (
          <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-700">
            Broken
          </span>
        )}
        {shield.destroyed && (
          <span className="rounded-full border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-700">
            Destroyed
          </span>
        )}
      </div>
    </div>
  );
}

function ConditionsRow({
  dying,
  wounded,
  doomed,
  actorId,
  onActorChanged,
}: {
  dying: CharacterSystem['attributes']['dying'];
  wounded: CharacterSystem['attributes']['wounded'];
  doomed: CharacterSystem['attributes']['doomed'];
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const adjustDying = useActorAction({
    run: (delta: number) => api.adjustActorCondition(actorId, 'dying', delta),
    onSuccess: onActorChanged,
  });
  const adjustWounded = useActorAction({
    run: (delta: number) => api.adjustActorCondition(actorId, 'wounded', delta),
    onSuccess: onActorChanged,
  });
  const adjustDoomed = useActorAction({
    run: (delta: number) => api.adjustActorCondition(actorId, 'doomed', delta),
    onSuccess: onActorChanged,
  });
  const error =
    typeof adjustDying.state === 'object'
      ? adjustDying.state.error
      : typeof adjustWounded.state === 'object'
        ? adjustWounded.state.error
        : typeof adjustDoomed.state === 'object'
          ? adjustDoomed.state.error
          : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-section="conditions">
        <Condition
          label="Dying"
          value={dying.value}
          max={dying.max}
          colorOn="border-red-500 bg-red-600"
          title={`Recovery DC ${dying.recoveryDC.toString()}`}
          data-stat="dying"
          onAdjust={(delta) => { adjustDying.trigger(delta); }}
          pending={adjustDying.state === 'pending'}
        />
        <Condition
          label="Wounded"
          value={wounded.value}
          max={wounded.max}
          colorOn="border-amber-500 bg-amber-600"
          data-stat="wounded"
          onAdjust={(delta) => { adjustWounded.trigger(delta); }}
          pending={adjustWounded.state === 'pending'}
        />
        <Condition
          label="Doomed"
          value={doomed.value}
          max={doomed.max}
          colorOn="border-violet-500 bg-violet-700"
          data-stat="doomed"
          onAdjust={(delta) => { adjustDoomed.trigger(delta); }}
          pending={adjustDoomed.state === 'pending'}
        />
      </div>
      {error !== null && (
        <p className="text-[11px] text-red-700" data-role="conditions-error">
          {error}
        </p>
      )}
    </div>
  );
}

function Condition({
  label,
  value,
  max,
  colorOn,
  title,
  onAdjust,
  pending,
  ...rest
}: {
  label: string;
  value: number;
  max: number;
  colorOn: string;
  title?: string;
  /** When set, renders −/+ buttons that call `onAdjust(delta)` with
   *  ±1. Omit to keep the condition read-only. */
  onAdjust?: (delta: number) => void;
  pending?: boolean;
  'data-stat'?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" title={title} {...rest}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-text-muted">{label}</span>
      {onAdjust !== undefined && (
        <StepButton label="−" disabled={pending ?? false} onClick={() => { onAdjust(-1); }} />
      )}
      <div className="flex gap-1" aria-label={`${value.toString()} of ${max.toString()}`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[
              'inline-block h-2.5 w-2.5 rounded-sm border',
              i < value ? colorOn : 'border-pf-border bg-pf-bg',
            ].join(' ')}
          />
        ))}
      </div>
      {onAdjust !== undefined && (
        <StepButton label="+" disabled={pending ?? false} onClick={() => { onAdjust(1); }} />
      )}
      <span className="font-mono text-xs tabular-nums text-pf-text-muted">
        {value}/{max}
      </span>
    </div>
  );
}


function IWRBlock({
  immunities,
  weaknesses,
  resistances,
}: {
  immunities: IWREntry[];
  weaknesses: IWREntry[];
  resistances: IWREntry[];
}): React.ReactElement | null {
  if (immunities.length === 0 && weaknesses.length === 0 && resistances.length === 0) return null;
  return (
    <div data-section="iwr" className="space-y-2">
      <SectionHeader>Defenses</SectionHeader>
      <IWRRow label="Immunities" entries={immunities} />
      <IWRRow label="Weaknesses" entries={weaknesses} />
      <IWRRow label="Resistances" entries={resistances} />
    </div>
  );
}

function IWRRow({ label, entries }: { label: string; entries: IWREntry[] }): React.ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-iwr={label.toLowerCase()}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-text-muted">{label}</span>
      {entries.map((e, i) => (
        <span
          key={`${e.type}-${i.toString()}`}
          className="rounded-full border border-pf-border bg-pf-bg px-2.5 py-0.5 text-xs text-pf-text"
          title={e.exceptions?.length ? `except ${e.exceptions.join(', ')}` : undefined}
        >
          {humaniseSlug(e.type)}
          {e.value !== undefined ? ` ${e.value.toString()}` : ''}
        </span>
      ))}
    </div>
  );
}


function primarySpeed(speeds: CharacterSystem['movement']['speeds']): string {
  const land = speeds.land;
  if (land) return `${land.value.toString()} ft`;
  const entries = Object.values(speeds);
  const first = entries[0];
  return first ? `${first.value.toString()} ft` : '—';
}


function SkillsBlock({
  skills,
  actorId,
  condensed = false,
}: {
  skills: CharacterSystem['skills'];
  actorId: string;
  condensed?: boolean;
}): React.ReactElement {
  const allSkills = Object.values(skills) as SkillStatistic[];
  const coreSkills = allSkills.filter((s) => !s.lore);
  const loreSkills = allSkills.filter((s) => s.lore);

  return (
    <div>
      <SectionHeader>Skills</SectionHeader>
      <ul className={condensed ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
        {coreSkills.map((skill) => (
          <SkillItem key={skill.slug} skill={skill} actorId={actorId} condensed={condensed} />
        ))}
      </ul>
      {loreSkills.length > 0 && (
        <ul className={condensed ? 'mt-1 grid grid-cols-2 gap-1' : 'mt-2 grid grid-cols-1 gap-2'}>
          {loreSkills.map((skill) => (
            <SkillItem key={skill.slug} skill={skill} actorId={actorId} condensed={condensed} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SkillItem({
  skill,
  actorId,
  condensed = false,
}: {
  skill: SkillStatistic;
  actorId: string;
  condensed?: boolean;
}): React.ReactElement {
  const roll = useActorAction({
    run: () => createPf2eClient(api.dispatch).character(actorId).rollSkill(skill.slug),
  });

  return (
    <li className="group relative rounded border border-pf-border bg-pf-bg shadow-sm" data-statistic={skill.slug}>
      <button
        type="button"
        className={[
          'flex w-full items-center gap-2 hover:bg-pf-bg-dark disabled:opacity-50',
          condensed ? 'px-2 py-1' : 'px-3 py-2',
        ].join(' ')}
        onClick={() => {
          roll.trigger();
        }}
        disabled={roll.state === 'pending'}
      >
        <span className="inline-flex w-8 justify-end font-mono text-sm tabular-nums text-pf-secondary">
          {formatSignedInt(skill.value)}
        </span>
        <span className="flex-1 truncate text-sm text-pf-text">
          {skill.lore === true ? skill.label : t(skill.label)}
        </span>
        <RankChip rank={skill.rank} condensed={condensed} />
      </button>
      <ModifierTooltip title={skill.label} breakdown={skill.breakdown} modifiers={skill.modifiers} />
    </li>
  );
}

function buildQuickOptions(
  strikes: Strike[],
  items: PreparedActorItem[],
  characterLevel: number,
): QuickActionOption[] {
  const strikeOpts: QAStrike[] = strikes
    .filter((s) => s.type === 'strike' && s.visible)
    .map((s) => ({
      kind: 'strike',
      id: `strike:${s.slug}`,
      slug: s.slug,
      label: s.label,
      img: s.item.img,
      variants: s.variants,
    }));

  const itemOpts: QAItem[] = items.filter(isActionItem).map((item) => ({
    kind: 'item',
    id: `item:${item.id}`,
    itemId: item.id,
    label: item.name,
    img: item.img,
  }));

  const spellOpts: QASpell[] = items.filter(isSpellItem).map((spell) => {
    const isCantrip = isCantripSpell(spell);
    const rank = isCantrip ? Math.ceil(characterLevel / 2) : (spell.system.level?.value ?? 1);
    return {
      kind: 'spell',
      id: `spell:${spell.id}`,
      spellId: spell.id,
      label: spell.name,
      img: spell.img,
      entryId: spell.system.location?.value ?? '',
      rank,
      isCantrip,
    };
  });

  return [...strikeOpts, ...itemOpts, ...spellOpts];
}

function QuickActionsBlock({
  strikes,
  items,
  characterLevel,
  focusPoints,
  actorId,
  onActorChanged,
}: {
  strikes: Strike[];
  items: PreparedActorItem[];
  characterLevel: number;
  focusPoints: { value: number; max: number };
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const [selectedIds, setSelectedIds] = useQuickActions(actorId);
  const [showPicker, setShowPicker] = useState(false);

  const allOptions = buildQuickOptions(strikes, items, characterLevel);
  const selected = selectedIds
    .map((id) => allOptions.find((o) => o.id === id))
    .filter((o): o is QuickActionOption => o !== undefined);

  return (
    <div className="w-48 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="border-l-2 border-pf-primary pl-3 font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
          Quick Actions
        </h2>
        <button
          type="button"
          onClick={() => { setShowPicker(true); }}
          title="Configure quick actions"
          className="flex h-5 w-5 items-center justify-center rounded border border-pf-border text-pf-text-muted hover:bg-pf-bg-dark"
          aria-label="Configure quick actions"
        >
          <PencilIcon />
        </button>
      </div>

      {selected.length === 0 ? (
        <p className="text-xs italic text-pf-text-muted">Tap the pencil to add quick actions.</p>
      ) : (
        <ul className="space-y-1.5">
          {selected.map((opt) => {
            if (opt.kind === 'strike') {
              return <StrikeQuickRow key={opt.id} option={opt} actorId={actorId} />;
            }
            if (opt.kind === 'item') {
              return <ItemQuickRow key={opt.id} option={opt} actorId={actorId} onUsed={onActorChanged} />;
            }
            return (
              <SpellQuickRow
                key={opt.id}
                option={opt}
                actorId={actorId}
                items={items}
                focusPoints={focusPoints}
                onCast={onActorChanged}
              />
            );
          })}
        </ul>
      )}

      {showPicker && (
        <QuickActionPicker
          options={allOptions}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onClose={() => { setShowPicker(false); }}
        />
      )}
    </div>
  );
}

function StrikeQuickRow({ option, actorId }: { option: QAStrike; actorId: string }): React.ReactElement {
  const damage = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, option.slug).rollDamage(false),
  });
  const crit = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, option.slug).rollDamage(true),
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className="rounded border border-pf-border bg-pf-bg px-2 py-1.5 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5">
        {imgSrc && (
          <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />
        )}
        <span className="flex-1 truncate text-[11px] font-medium text-pf-text">{option.label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {option.variants.map((v, i) => (
          <VariantAttackButton key={i} label={v.label} actorId={actorId} slug={option.slug} variantIndex={i} />
        ))}
        <button
          type="button"
          onClick={() => { damage.trigger(); }}
          disabled={damage.state === 'pending'}
          className="rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-[10px] font-semibold text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
        >
          Dmg
        </button>
        <button
          type="button"
          onClick={() => { crit.trigger(); }}
          disabled={crit.state === 'pending'}
          className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
        >
          Crit
        </button>
      </div>
    </li>
  );
}

function ItemQuickRow({
  option,
  actorId,
  onUsed,
}: {
  option: QAItem;
  actorId: string;
  onUsed: () => void;
}): React.ReactElement {
  const use = useActorAction({
    run: () => api.useItem(actorId, option.itemId),
    onSuccess: onUsed,
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className="rounded border border-pf-border bg-pf-bg px-2 py-1.5 shadow-sm">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />}
          <span className="truncate text-[11px] font-medium text-pf-text">{option.label}</span>
        </div>
        <button
          type="button"
          onClick={() => { use.trigger(); }}
          disabled={use.state === 'pending'}
          className="shrink-0 rounded border border-pf-primary/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pf-primary hover:bg-pf-primary/10 disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </li>
  );
}

function SpellQuickRow({
  option,
  actorId,
  items,
  focusPoints,
  onCast,
}: {
  option: QASpell;
  actorId: string;
  items: PreparedActorItem[];
  focusPoints: { value: number; max: number };
  onCast: () => void;
}): React.ReactElement {
  const entry = items.find(
    (i): i is SpellcastingEntryItem => isSpellcastingEntryItem(i) && i.id === option.entryId,
  );
  const mode = entry?.system.prepared.value ?? 'prepared';
  type SlotData = { value?: number; prepared?: { id: string; expended: boolean }[] };
  const slots = entry?.system.slots as Record<string, SlotData> | undefined;
  const slotData = slots?.[`slot${option.rank.toString()}`];

  const isExpended =
    !option.isCantrip && mode === 'prepared'
      ? (slotData?.prepared?.find((p) => p.id === option.spellId)?.expended ?? false)
      : false;
  const noSlotsLeft = !option.isCantrip && mode === 'spontaneous' && (slotData?.value ?? 0) <= 0;
  const noFocus = !option.isCantrip && mode === 'focus' && focusPoints.value <= 0;
  const unavailable = isExpended || noSlotsLeft || noFocus;

  const cast = useActorAction({
    run: () =>
      createPf2eClient(api.dispatch, api.invokeActorAction)
        .spellEntry(actorId, option.entryId)
        .cast(option.spellId, option.rank),
    onSuccess: onCast,
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className={['rounded border bg-pf-bg px-2 py-1.5 shadow-sm', unavailable ? 'border-pf-border/50 opacity-60' : 'border-pf-border'].join(' ')}>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />}
          <span className={['truncate text-[11px] font-medium', unavailable ? 'text-pf-text-muted line-through' : 'text-pf-text'].join(' ')}>
            {option.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { cast.trigger(); }}
          disabled={cast.state === 'pending' || unavailable}
          className="shrink-0 rounded border border-pf-primary/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pf-primary hover:bg-pf-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cast
        </button>
      </div>
    </li>
  );
}

function VariantAttackButton({
  label,
  actorId,
  slug,
  variantIndex,
}: {
  label: string;
  actorId: string;
  slug: string;
  variantIndex: number;
}): React.ReactElement {
  const roll = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, slug).rollAttack(variantIndex),
  });
  const bonus = label.split(' ')[0];
  return (
    <button
      type="button"
      onClick={() => { roll.trigger(); }}
      disabled={roll.state === 'pending'}
      title={label}
      className="rounded border border-pf-border bg-pf-bg-dark px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-pf-secondary hover:border-pf-tertiary-dark hover:bg-pf-tertiary/40 disabled:opacity-50"
    >
      {bonus}
    </button>
  );
}

function PencilIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function humaniseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
