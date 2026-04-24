import { api } from '../../api/client';
import type { AbilityKey, CharacterSystem, IWREntry, Save, Shield, Speed } from '../../api/types';
import { ABILITY_KEYS } from '../../api/types';
import { t } from '../../i18n/t';
import { formatSignedInt } from '../../lib/format';
import { useActorAction } from '../../lib/useActorAction';
import { RankChip } from '../common/RankChip';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  system: CharacterSystem;
  actorId: string;
  /** Fired after any server-acknowledged mutation from this tab — long
   *  rest, HP adjust, hero-point adjust — so the parent can refetch
   *  `/prepared` and redraw. */
  onActorChanged: () => void;
}

// Character landing tab — ability scores, headline defensive/offensive
// stats, hero points, speeds, languages, traits. Ported in structure
// from pf2e's static/templates/actors/character/tabs/character.hbs, but
// read-only (no input widgets) and Tailwind-styled.
export function Character({ system, actorId, onActorChanged }: Props): React.ReactElement {
  const keyAbility = system.details.keyability.value;
  const classDC = system.attributes.classDC;
  const speeds = populatedSpeeds(system.movement.speeds);
  const xp = system.details.xp;
  const reach = system.attributes.reach;
  const showReach = reach.base !== 5 || reach.manipulate !== reach.base;
  const deityName = system.details.deity?.value?.trim() ?? '';

  return (
    <section className="space-y-6">
      <AbilityBlock abilities={system.abilities} keyAbility={keyAbility} />

      <StatsBlock system={system} actorId={actorId} onActorChanged={onActorChanged} />

      <ConditionsRow
        dying={system.attributes.dying}
        wounded={system.attributes.wounded}
        doomed={system.attributes.doomed}
      />

      {system.attributes.shield.itemId !== null && <ShieldTile shield={system.attributes.shield} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResourcesRow resources={system.resources} actorId={actorId} onActorChanged={onActorChanged} />
        <LongRestButton actorId={actorId} onRested={onActorChanged} />
      </div>

      <MetaRow>
        <MetaItem label="XP">
          <XPBar value={xp.value} max={xp.max} pct={xp.pct} />
        </MetaItem>
        {speeds.length > 0 && (
          <MetaItem label="Speed">
            <SpeedList speeds={speeds} />
          </MetaItem>
        )}
        <MetaItem label="Size">{humaniseSize(system.traits.size.value)}</MetaItem>
        {showReach && (
          <MetaItem label="Reach">
            <span data-stat="reach" className="tabular-nums">
              {reach.base} ft
              {reach.manipulate !== reach.base && (
                <span className="text-neutral-500"> · {reach.manipulate} ft (manipulate)</span>
              )}
            </span>
          </MetaItem>
        )}
        <MetaItem label="Free Hands">
          <span data-stat="hands-free" className="tabular-nums">
            {system.attributes.handsFree}
          </span>
        </MetaItem>
        {deityName !== '' && (
          <MetaItem label="Deity">
            <span data-stat="deity">{deityName}</span>
          </MetaItem>
        )}
        {classDC && (
          <MetaItem label="Class DC">
            <span>
              <strong className="tabular-nums">{classDC.dc}</strong>{' '}
              <span className="text-neutral-500">({classDC.label})</span>
            </span>
          </MetaItem>
        )}
      </MetaRow>

      <IWRBlock
        immunities={system.attributes.immunities}
        weaknesses={system.attributes.weaknesses}
        resistances={system.attributes.resistances}
      />

      <ChipList label="Languages" items={system.details.languages.value.map(humaniseSlug)} />
      <ChipList label="Traits" items={system.traits.value.map(humaniseSlug)} />
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
                'relative flex flex-col items-center rounded border px-2 py-3',
                isKey ? 'border-pf-tertiary-dark bg-pf-tertiary/40' : 'border-pf-border bg-white',
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
  const { perception, initiative } = system;
  const saves = system.saves;

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
        />
        <StatTile
          label="Initiative"
          value={formatSignedInt(initiative.value)}
          title={initiative.breakdown}
          data-stat="initiative"
        />
        {classDCTile(system)}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <SaveTile save={saves.fortitude} />
        <SaveTile save={saves.reflex} />
        <SaveTile save={saves.will} />
      </div>
    </div>
  );
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
      className="flex flex-col items-center rounded border border-pf-border bg-white px-2 py-2"
      title={hp.breakdown}
      data-stat="hp"
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">HP</span>
      <span className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-pf-text">{value}</span>
      <div className="mt-1 flex gap-0.5" data-role="hp-stepper">
        <StepButton label="−5" disabled={state === 'pending'} onClick={() => void trigger(-5)} />
        <StepButton label="−1" disabled={state === 'pending'} onClick={() => void trigger(-1)} />
        <StepButton label="+1" disabled={state === 'pending'} onClick={() => void trigger(1)} />
        <StepButton label="+5" disabled={state === 'pending'} onClick={() => void trigger(5)} />
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
      className="rounded border border-neutral-300 bg-white px-1 py-0.5 font-mono text-[10px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
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

function SaveTile({ save }: { save: Save }): React.ReactElement {
  return (
    <StatTile
      label={t(save.label)}
      value={formatSignedInt(save.value)}
      title={save.breakdown}
      rank={save.rank}
      data-stat={`save-${save.slug}`}
    />
  );
}

function StatTile({
  label,
  value,
  title,
  rank,
  ...rest
}: {
  label: string;
  value: string;
  title?: string;
  rank?: import('../../api/types').ProficiencyRank;
  'data-stat'?: string;
}): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center rounded border border-pf-border bg-white px-3 py-2"
      title={title}
      {...rest}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</span>
      <span className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-pf-text">{value}</span>
      {rank !== undefined && <RankChip rank={rank} className="mt-1" />}
    </div>
  );
}

