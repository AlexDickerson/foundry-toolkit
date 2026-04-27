import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useParty } from './useParty';

// ─── api mock ────────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  api: {
    getPartyForMember: vi.fn(),
  },
}));

import { api } from '../api/client';
const mockGetPartyForMember = vi.mocked(api.getPartyForMember);

// ─── EventSource mock ────────────────────────────────────────────────────────

type ESListener = (ev: { data: string }) => void;

interface MockEventSource {
  url: string;
  onmessage: ESListener | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  _fire: (data: string) => void;
}

let capturedSources: MockEventSource[] = [];

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PARTY_RESPONSE = {
  party: { id: 'prt-1', name: 'The Party', img: '' },
  members: [
    {
      id: 'chr-1',
      name: 'Amiri',
      img: '',
      level: 5,
      hp: { value: 45, max: 60, temp: 0 },
      ac: 18,
      perceptionMod: 8,
      heroPoints: { value: 1, max: 3 },
      shield: null,
      conditions: [],
      isOwnedByUser: true,
    },
    {
      id: 'chr-2',
      name: 'Harsk',
      img: '',
      level: 5,
      hp: { value: 55, max: 70, temp: 0 },
      ac: 22,
      perceptionMod: 12,
      heroPoints: { value: 0, max: 3 },
      shield: null,
      conditions: [],
      isOwnedByUser: false,
    },
  ],
};

const NO_PARTY_RESPONSE = { party: null, members: [] };

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  capturedSources = [];
  MockEventSourceClass.mockClear();
  mockGetPartyForMember.mockReset();
  vi.stubGlobal('EventSource', MockEventSourceClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function getActorsSource(): MockEventSource | undefined {
  return capturedSources.find((s) => s.url.includes('/actors/stream'));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useParty', () => {
  it('starts in loading state before the fetch resolves', () => {
    mockGetPartyForMember.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useParty('chr-1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.party).toBeNull();
    expect(result.current.members).toEqual([]);
  });

  it('calls getPartyForMember with the given actorId on mount', async () => {
    mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
    renderHook(() => useParty('chr-1'));
    await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledWith('chr-1'));
  });

  it('populates party and members after a successful fetch', async () => {
    mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
    const { result } = renderHook(() => useParty('chr-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.party).toMatchObject({ id: 'prt-1', name: 'The Party' });
    expect(result.current.members).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('sets error and clears loading on fetch failure', async () => {
    mockGetPartyForMember.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useParty('chr-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('network error');
    expect(result.current.party).toBeNull();
  });

  it('sets party to null when character is not in any party', async () => {
    mockGetPartyForMember.mockResolvedValue(NO_PARTY_RESPONSE);
    const { result } = renderHook(() => useParty('chr-orphan'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.party).toBeNull();
    expect(result.current.members).toEqual([]);
  });

  it('refetches when actorId prop changes', async () => {
    mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
    const { rerender } = renderHook(({ id }: { id: string }) => useParty(id), {
      initialProps: { id: 'chr-1' },
    });
    await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledWith('chr-1'));

    mockGetPartyForMember.mockResolvedValue(NO_PARTY_RESPONSE);
    rerender({ id: 'chr-2' });

    await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledWith('chr-2'));
  });

  it('refetch() triggers an immediate re-fetch', async () => {
    mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
    const { result } = renderHook(() => useParty('chr-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetPartyForMember.mockResolvedValue(NO_PARTY_RESPONSE);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.party).toBeNull());
    expect(mockGetPartyForMember).toHaveBeenCalledTimes(2);
  });

  describe('event-channel live updates', () => {
    it('opens an EventSource on the actors channel', async () => {
      mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
      renderHook(() => useParty('chr-1'));
      await waitFor(() => expect(getActorsSource()).toBeDefined());
      expect(getActorsSource()?.url).toContain('/actors/stream');
    });

    it('refetches when the resolved party actor is updated', async () => {
      mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
      const { result } = renderHook(() => useParty('chr-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const source = getActorsSource();

      act(() => {
        source?._fire(JSON.stringify({ actorId: 'prt-1' }));
      });

      // waitFor handles the 150ms debounce naturally with its polling
      await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledTimes(2), { timeout: 500 });
    });

    it('refetches when a party member is updated', async () => {
      mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
      const { result } = renderHook(() => useParty('chr-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const source = getActorsSource();

      act(() => {
        source?._fire(JSON.stringify({ actorId: 'chr-2' })); // Harsk updated
      });

      await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledTimes(2), { timeout: 500 });
    });

    it('does NOT refetch for unrelated actor updates', async () => {
      mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
      const { result } = renderHook(() => useParty('chr-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const source = getActorsSource();

      act(() => {
        source?._fire(JSON.stringify({ actorId: 'npc-goblin-42' }));
      });

      // Wait beyond the debounce window to confirm no refetch was queued
      await new Promise<void>((r) => setTimeout(r, 250));

      expect(mockGetPartyForMember).toHaveBeenCalledTimes(1);
    });

    it('debounce coalesces rapid actor-update events into a single refetch', async () => {
      mockGetPartyForMember.mockResolvedValue(PARTY_RESPONSE);
      const { result } = renderHook(() => useParty('chr-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const source = getActorsSource();

      // Simulate a combat-tick storm: 5 events in the same synchronous batch.
      // Each calls scheduleRefetch(), which clears the previous 150ms timer
      // and sets a new one — so only 1 timer survives the batch.
      act(() => {
        for (let i = 0; i < 5; i++) {
          source?._fire(JSON.stringify({ actorId: 'chr-1' }));
        }
      });

      // Wait for the single debounced refetch to complete
      await waitFor(() => expect(mockGetPartyForMember).toHaveBeenCalledTimes(2), { timeout: 500 });

      // Confirm it was exactly 2 (initial + 1 debounced, not 6)
      expect(mockGetPartyForMember).toHaveBeenCalledTimes(2);
    });
  });
});
