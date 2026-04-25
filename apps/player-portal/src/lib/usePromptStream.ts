// Subscribe to the /api/prompts/stream SSE feed and maintain a map of
// pending bridge prompts that the player needs to resolve. Both the legacy
// `prompt-request` (ChoiceSet / PickAThingPrompt) and the new
// `dialog-request` (generic Foundry Dialog) event kinds ride this stream.
//
// The hook is intentionally stateful — it tracks in-flight prompts across
// reconnects. The server flushes the current queue as `added` events on
// every fresh SSE connection, so a reconnect re-delivers any prompts the
// frontend hadn't yet resolved.

import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

/** One pending bridge event waiting for player action. */
export interface PendingPrompt {
  bridgeId: string;
  /**
   * Bridge event kind. Known values are `BRIDGE_EVENT_PROMPT_REQUEST` and
   * `BRIDGE_EVENT_DIALOG_REQUEST` from `@foundry-toolkit/shared/rpc`.
   * Typed as `string` so future event kinds arrive without breaking the hook.
   */
  type: string;
  /** Raw payload from the bridge — shape depends on `type`. */
  payload: unknown;
  /** Server-side creation timestamp (ms since epoch). */
  createdAt: number;
}

/** SSE envelope shape pushed by foundry-mcp's /api/prompts/stream. */
interface PromptStreamEvent {
  kind: 'added' | 'removed';
  event: {
    bridgeId: string;
    type: string;
    payload: unknown;
    createdAt: number;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

const PROMPT_STREAM_PATH = '/api/mcp/prompts/stream';

/**
 * Subscribe to the prompt SSE stream and return the current list of
 * pending bridge prompts in arrival order (oldest first).
 *
 * The list is reset on reconnect and rebuilt from the server's in-flight
 * queue, so no prompts are permanently lost through a transient disconnect.
 */
export function usePromptStream(): PendingPrompt[] {
  const [prompts, setPrompts] = useState<PendingPrompt[]>([]);
  // Stable ref so the EventSource message handler doesn't close over stale
  // state when React batches renders.
  const promptsRef = useRef<PendingPrompt[]>([]);

  useEffect(() => {
    // Reset the ref so subsequent events rebuild the list from scratch.
    // The server re-sends the full pending queue as `added` events on every
    // new EventSource connection, so we don't need to carry over stale state.
    // State itself starts as [] on initial mount (useState initialiser); on
    // reconnect the first batch of `added` events overwrite whatever was shown.
    promptsRef.current = [];

    const es = new EventSource(PROMPT_STREAM_PATH);

    es.onmessage = (ev): void => {
      try {
        const msg = JSON.parse(ev.data as string) as PromptStreamEvent;
        if (msg.kind === 'added') {
          const next: PendingPrompt = {
            bridgeId: msg.event.bridgeId,
            type: msg.event.type,
            payload: msg.event.payload,
            createdAt: msg.event.createdAt,
          };
          promptsRef.current = [...promptsRef.current, next];
          setPrompts(promptsRef.current);
          console.info(
            `player-portal | prompt-stream: added ${msg.event.type} [${msg.event.bridgeId.slice(0, 8)}]`,
          );
        } else {
          // kind === 'removed'
          const removed = msg.event.bridgeId;
          promptsRef.current = promptsRef.current.filter((p) => p.bridgeId !== removed);
          setPrompts(promptsRef.current);
          console.info(
            `player-portal | prompt-stream: removed [${removed.slice(0, 8)}]`,
          );
        }
      } catch (err) {
        console.warn('player-portal | prompt-stream: failed to parse SSE event', err);
      }
    };

    es.onerror = (): void => {
      // EventSource auto-reconnects; server re-sends the pending queue on
      // reconnect so we'll be back in sync quickly.
      console.warn('player-portal | prompt-stream: SSE connection error — will auto-reconnect');
    };

    return (): void => {
      es.close();
    };
  }, []);

  return prompts;
}
