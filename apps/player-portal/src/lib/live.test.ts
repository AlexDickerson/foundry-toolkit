import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveStream } from './live';

// ─── EventSource mock ─────────────────────────────────────────────────────

interface MockEventSource {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  _open: () => void;
  _message: (data: string) => void;
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
  this._open = function () {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  };
  this._message = function (data: string) {
    if (this.onmessage) this.onmessage({ data });
  };
  this._error = function () {
    if (this.onerror) this.onerror();
  };
  capturedSources.push(this as MockEventSource);
});
// EventSource.CLOSED = 2 — referenced by the hook for the onerror guard.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MockEventSourceClass as any).CLOSED = 2;

beforeEach(() => {
  capturedSources = [];
  MockEventSourceClass.mockClear();
  vi.stubGlobal('EventSource', MockEventSourceClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────

interface Snap {
  items: string[];
  updatedAt: string;
}

describe('useLiveStream', () => {
  it('opens an EventSource on the given path', () => {
    renderHook(() => useLiveStream('/api/mcp/live/inventory/stream'));
    expect(MockEventSourceClass).toHaveBeenCalledWith('/api/mcp/live/inventory/stream');
  });

  it('uses overrideUrl when provided', () => {
    renderHook(() => useLiveStream('/ignored', 'http://mcp:8765/api/live/inventory/stream'));
    expect(MockEventSourceClass).toHaveBeenCalledWith('http://mcp:8765/api/live/inventory/stream');
  });

  it('starts with status "connecting" and no data', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    expect(result.current.status).toBe('connecting');
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('sets status to "connected" on open', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    act(() => {
      capturedSources[0]?._open();
    });
    expect(result.current.status).toBe('connected');
  });

  it('updates data and lastUpdated on message', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    const snap: Snap = { items: ['sword'], updatedAt: '2024-01-01T00:00:00.000Z' };

    act(() => {
      capturedSources[0]?._message(JSON.stringify(snap));
    });

    expect(result.current.data).toEqual(snap);
    expect(result.current.status).toBe('connected');
    expect(result.current.lastUpdated).toBeTypeOf('number');
  });

  it('sets status to "disconnected" on error when not closed', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    act(() => {
      capturedSources[0]?._open();
    });
    expect(result.current.status).toBe('connected');

    act(() => {
      // readyState is 1 (OPEN/reconnecting), not 2 (CLOSED)
      capturedSources[0]?._error();
    });
    expect(result.current.status).toBe('disconnected');
  });

  it('does not change status on error when readyState is CLOSED', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    act(() => {
      capturedSources[0]?._open();
    });
    // Simulate explicit close then error: set readyState to CLOSED (2) then fire error.
    act(() => {
      if (capturedSources[0]) capturedSources[0].readyState = 2;
      capturedSources[0]?._error();
    });
    expect(result.current.status).toBe('connected');
  });

  it('preserves data across a disconnect-reconnect cycle', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    const snap: Snap = { items: ['potion'], updatedAt: '2024-01-01T00:00:00.000Z' };

    act(() => {
      capturedSources[0]?._message(JSON.stringify(snap));
    });

    act(() => {
      capturedSources[0]?._error();
    });
    // Data is preserved, status changes to disconnected
    expect(result.current.data).toEqual(snap);
    expect(result.current.status).toBe('disconnected');

    act(() => {
      capturedSources[0]?._open();
    });
    expect(result.current.status).toBe('connected');
    expect(result.current.data).toEqual(snap);
  });

  it('tolerates malformed JSON in messages', () => {
    const { result } = renderHook(() => useLiveStream<Snap>('/api/mcp/live/inventory/stream'));
    act(() => {
      capturedSources[0]?._message('not valid json');
    });
    expect(result.current.data).toBeNull();
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useLiveStream('/api/mcp/live/inventory/stream'));
    const source = capturedSources[0];
    unmount();
    expect(source?.close).toHaveBeenCalled();
  });

  it('recreates the EventSource when path changes', () => {
    const { rerender } = renderHook(({ p }: { p: string }) => useLiveStream(p), {
      initialProps: { p: '/api/mcp/live/inventory/stream' },
    });
    rerender({ p: '/api/mcp/live/aurus/stream' });
    // First source was closed, second was opened for the new path
    expect(capturedSources[0]?.close).toHaveBeenCalled();
    expect(capturedSources[1]?.url).toBe('/api/mcp/live/aurus/stream');
  });
});
