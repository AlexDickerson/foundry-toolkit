import { useEffect, useRef } from 'react';

// Subscribe to a foundry-mcp SSE channel while mounted. The server
// opens the corresponding Foundry Hook registration on the 0→1
// subscriber transition and tears it down when the last client leaves,
// so an unmounted hook costs nothing on the Foundry side.
//
// EventSource auto-reconnects on transient drops; the server owns
// re-subscription to Foundry hooks after reconnect so consumers don't
// need to rewire. Messages that fail to parse are logged and dropped —
// a stream with a bad payload shouldn't take down the subscription.
//
// `onMessage` is read through a ref so callers can pass an inline
// closure without thrashing the subscription on every render. The
// effect only depends on `channel`; switching channels drops the old
// EventSource and opens a new one.
export function useEventChannel<T>(channel: string, onMessage: (data: T) => void): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const es = new EventSource(`/api/mcp/events/${channel}/stream`);

    es.onmessage = (ev): void => {
      try {
        const data = JSON.parse(ev.data as string) as T;
        handlerRef.current(data);
      } catch (err) {
        console.warn(`Failed to parse SSE payload on "${channel}"`, err);
      }
    };

    es.onerror = (): void => {
      // EventSource auto-reconnects; the server pushes a fresh
      // `set-event-subscription {active: true}` on Foundry reconnect
      // so hooks reattach without consumer action.
    };

    return (): void => {
      es.close();
    };
  }, [channel]);
}
