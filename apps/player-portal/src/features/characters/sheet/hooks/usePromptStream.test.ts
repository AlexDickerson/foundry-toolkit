import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptStream } from './usePromptStream';

// ─── EventSource mock ─────────────────────────────────────────────────────

type EventListener = (ev: { data: string }) => void;

interface MockEventSource {
  url: string;
  onmessage: EventListener | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  _fire: (data: string) => void;
}

let capturedSources: MockEventSource[] = [];

// Vitest requires constructor mocks to use 'function' keyword so `new` works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockEventSourceClass = vi.fn(function MockEventSource(this: any, url: string) {
  this.url = url;
  this.onmessage = null;
  this.onerror = null;
  this.close = vi.fn();
  this._fire = function (data: string) {
    if (this.onmessage) this.onmessage({ data });
  };
  capturedSources.push(this as MockEventSource);
});

beforeEach(() => {
  capturedSources = [];
  MockEventSourceClass.mockClear();
  vi.stubGlobal('EventSource', MockEventSourceClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('usePromptStream', () => {
  it('starts with an empty list', () => {
    const { result } = renderHook(() => usePromptStream());
    expect(result.current).toHaveLength(0);
  });

  it('adds a prompt on "added" event', () => {
    const { result } = renderHook(() => usePromptStream());
    const source = capturedSources[0];

    act(() => {
      source?._fire(JSON.stringify({
        kind: 'added',
        event: {
          bridgeId: 'bridge-abc',
          type: 'dialog-request',
          payload: { title: 'Confirm', buttons: [], fields: [], text: null, dialogId: 'bridge-abc', kind: 'Dialog' },
          createdAt: 1000,
        },
      }));
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.bridgeId).toBe('bridge-abc');
    expect(result.current[0]?.type).toBe('dialog-request');
  });

  it('removes a prompt on "removed" event', () => {
    const { result } = renderHook(() => usePromptStream());
    const source = capturedSources[0];

    act(() => {
      source?._fire(JSON.stringify({
        kind: 'added',
        event: { bridgeId: 'bridge-xyz', type: 'dialog-request', payload: {}, createdAt: 2000 },
      }));
    });
    expect(result.current).toHaveLength(1);

    act(() => {
      source?._fire(JSON.stringify({
        kind: 'removed',
        event: { bridgeId: 'bridge-xyz', type: 'dialog-request', payload: {}, createdAt: 2000 },
      }));
    });
    expect(result.current).toHaveLength(0);
  });

  it('queues multiple prompts in arrival order', () => {
    const { result } = renderHook(() => usePromptStream());
    const source = capturedSources[0];

    act(() => {
      source?._fire(JSON.stringify({ kind: 'added', event: { bridgeId: 'first', type: 'dialog-request', payload: {}, createdAt: 1 } }));
      source?._fire(JSON.stringify({ kind: 'added', event: { bridgeId: 'second', type: 'prompt-request', payload: {}, createdAt: 2 } }));
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0]?.bridgeId).toBe('first');
    expect(result.current[1]?.bridgeId).toBe('second');
  });

  it('removes only the matching bridgeId', () => {
    const { result } = renderHook(() => usePromptStream());
    const source = capturedSources[0];

    act(() => {
      source?._fire(JSON.stringify({ kind: 'added', event: { bridgeId: 'keep', type: 'dialog-request', payload: {}, createdAt: 1 } }));
      source?._fire(JSON.stringify({ kind: 'added', event: { bridgeId: 'remove', type: 'dialog-request', payload: {}, createdAt: 2 } }));
    });

    act(() => {
      source?._fire(JSON.stringify({ kind: 'removed', event: { bridgeId: 'remove', type: 'dialog-request', payload: {}, createdAt: 2 } }));
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.bridgeId).toBe('keep');
  });

  it('tolerates malformed SSE payloads without throwing', () => {
    const { result } = renderHook(() => usePromptStream());
    const source = capturedSources[0];

    // Should not throw.
    act(() => {
      source?._fire('not valid json');
    });

    expect(result.current).toHaveLength(0);
  });

  it('opens the EventSource on the correct path', () => {
    renderHook(() => usePromptStream());
    expect(MockEventSourceClass).toHaveBeenCalledWith('/api/mcp/prompts/stream');
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => usePromptStream());
    const source = capturedSources[0];
    unmount();
    expect(source?.close).toHaveBeenCalled();
  });
});
