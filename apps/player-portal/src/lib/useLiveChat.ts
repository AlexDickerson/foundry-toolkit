// Subscribe to the filtered chat SSE stream for a single actor and
// maintain the message list across create/update/delete events. Fetches
// a backfill snapshot on mount then applies incremental SSE deltas.
//
// The server-side ring buffer keeps the last 200 messages; backfill
// returns up to 50 of them filtered for this actor. The SSE stream
// delivers new events as they arrive, also filtered.
//
// On re-mount (tab switch back), the backfill re-fetch restores history
// automatically. There is a small gap between the SSE connect and the
// backfill response; overlap is deduplicated by message id.

import { useEffect, useState } from 'react';
import { chatMessageSnapshotSchema, type ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

export interface LiveChatState {
  messages: ChatMessageSnapshot[];
  /** 'loading' until the first backfill or SSE open. */
  status: 'loading' | 'connected' | 'disconnected';
  /** True when the ring buffer held more messages than were returned. */
  truncated: boolean;
}

interface ChatSseEnvelope {
  eventType: string;
  data: unknown;
}

function buildStreamUrl(actorId: string, userId: string | null): string {
  const qs = userId !== null ? `?userId=${encodeURIComponent(userId)}` : '';
  return `/api/live/chat/${actorId}/stream${qs}`;
}

function buildRecentUrl(actorId: string, userId: string | null): string {
  const qs = userId !== null ? `?userId=${encodeURIComponent(userId)}` : '';
  return `/api/mcp/live/chat/${actorId}/recent${qs}`;
}

/**
 * Subscribe to the filtered chat stream for `actorId`.
 *
 * `userId` is optional — pass the player's Foundry user ID to include
 * whispers directed at them. Omit to see only public and actor-spoken
 * messages (the v1 default while the portal has no identity mechanism).
 */
export function useLiveChat(actorId: string, userId?: string | null): LiveChatState {
  const effectiveUserId = userId ?? null;
  const [state, setState] = useState<LiveChatState>({
    messages: [],
    status: 'loading',
    truncated: false,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ messages: [], status: 'loading', truncated: false });

    const streamUrl = buildStreamUrl(actorId, effectiveUserId);
    const recentUrl = buildRecentUrl(actorId, effectiveUserId);

    // Open SSE before fetching backfill so we don't miss events that
    // arrive while the backfill request is in flight.
    const es = new EventSource(streamUrl);

    es.onopen = (): void => {
      if (!cancelled) setState((s) => ({ ...s, status: 'connected' }));
    };

    es.onmessage = (ev): void => {
      if (cancelled) return;
      try {
        const envelope = JSON.parse(ev.data as string) as ChatSseEnvelope;
        const { eventType, data } = envelope;

        if (eventType === 'create') {
          const result = chatMessageSnapshotSchema.safeParse(data);
          if (!result.success) return;
          const msg = result.data;
          setState((s) => {
            if (s.messages.some((m) => m.id === msg.id)) return s; // dedupe backfill overlap
            return { ...s, messages: [...s.messages, msg] };
          });
        } else if (eventType === 'update') {
          const result = chatMessageSnapshotSchema.safeParse(data);
          if (!result.success) return;
          const msg = result.data;
          setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) }));
        } else if (eventType === 'delete') {
          const id = (data as Record<string, unknown> | null)?.['id'];
          if (typeof id !== 'string') return;
          setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }));
        }
      } catch (err) {
        console.warn('player-portal | live-chat: failed to parse SSE event', err);
      }
    };

    es.onerror = (): void => {
      if (!cancelled && es.readyState !== EventSource.CLOSED) {
        setState((s) => ({ ...s, status: 'disconnected' }));
      }
    };

    // Backfill: best-effort. Silently skipped when foundry-mcp is
    // unreachable or the route 404s (mock mode). The SSE stream will
    // populate messages incrementally regardless.
    fetch(recentUrl)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ messages: ChatMessageSnapshot[]; truncated: boolean }>) : null,
      )
      .then((data) => {
        if (cancelled || data === null) return;
        setState((s) => ({
          ...s,
          truncated: data.truncated,
          // Merge: backfill is the authoritative history; preserve any SSE
          // messages that arrived since mount and aren't in the backfill.
          messages: [
            ...data.messages,
            ...s.messages.filter((m) => !data.messages.some((bm) => bm.id === m.id)),
          ],
        }));
      })
      .catch(() => {
        // Mock mode or unreachable — leave state as-is.
      });

    return (): void => {
      cancelled = true;
      es.close();
    };
  }, [actorId, effectiveUserId]);

  return state;
}
