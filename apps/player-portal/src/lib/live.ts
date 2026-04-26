// Thin SSE client for subscribing to foundry-mcp live-state streams.
// Replaces the former WebSocket client — EventSource is simpler (plain HTTP,
// not a custom protocol), auto-reconnects natively, and routes through the
// existing /api/mcp/* proxy rather than requiring separate WS upgrade paths.

import { useEffect, useState } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface LiveState<T> {
  data: T | null;
  status: ConnectionStatus;
  /** Last time we received data (for "stale" indicators). */
  lastUpdated: number | null;
}

/** Subscribe to a foundry-mcp SSE stream.
 *
 *  `path` is a same-origin URL path (e.g. "/api/mcp/live/inventory/stream").
 *  EventSource handles reconnection natively; `status` reflects the current
 *  connection state and `data` always holds the last-received snapshot.
 */
export function useLiveStream<T>(path: string, overrideUrl?: string): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({
    data: null,
    status: 'connecting',
    lastUpdated: null,
  });

  useEffect(() => {
    const url = overrideUrl ?? path;
    const es = new EventSource(url);

    es.onopen = (): void => {
      setState((s) => ({ ...s, status: 'connected' }));
    };

    es.onmessage = (event): void => {
      try {
        const parsed = JSON.parse(event.data as string) as T;
        setState({ data: parsed, status: 'connected', lastUpdated: Date.now() });
      } catch (err) {
        console.error('live-stream: failed to parse message', err);
      }
    };

    es.onerror = (): void => {
      // EventSource auto-reconnects; mark disconnected so the UI can show a
      // stale indicator. onopen fires again once the reconnect succeeds.
      if (es.readyState !== EventSource.CLOSED) {
        setState((s) => ({ ...s, status: 'disconnected' }));
      }
    };

    return (): void => {
      es.close();
    };
  }, [path, overrideUrl]);

  return state;
}
