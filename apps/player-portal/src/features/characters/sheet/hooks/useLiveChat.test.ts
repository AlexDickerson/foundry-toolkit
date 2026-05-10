import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLiveChat } from './useLiveChat';
import type { ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

// ─── EventSource mock ─────────────────────────────────────────────────────────

type EventListener = (ev: { data: string }) => void;

interface MockEventSource {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: EventListener | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  _fire: (data: string) => void;
  _open: () => void;
  _error: () => void;
}

let capturedSources: MockEventSource[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockEventSourceClass = vi.fn(function MockEventSource(this: any, url: string) {
  this.url = url;
  this.readyState = 0; // CONNECTING
  this.onopen = null;
  this.onmessage = null;
  this.onerror = null;
  this.close = vi.fn(() => {
    this.readyState = 2; // CLOSED
  });
  this._fire = function (data: string) {
    if (this.onmessage) this.onmessage({ data });
  };
  this._open = function () {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  };
  this._error = function () {
    if (this.onerror) this.onerror();
  };
  capturedSources.push(this as MockEventSource);
});

// Assign static constants so EventSource.OPEN / CLOSED checks work.
Object.assign(MockEventSourceClass, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });

// ─── Fetch mock helpers ────────────────────────────────────────────────────────

function makeEmptyBackfill() {
  return { messages: [], truncated: false };
}

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      }),
    ),
  );
}

function mockFetchFail() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false })),
  );
}

// ─── Minimal valid ChatMessageSnapshot ────────────────────────────────────────

function makeMsg(id: string, overrides: Partial<ChatMessageSnapshot> = {}): ChatMessageSnapshot {
  return {
    id,
    uuid: null,
    type: null,
    author: null,
    timestamp: null,
    flavor: '',
    content: 'Hello',
    speaker: null,
    speakerOwnerIds: [],
    whisper: [],
    isRoll: false,
    rolls: [],
    flags: {},
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  capturedSources = [];
  MockEventSourceClass.mockClear();
  vi.stubGlobal('EventSource', MockEventSourceClass);
  mockFetchOk(makeEmptyBackfill());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useLiveChat', () => {
  it('starts in loading status', () => {
    const { result } = renderHook(() => useLiveChat('actor-1'));
    expect(result.current.status).toBe('loading');
    expect(result.current.messages).toHaveLength(0);
  });

  it('opens EventSource on the correct filtered-stream URL', () => {
    renderHook(() => useLiveChat('actor-abc'));
    expect(MockEventSourceClass).toHaveBeenCalledWith('/api/mcp/live/chat/actor-abc/stream');
  });

  it('appends userId to stream URL when provided', () => {
    renderHook(() => useLiveChat('actor-1', 'user-xyz'));
    expect(MockEventSourceClass).toHaveBeenCalledWith(
      '/api/mcp/live/chat/actor-1/stream?userId=user-xyz',
    );
  });

  it('transitions to connected when EventSource opens', () => {
    const { result } = renderHook(() => useLiveChat('actor-1'));
    act(() => {
      capturedSources[0]?._open();
    });
    expect(result.current.status).toBe('connected');
  });

  it('populates messages from backfill', async () => {
    mockFetchOk({ messages: [makeMsg('msg-1'), makeMsg('msg-2')], truncated: false });
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[0]?.id).toBe('msg-1');
    expect(result.current.messages[1]?.id).toBe('msg-2');
  });

  it('reflects truncated flag from backfill', async () => {
    mockFetchOk({ messages: [], truncated: true });
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.truncated).toBe(true));
  });

  it('adds a message on create SSE event', async () => {
    mockFetchOk(makeEmptyBackfill());
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));

    act(() => {
      capturedSources[0]?._fire(JSON.stringify({ eventType: 'create', data: makeMsg('new-1') }));
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('new-1');
  });

  it('deduplicates create events already present in backfill', async () => {
    const existing = makeMsg('msg-1');
    mockFetchOk({ messages: [existing], truncated: false });
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      capturedSources[0]?._fire(JSON.stringify({ eventType: 'create', data: existing }));
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it('replaces a message on update SSE event', async () => {
    const original = makeMsg('msg-1', { content: 'original' });
    mockFetchOk({ messages: [original], truncated: false });
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      capturedSources[0]?._fire(
        JSON.stringify({ eventType: 'update', data: makeMsg('msg-1', { content: 'edited' }) }),
      );
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.content).toBe('edited');
  });

  it('removes a message on delete SSE event', async () => {
    mockFetchOk({ messages: [makeMsg('msg-1'), makeMsg('msg-2')], truncated: false });
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => {
      capturedSources[0]?._fire(JSON.stringify({ eventType: 'delete', data: { id: 'msg-1' } }));
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('msg-2');
  });

  it('merges backfill with SSE events that arrived before backfill resolved', async () => {
    // Delay the backfill so an SSE event arrives first.
    let resolveBackfill!: (v: { messages: ChatMessageSnapshot[]; truncated: boolean }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<{ ok: boolean; json: () => Promise<unknown> }>((res) => {
            resolveBackfill = (body) => res({ ok: true, json: () => Promise.resolve(body) });
          }),
      ),
    );

    const { result } = renderHook(() => useLiveChat('actor-1'));

    // SSE event arrives before backfill.
    act(() => {
      capturedSources[0]?._fire(JSON.stringify({ eventType: 'create', data: makeMsg('sse-only') }));
    });
    expect(result.current.messages).toHaveLength(1);

    // Backfill arrives with a different message.
    await act(async () => {
      resolveBackfill({ messages: [makeMsg('backfill-only')], truncated: false });
      await Promise.resolve();
    });

    // Both messages present; backfill message is first.
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.id).toBe('backfill-only');
    expect(result.current.messages[1]?.id).toBe('sse-only');
  });

  it('marks status disconnected on SSE error', () => {
    const { result } = renderHook(() => useLiveChat('actor-1'));
    act(() => {
      capturedSources[0]?._open();
      capturedSources[0]?._error();
    });
    expect(result.current.status).toBe('disconnected');
  });

  it('silently ignores backfill failure (mock mode)', async () => {
    mockFetchFail();
    const { result } = renderHook(() => useLiveChat('actor-1'));
    act(() => {
      capturedSources[0]?._open();
    });
    await Promise.resolve(); // let the failed fetch settle
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBe('connected');
  });

  it('tolerates malformed SSE payloads without throwing', async () => {
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));
    act(() => {
      capturedSources[0]?._fire('not valid json');
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('ignores create events with invalid message shape', async () => {
    mockFetchOk(makeEmptyBackfill());
    const { result } = renderHook(() => useLiveChat('actor-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));

    act(() => {
      capturedSources[0]?._fire(
        JSON.stringify({ eventType: 'create', data: { id: 123, isRoll: 'yes' } }),
      );
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useLiveChat('actor-1'));
    const source = capturedSources[0];
    unmount();
    expect(source?.close).toHaveBeenCalled();
  });

  it('resets and re-subscribes when actorId changes', () => {
    const { rerender } = renderHook(({ id }: { id: string }) => useLiveChat(id), {
      initialProps: { id: 'actor-1' },
    });
    expect(capturedSources).toHaveLength(1);
    expect(capturedSources[0]?.url).toBe('/api/mcp/live/chat/actor-1/stream');

    rerender({ id: 'actor-2' });

    expect(capturedSources).toHaveLength(2);
    expect(capturedSources[1]?.url).toBe('/api/mcp/live/chat/actor-2/stream');
    expect(capturedSources[0]?.close).toHaveBeenCalled();
  });
});
