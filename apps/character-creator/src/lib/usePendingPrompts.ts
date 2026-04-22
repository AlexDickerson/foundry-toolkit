import { useEffect, useState } from 'react';

// Module-initiated prompts surfaced via SSE. Mirrors the
// `PromptRequestPayload` type on the module side — kept as a plain
// structural type here rather than imported so the frontend has no
// module-package dep.
export interface PendingPromptPayload {
  title: string;
  prompt: string;
  item: { name: string | null; img: string | null; uuid: string | null };
  allowNoSelection: boolean;
  choices: Array<{
    value: unknown;
    label: string;
    img: string | null;
    group: string | null;
  }>;
}

export interface PendingPrompt {
  bridgeId: string;
  type: string;
  payload: PendingPromptPayload;
  createdAt: number;
}

interface SseMessage {
  kind: 'added' | 'removed';
  event: PendingPrompt;
}

// Subscribe to the server's prompt stream while mounted. Returns the
// queue of pending prompts (in insertion order); the parent picks one
// to render. We keep this as a pull-only hook — the server sends a
// full replay of in-flight prompts on connect, so a late subscriber
// doesn't miss anything.
export function usePendingPrompts(): PendingPrompt[] {
  const [prompts, setPrompts] = useState<PendingPrompt[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/prompts/stream');

    es.onmessage = (ev): void => {
      try {
        const msg = JSON.parse(ev.data as string) as SseMessage;
        setPrompts((prev) => {
          if (msg.kind === 'added') {
            if (prev.some((p) => p.bridgeId === msg.event.bridgeId)) return prev;
            return [...prev, msg.event];
          }
          // Only other SseMessage kind is 'removed'.
          return prev.filter((p) => p.bridgeId !== msg.event.bridgeId);
        });
      } catch (err) {
        console.warn('Failed to parse prompt SSE chunk', err);
      }
    };

    es.onerror = (): void => {
      // EventSource auto-reconnects; the server replays on reconnect.
      // Nothing to do here beyond silencing the uncaught-event noise.
    };

    return (): void => {
      es.close();
    };
  }, []);

  return prompts;
}
