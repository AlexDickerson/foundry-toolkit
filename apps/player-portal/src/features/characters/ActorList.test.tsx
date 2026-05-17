import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
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

  it('renders player character names', async () => {
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
    // NPCs must not appear in the character list
    expect(screen.queryByText('Bandit')).toBeNull();
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

  it('renders empty-state when the list contains only non-character actors', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ id: 'n1', name: 'Goblin Boss', type: 'npc', img: '' }]),
    );
    render(<ActorList />);
    await waitFor(() => {
      expect(screen.getByText(/No player characters in the world yet/)).toBeTruthy();
    });
  });
});

describe('ActorList — Continue / Edit buttons', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows Edit button for actors without creatorInProgress flag', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ id: 'a1', name: 'Kyra', type: 'character', img: '', flags: {} }]),
    );
    const onEdit = vi.fn();
    render(<ActorList onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-button')).toBeTruthy();
    });
    expect(screen.queryByTestId('continue-button')).toBeNull();
  });

  it('shows Continue button for actors with creatorInProgress=true', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          id: 'a1',
          name: 'Kyra',
          type: 'character',
          img: '',
          flags: { 'foundry-toolkit': { creatorInProgress: true } },
        },
      ]),
    );
    const onEdit = vi.fn();
    render(<ActorList onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByTestId('continue-button')).toBeTruthy();
    });
    expect(screen.queryByTestId('edit-button')).toBeNull();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ id: 'a1', name: 'Kyra', type: 'character', img: '' }]),
    );
    const onEdit = vi.fn();
    render(<ActorList onEdit={onEdit} />);
    await waitFor(() => screen.getByTestId('edit-button'));
    fireEvent.click(screen.getByTestId('edit-button'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('calls onEdit when Continue button is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          id: 'a1',
          name: 'Kyra',
          type: 'character',
          img: '',
          flags: { 'foundry-toolkit': { creatorInProgress: true } },
        },
      ]),
    );
    const onEdit = vi.fn();
    render(<ActorList onEdit={onEdit} />);
    await waitFor(() => screen.getByTestId('continue-button'));
    fireEvent.click(screen.getByTestId('continue-button'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('does not render Edit/Continue buttons when onEdit is not provided', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ id: 'a1', name: 'Kyra', type: 'character', img: '' }]),
    );
    render(<ActorList />);
    await waitFor(() => screen.getByText('Kyra'));
    expect(screen.queryByTestId('edit-button')).toBeNull();
    expect(screen.queryByTestId('continue-button')).toBeNull();
  });

  it('shows Edit for completed actors (creatorInProgress=false)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          id: 'a1',
          name: 'Kyra',
          type: 'character',
          img: '',
          flags: { 'foundry-toolkit': { creatorCompleted: true, creatorInProgress: false } },
        },
      ]),
    );
    const onEdit = vi.fn();
    render(<ActorList onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-button')).toBeTruthy();
    });
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
      expect(screen.getByText(/No player characters in the world yet/)).toBeTruthy();
    });
  });
});

describe('ActorList — party grouping', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a section header per party (sorted alphabetically by party name)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { id: 'c1', name: 'Alpha', type: 'character', img: '', party: { id: 'pZ', name: 'Zephyr Squad' } },
        { id: 'c2', name: 'Beta', type: 'character', img: '', party: { id: 'pA', name: 'Anchor Crew' } },
      ]),
    );
    render(<ActorList />);
    await waitFor(() => screen.getByText('Alpha'));
    const headers = screen.getAllByRole('heading', { level: 2 });
    expect(headers.map((h) => h.textContent)).toEqual(['Anchor Crew', 'Zephyr Squad']);
  });

  it('groups characters with the same party together under one header', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { id: 'c1', name: 'Broccoli', type: 'character', img: '', party: { id: 'p1', name: 'The Dents' } },
        { id: 'c2', name: 'Jackstone', type: 'character', img: '', party: { id: 'p1', name: 'The Dents' } },
      ]),
    );
    const { container } = render(<ActorList />);
    await waitFor(() => screen.getByText('Broccoli'));
    const section = container.querySelector('[data-party-id="p1"]');
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain('Broccoli');
    expect(section!.textContent).toContain('Jackstone');
  });

  it('places unaffiliated characters in an "Unaffiliated" section at the end', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { id: 'c1', name: 'Lonely', type: 'character', img: '', party: null },
        { id: 'c2', name: 'Joined', type: 'character', img: '', party: { id: 'p1', name: 'The Dents' } },
      ]),
    );
    render(<ActorList />);
    await waitFor(() => screen.getByText('Lonely'));
    const headers = screen.getAllByRole('heading', { level: 2 });
    expect(headers.map((h) => h.textContent)).toEqual(['The Dents', 'Unaffiliated']);
  });

  it('treats absent `party` field as unaffiliated (legacy bridge compat)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ id: 'c1', name: 'NoPartyField', type: 'character', img: '' }]),
    );
    render(<ActorList />);
    await waitFor(() => screen.getByText('NoPartyField'));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Unaffiliated');
  });
});
