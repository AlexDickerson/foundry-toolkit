import type { ChatMessageSnapshot, ChatRoll, ChatStructuredData } from '@foundry-toolkit/shared/rpc';
import { ChipRow } from './ChipRow';
import { DamageBreakdown } from './DamageBreakdown';
import { TargetTable } from './TargetTable';

// Foundry ChatMessage type constants.
const MSG_OOC = 1;
// Type 5 = emote in Foundry v14.
const MSG_EMOTE = 5;

function formatTime(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RollResult({ roll }: { roll: ChatRoll }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="font-mono text-[11px] text-pf-alt-dark">{roll.formula}</span>
      <span className="text-pf-border">→</span>
      <span
        className={[
          'text-base font-bold tabular-nums leading-none',
          roll.isCritical ? 'text-green-600' : roll.isFumble ? 'text-red-500' : 'text-pf-primary',
        ].join(' ')}
      >
        {roll.total}
      </span>
      {roll.isCritical && (
        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
          Crit
        </span>
      )}
      {roll.isFumble && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Fumble
        </span>
      )}
    </div>
  );
}

// Maps structured kind to the badge label shown in the card header.
function kindBadgeLabel(kind: ChatStructuredData['kind']): string | null {
  switch (kind) {
    case 'strike-attack':
      return 'Attack';
    case 'damage':
      return 'Damage';
    case 'skill-check':
      return 'Check';
    case 'saving-throw':
      return 'Save';
    case 'spell-cast':
    case 'raw':
      return null;
  }
}

interface StructuredBodyProps {
  message: ChatMessageSnapshot;
  structured: Exclude<ChatStructuredData, { kind: 'raw' }>;
}

function StructuredBody({ message, structured }: StructuredBodyProps): React.ReactElement {
  const firstRoll = message.rolls[0];

  switch (structured.kind) {
    case 'strike-attack':
      return (
        <>
          {structured.flavor.length > 0 && (
            <p className="text-[11px] italic text-pf-alt-dark">{structured.flavor}</p>
          )}
          {firstRoll !== undefined && <RollResult roll={firstRoll} />}
          <TargetTable targets={structured.targets} />
          <ChipRow chips={structured.chips} />
        </>
      );

    case 'damage':
      return (
        <>
          {structured.flavor.length > 0 && (
            <p className="text-[11px] italic text-pf-alt-dark">{structured.flavor}</p>
          )}
          <DamageBreakdown parts={structured.parts} total={structured.total} />
          <ChipRow chips={structured.chips} />
        </>
      );

    case 'skill-check':
    case 'saving-throw':
      return (
        <>
          {structured.flavor.length > 0 && (
            <p className="text-[11px] italic text-pf-alt-dark">{structured.flavor}</p>
          )}
          {firstRoll !== undefined && <RollResult roll={firstRoll} />}
          {structured.dc !== undefined && (
            <p className="text-[10px] text-pf-alt-dark/70">DC {structured.dc}</p>
          )}
          {structured.outcome !== undefined && (
            <OutcomeBadge outcome={structured.outcome} />
          )}
        </>
      );

    case 'spell-cast':
      return (
        <>
          {structured.flavor.length > 0 && (
            <p className="text-[11px] italic text-pf-alt-dark">{structured.flavor}</p>
          )}
          {structured.description.length > 0 && (
            <div
              className="prose-sm max-w-none text-pf-text [&_a]:text-pf-primary [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: structured.description }}
            />
          )}
          <ChipRow chips={structured.chips} />
        </>
      );
  }
}

type OutcomeValue = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure';

const OUTCOME_LABEL: Record<OutcomeValue, string> = {
  criticalSuccess: 'Crit Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Crit Fail',
};

const OUTCOME_CLASS: Record<OutcomeValue, string> = {
  criticalSuccess: 'bg-green-100 text-green-700',
  success: 'bg-blue-100 text-blue-700',
  failure: 'bg-red-100 text-red-600',
  criticalFailure: 'bg-red-200 text-red-800',
};

