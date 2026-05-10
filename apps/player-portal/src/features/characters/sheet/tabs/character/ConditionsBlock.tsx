import { api } from '@/features/characters/api';
import type { CharacterSystem, Shield } from '@/features/characters/types';
import { t } from '@/shared/i18n/t';
import { useActorAction } from '@/features/characters/sheet/hooks/useActorAction';

export function ConditionsRow({
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

export function ShieldTile({ shield }: { shield: Shield }): React.ReactElement {
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