function ResourcesRow({
  resources,
  actorId,
  onActorChanged,
}: {
  resources: CharacterSystem['resources'];
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const { heroPoints, focus, investiture, mythicPoints } = resources;
  const adjustHero = useActorAction({
    run: (delta: number) => api.adjustActorResource(actorId, 'hero-points', delta),
    onSuccess: onActorChanged,
  });
  const adjustFocus = useActorAction({
    run: (delta: number) => api.adjustActorResource(actorId, 'focus-points', delta),
    onSuccess: onActorChanged,
  });
  const error =
    typeof adjustHero.state === 'object'
      ? adjustHero.state.error
      : typeof adjustFocus.state === 'object'
        ? adjustFocus.state.error
        : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <PipResource
          label="Hero Points"
          value={heroPoints.value}
          max={heroPoints.max}
          colorOn="border-rose-400 bg-rose-500"
          data-stat="hero-points"
          onAdjust={(delta) => void adjustHero.trigger(delta)}
          pending={adjustHero.state === 'pending'}
        />
        {focus.max > 0 && (
          <PipResource
            label="Focus"
            value={focus.value}
            max={focus.max}
            colorOn="border-indigo-400 bg-indigo-500"
            title={`Cap ${focus.cap.toString()}`}
            data-stat="focus"
            onAdjust={(delta) => void adjustFocus.trigger(delta)}
            pending={adjustFocus.state === 'pending'}
          />
        )}
        {mythicPoints.max > 0 && (
          <PipResource
            label="Mythic"
            value={mythicPoints.value}
            max={mythicPoints.max}
            colorOn="border-amber-400 bg-amber-500"
            data-stat="mythic-points"
          />
        )}
        {investiture.max > 0 && (
          <CountResource label="Invested" value={investiture.value} max={investiture.max} data-stat="investiture" />
        )}
      </div>
      {error !== null && (
        <p className="text-[11px] text-red-700" data-role="resources-error">
          {error}
        </p>
      )}
    </div>
  );
}

function PipResource({
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
   *  ±1. Omit to keep the resource read-only. */
  onAdjust?: (delta: number) => void;
  pending?: boolean;
  'data-stat'?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" title={title} {...rest}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      {onAdjust !== undefined && (
        <StepButton label="−" disabled={pending ?? false} onClick={() => onAdjust(-1)} />
      )}
      <div className="flex gap-1" aria-label={`${value.toString()} of ${max.toString()}`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[
              'inline-block h-3 w-3 rounded-full border',
              i < value ? colorOn : 'border-neutral-300 bg-white',
            ].join(' ')}
          />
        ))}
      </div>
      {onAdjust !== undefined && (
        <StepButton label="+" disabled={pending ?? false} onClick={() => onAdjust(1)} />
      )}
      <span className="font-mono text-xs tabular-nums text-neutral-500">
        {value}/{max}
      </span>
    </div>
  );
}

function CountResource({
  label,
  value,
  max,
  ...rest
}: {
  label: string;
  value: number;
  max: number;
  'data-stat'?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" {...rest}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="font-mono text-sm tabular-nums text-neutral-900">
        {value}
        <span className="text-neutral-400">/{max}</span>
      </span>
    </div>
  );
}

function ShieldTile({ shield }: { shield: Shield }): React.ReactElement {
  const name = t(shield.name);
  return (
    <div
      className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2"
      data-stat="shield"
      title={`Hardness ${shield.hardness.toString()} · Broken Threshold ${shield.brokenThreshold.toString()}`}
    >
      {shield.icon && (
        <img src={shield.icon} alt="" className="h-8 w-8 shrink-0 rounded border border-neutral-200 bg-neutral-50" />
      )}
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-neutral-900">{name}</span>
        <span className="text-xs text-neutral-600">
          <span className="font-semibold">+{shield.ac}</span> AC
        </span>
        <span className="text-xs text-neutral-600">
          HP{' '}
          <span className="font-mono tabular-nums">
            {shield.hp.value}/{shield.hp.max}
          </span>
        </span>
        <span className="text-xs text-neutral-600">
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
}: {
  dying: CharacterSystem['attributes']['dying'];
  wounded: CharacterSystem['attributes']['wounded'];
  doomed: CharacterSystem['attributes']['doomed'];
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-section="conditions">
      <Condition
        label="Dying"
        value={dying.value}
        max={dying.max}
        colorOn="border-red-500 bg-red-600"
        title={`Recovery DC ${dying.recoveryDC.toString()}`}
        data-stat="dying"
      />
      <Condition
        label="Wounded"
        value={wounded.value}
        max={wounded.max}
        colorOn="border-amber-500 bg-amber-600"
        data-stat="wounded"
      />
      <Condition
        label="Doomed"
        value={doomed.value}
        max={doomed.max}
        colorOn="border-violet-500 bg-violet-700"
        data-stat="doomed"
      />
    </div>
  );
}

