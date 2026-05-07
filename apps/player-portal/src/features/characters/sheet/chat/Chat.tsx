import { useState } from 'react';
import { useLiveChat } from '@/features/characters/sheet/hooks/useLiveChat';
import { MessageBubble } from '@/features/characters/sheet/chat/MessageBubble';

type SortOrder = 'desc' | 'asc';

const SORT_KEY = 'chat-feed:sort-order';
const DEFAULT_ORDER: SortOrder = 'desc';

function readStoredOrder(): SortOrder {
  if (typeof window === 'undefined') return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(SORT_KEY);
    return raw === 'asc' || raw === 'desc' ? raw : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

interface Props {
  actorId: string;
}

export function Chat({ actorId }: Props): React.ReactElement {
  const { messages, status, truncated } = useLiveChat(actorId);
  const [sortOrder, setSortOrder] = useState<SortOrder>(readStoredOrder);

  const toggleSort = (): void => {
    const next: SortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    setSortOrder(next);
    try {
      window.localStorage.setItem(SORT_KEY, next);
    } catch {
      // ignore — non-persistent fallback works for the session
    }
  };

  const sorted = sortOrder === 'desc' ? [...messages].reverse() : messages;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header row: "Chat" label (left) + sort toggle (right) */}
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-pf-alt-dark">Chat</p>
        <button
          type="button"
          onClick={toggleSort}
          title={
            sortOrder === 'desc'
              ? 'Showing newest first — click for oldest first'
              : 'Showing oldest first — click for newest first'
          }
          className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-pf-alt-dark transition-colors hover:bg-pf-bg-dark hover:text-pf-text"
        >
          <SortIcon order={sortOrder} />
          {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {/* Scrollable messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {truncated && (
            <p className="text-center text-xs text-pf-alt-dark">Showing recent messages only.</p>
          )}

          {messages.length === 0 && status !== 'loading' && (
            <p className="py-8 text-center text-sm text-pf-alt-dark">No messages yet.</p>
          )}

          {messages.length === 0 && status === 'loading' && (
            <p className="py-8 text-center text-sm text-pf-alt-dark">Connecting…</p>
          )}

          {sorted.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {status === 'disconnected' && (
            <p className="text-center text-xs text-amber-600">Reconnecting to chat stream…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SortIcon({ order }: { order: SortOrder }): React.ReactElement {
  // Arrow pointing down = newest first (desc); up = oldest first (asc).
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: order === 'asc' ? 'rotate(180deg)' : undefined }}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