function OutcomeBadge({ outcome }: { outcome: OutcomeValue }): React.ReactElement {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${OUTCOME_CLASS[outcome]}`}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

interface Props {
  message: ChatMessageSnapshot;
}

export function MessageBubble({ message }: Props): React.ReactElement {
  const { structured } = message;
  const isWhisper = message.whisper.length > 0;
  const isOoc = message.type === MSG_OOC;
  const isEmote = message.type === MSG_EMOTE;
  const isRoll = message.isRoll;
  const time = formatTime(message.timestamp);

  // IC: show character alias; OOC or roll with no alias: fall back to author.
  const speakerLabel = message.speaker?.alias ?? message.author?.name ?? null;

  const cardClass = [
    'rounded border text-sm',
    isRoll
      ? 'border-pf-border/70 bg-pf-bg-dark border-l-2 border-l-pf-primary/60'
      : isWhisper
        ? 'border-pf-alt/40 bg-pf-alt/5'
        : isOoc
          ? 'border-pf-border/50 bg-pf-bg'
          : isEmote
            ? 'border-pf-border/40 bg-pf-bg/50 italic'
            : 'border-pf-border bg-pf-bg-dark',
  ].join(' ');

  const structuredBadge =
    structured !== undefined && structured.kind !== 'raw' ? kindBadgeLabel(structured.kind) : null;

  return (
    <div className={cardClass}>
      {/* Header: speaker · badges · timestamp */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-pf-border/30 px-2 py-1.5">
        {speakerLabel !== null && (
          <span
            className={`text-[11px] font-semibold leading-none ${isOoc ? 'text-pf-alt-dark' : 'text-pf-primary'}`}
          >
            {speakerLabel}
          </span>
        )}
        {isWhisper && (
          <span className="rounded bg-pf-alt px-1 py-0.5 text-[10px] font-medium text-white">
            Whisper
          </span>
        )}
        {/* Prefer structured kind badge; fall back to generic Roll badge */}
        {structuredBadge !== null ? (
          <span className="rounded border border-pf-border/60 bg-pf-bg px-1 py-0.5 text-[10px] text-pf-alt-dark">
            {structuredBadge}
          </span>
        ) : (
          isRoll && (
            <span className="rounded border border-pf-border/60 bg-pf-bg px-1 py-0.5 text-[10px] text-pf-alt-dark">
              Roll
            </span>
          )
        )}
        {time !== null && (
          <span className="ml-auto text-[10px] tabular-nums text-pf-alt-dark/70">{time}</span>
        )}
      </div>

      {/* Card body */}
      <div className="space-y-1 px-2 py-1.5">
        {structured !== undefined && structured.kind !== 'raw' ? (
          <StructuredBody message={message} structured={structured} />
        ) : (
          <>
            {/* Roll flavor for unstructured roll messages */}
            {isRoll && message.flavor.length > 0 && (
              <div
                className="text-[11px] italic text-pf-alt-dark [&_img]:!max-h-3.5 [&_img]:!w-auto [&_img]:inline-block [&_img]:align-middle"
                dangerouslySetInnerHTML={{ __html: message.flavor }}
              />
            )}
            {/* Roll result for unstructured roll messages */}
            {isRoll && message.rolls[0] !== undefined && (
              <RollResult roll={message.rolls[0]} />
            )}
            {/* Full PF2e-rendered HTML — trusted source.
                PF2e action chips (<button>) have no live handlers in the portal;
                pointer-events-none prevents accidental interaction. */}
            {message.content.length > 0 && (
              <div
                className={[
                  'prose-sm max-w-none text-pf-text',
                  '[&_a]:text-pf-primary [&_a]:underline',
                  '[&_img]:!max-h-5 [&_img]:!w-auto [&_img]:inline-block [&_img]:align-middle',
                  '[&_button]:cursor-not-allowed [&_button]:opacity-50 [&_button]:select-none [&_button]:pointer-events-none',
                ].join(' ')}
                dangerouslySetInnerHTML={{ __html: message.content }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
