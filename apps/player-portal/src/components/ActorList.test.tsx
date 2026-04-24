import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ActorList } from './ActorList';

function mockFetch(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fetchImpl = (): Promise<Response> =>
    Promise.resolve({
      ok,
      status,
      json: (): Promise<unknown> => Promise.resolve(body),
    } as Response);
  return vi.fn().mockImplementation(fetchImpl);
}

describe('ActorList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders actor names on success', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { id: 'a1', name: 'Amiri', type: 'character', img: '' },
        { id: 'a2', name: 'Bandit', type: 'npc', img: '' },
      ]),
    );
    render(<ActorList />);
    await waitFor(() => {
      expect(screen.getByText('Amiri')).toBeTruthy();
    });
    expect(screen.getByText('Bandit')).toBeTruthy();
  });

  it('renders the API error envelope on failure', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        {
          error: 'Foundry module not connected',
          suggestion: 'Start Foundry and enable foundry-api-bridge.',
        },
        false,
        503,
      ),
    );
    render(<ActorList />);
    await waitFor(() => {
      expect(screen.getByText(/Foundry module not connected/)).toBeTruthy();
    });
    expect(screen.getByText(/Start Foundry/)).toBeTruthy();
  });
});

describe('env', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch([]));
  });
  afterEach(() => cleanup());

  it('renders empty-state when no actors', async () => {
    render(<ActorList />);
    await waitFor(() => {
      expect(screen.getByText(/No actors in the world yet/)).toBeTruthy();
    });
  });
});
