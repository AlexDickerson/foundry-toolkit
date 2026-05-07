import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import { api } from '@/features/characters/api';
import type { CharacterSystem, Save } from '@/features/characters/types';
import { t } from '@/shared/i18n/t';
import { formatSignedInt } from '@/shared/lib/format';
import { useActorAction } from '@/features/characters/sheet/hooks/useActorAction';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { firstError, primarySpeed } from './helpers';

export function StatsBlock({
  system,
  actorId,
}: {
  system: CharacterSystem;
  actorId: string;
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
  const error = firstError(rollPerception.state, rollFortitude.state, rollReflex.state, rollWill.state);

  return (
    <div>
      <SectionHeader band>Key Stats</SectionHeader>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="AC" value={ac.value.toString()} title={ac.breakdown} />
        <HpTile hp={hp} />
        <StatTile
          label="Perception"
          value={formatSignedInt(perception.value)}
          title={perception.breakdown}
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

function HpTile({ hp }: { hp: CharacterSystem['attributes']['hp'] }): React.ReactElement {
  const value = hp.temp > 0 ? `${hp.value.toString()} (+${hp.temp.toString()})` : `${hp.value.toString()} / ${hp.max.toString()}`;
  return (
    <div
      className="flex flex-col items-center rounded border border-pf-border bg-pf-bg px-2 py-2 shadow-sm"
      title={hp.breakdown}
      data-stat="hp"
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">HP</span>
      <span className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-pf-text">{value}</span>
    </div>
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
  onRoll,
  pending,
  ...rest
}: {
  label: string;
  value: string;
  title?: string;
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
