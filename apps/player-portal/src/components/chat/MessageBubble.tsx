import type { ChatMessageSnapshot, ChatRoll } from '@foundry-toolkit/shared/rpc';

// Foundry ChatMessage type constants. We only distinguish roll vs. OOC
// vs. IC for styling; everything else renders as plain content.
const MSG_OOC = 1;

function formatTime(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RollResult({ roll }: { roll: ChatRoll }): React.ReactElement {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="font-mono text-xs text-pf-alt-dark">{roll.formula}</span>
      <span
        className={[
          'text-lg font-bold tabular-nums',
          roll.isCritical ? 'text-green-600' : roll.isFumble ? 'text-red-500' : 'text-pf-primary',
        ].join(' ')}
      >
        {roll.total}
      </span>
      {roll.isCritical && (
        <span className="rounded bg-green-100 px-1 py-0.5 text-xs font-medium text-green-700">Critical!</span>
      )}
      {roll.isFumble && (
        <span className="rounded bg-red-100 px-1 py-0.5 text-xs font-medium text-red-700">Fumble</span>
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
  const time = formatTime(message.timestamp);

  // IC: show character alias; OOC or roll with no alias: fall back to author name.
  const speakerLabel = message.speaker?.alias ?? message.author?.name ?? null;

  return (
    <div
      className={[
        'rounded border p-2 text-sm',
        isWhisper
          ? 'border-pf-alt/40 bg-pf-alt/5'
          : isOoc
            ? 'border-pf-border bg-pf-bg'
            : 'border-pf-border bg-pf-bg-dark',
      ].join(' ')}
    >
      {/* Header row: speaker · badges · timestamp */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {speakerLabel !== null && (
          <span className={`font-medium ${isOoc ? 'text-pf-alt-dark' : 'text-pf-primary'}`}>{speakerLabel}</span>
        )}
        {isWhisper && (
          <span className="rounded bg-pf-alt px-1 py-0.5 text-xs text-white">Whisper</span>
        )}
        {message.isRoll && (
          <span className="rounded border border-pf-border bg-pf-bg px-1 py-0.5 text-xs text-pf-alt-dark">
            Roll
          </span>
        )}
        {time !== null && (
          <span className="ml-auto text-xs tabular-nums text-pf-alt-dark">{time}</span>
        )}
      </div>

      {/* Roll flavor (e.g. "Perception Check") */}
      {message.isRoll && message.flavor.length > 0 && (
        <div
          className="mb-1 text-xs text-pf-alt-dark"
          dangerouslySetInnerHTML={{ __html: message.flavor }}
        />
      )}

      {/* Roll result summary */}
      {message.isRoll && message.rolls[0] !== undefined && (
        <RollResult roll={message.rolls[0]} />
      )}

      {/* Message content (HTML from Foundry — trusted source) */}
      {message.content.length > 0 && (
        <div
          className="prose-sm max-w-none text-pf-text [&_a]:text-pf-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      )}
    </div>
  );
}
