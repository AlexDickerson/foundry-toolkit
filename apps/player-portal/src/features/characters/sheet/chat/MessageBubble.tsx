import type { ChatMessageSnapshot, ChatRoll } from '@foundry-toolkit/shared/rpc';

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

interface Props {
  message: ChatMessageSnapshot;
}

export function MessageBubble({ message }: Props): React.ReactElement {
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
        {isRoll && (
          <span className="rounded border border-pf-border/60 bg-pf-bg px-1 py-0.5 text-[10px] text-pf-alt-dark">
            Roll
          </span>
        )}
        {time !== null && (
          <span className="ml-auto text-[10px] tabular-nums text-pf-alt-dark/70">{time}</span>
        )}
      </div>

      {/* Card body */}
      <div className="space-y-1 px-2 py-1.5">
        {/* Roll flavor (e.g. "Perception Check") */}
        {isRoll && message.flavor.length > 0 && (
          <div
            className="text-[11px] italic text-pf-alt-dark [&_img]:!max-h-3.5 [&_img]:!w-auto [&_img]:inline-block [&_img]:align-middle"
            dangerouslySetInnerHTML={{ __html: message.flavor }}
          />
        )}

        {/* Roll result summary */}
        {isRoll && message.rolls[0] !== undefined && <RollResult roll={message.rolls[0]} />}

        {/* Message content (PF2e-rendered HTML — trusted source).
            PF2e action chips (<button> elements) have no live handlers in the portal;
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
      </div>
    </div>
  );
}