function Condition({
  label,
  value,
  max,
  colorOn,
  title,
  ...rest
}: {
  label: string;
  value: number;
  max: number;
  colorOn: string;
  title?: string;
  'data-stat'?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" title={title} {...rest}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      <div className="flex gap-1" aria-label={`${value.toString()} of ${max.toString()}`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[
              'inline-block h-2.5 w-2.5 rounded-sm border',
              i < value ? colorOn : 'border-neutral-300 bg-white',
            ].join(' ')}
          />
        ))}
      </div>
      <span className="font-mono text-xs tabular-nums text-neutral-500">
        {value}/{max}
      </span>
    </div>
  );
}

const SPEED_LABELS: Record<string, string> = {
  land: 'Land',
  burrow: 'Burrow',
  climb: 'Climb',
  fly: 'Fly',
  swim: 'Swim',
  travel: 'Travel',
};

function populatedSpeeds(speeds: CharacterSystem['movement']['speeds']): Array<{ key: string; speed: Speed }> {
  const order: (keyof CharacterSystem['movement']['speeds'])[] = ['land', 'burrow', 'climb', 'fly', 'swim', 'travel'];
  const out: Array<{ key: string; speed: Speed }> = [];
  for (const key of order) {
    const s = speeds[key];
    if (s) out.push({ key, speed: s });
  }
  return out;
}

function SpeedList({ speeds }: { speeds: Array<{ key: string; speed: Speed }> }): React.ReactElement {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5" data-section="speeds">
      {speeds.map(({ key, speed }, idx) => (
        <span key={key} className="inline-flex items-center gap-1" data-speed={key} title={speed.breakdown}>
          <span className="tabular-nums">{speed.value} ft</span>
          <span className="text-xs text-neutral-500">{SPEED_LABELS[key] ?? humaniseSlug(key)}</span>
          {idx < speeds.length - 1 && <span className="text-neutral-300">·</span>}
        </span>
      ))}
    </span>
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
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      {entries.map((e, i) => (
        <span
          key={`${e.type}-${i.toString()}`}
          className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-700"
          title={e.exceptions?.length ? `except ${e.exceptions.join(', ')}` : undefined}
        >
          {humaniseSlug(e.type)}
          {e.value !== undefined ? ` ${e.value.toString()}` : ''}
        </span>
      ))}
    </div>
  );
}

function MetaRow({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{children}</div>;
}

function XPBar({ value, max, pct }: { value: number; max: number; pct: number }): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="flex items-center gap-2" data-stat="xp">
      <span className="font-mono tabular-nums text-neutral-900">
        {value} / {max}
      </span>
      <span
        className="inline-block h-1.5 w-16 overflow-hidden rounded bg-neutral-200"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        title={`${clamped.toString()}% to next level`}
      >
        <span className="block h-full bg-pf-secondary" style={{ width: `${clamped.toString()}%` }} />
      </span>
    </span>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</span>
      <span className="text-pf-text">{children}</span>
    </div>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div data-section={label.toLowerCase()}>
      <SectionHeader>{label}</SectionHeader>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <li
            key={it}
            className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-2.5 py-0.5 text-xs text-pf-alt-dark"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LongRestButton({ actorId, onRested }: { actorId: string; onRested: () => void }): React.ReactElement {
  const { state, trigger } = useActorAction({
    run: () => api.longRest(actorId),
    confirm: 'Rest for the night? This restores HP, refreshes resources, and advances in-world time.',
    onSuccess: onRested,
  });
  const isError = typeof state === 'object';

  return (
    <div className="flex flex-col items-end gap-1" data-action="long-rest">
      <button
        type="button"
        onClick={() => void trigger()}
        disabled={state === 'pending'}
        className="rounded border border-pf-tertiary-dark bg-pf-tertiary px-3 py-1.5 text-sm font-semibold text-pf-alt-dark hover:bg-pf-tertiary-dark hover:text-white disabled:opacity-50"
      >
        {state === 'pending' ? 'Resting…' : 'Long Rest'}
      </button>
      {isError && <span className="text-xs text-red-700">{state.error}</span>}
    </div>
  );
}

function humaniseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function humaniseSize(size: string): string {
  const map: Record<string, string> = {
    tiny: 'Tiny',
    sm: 'Small',
    med: 'Medium',
    lg: 'Large',
    huge: 'Huge',
    grg: 'Gargantuan',
  };
  return map[size] ?? humaniseSlug(size);
}
