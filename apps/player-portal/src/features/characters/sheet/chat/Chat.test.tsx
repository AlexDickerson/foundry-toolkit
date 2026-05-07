import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

vi.mock('@/_quarantine/lib/useLiveChat', () => ({
  useLiveChat: vi.fn(),
}));

import { useLiveChat } from '@/_quarantine/lib/useLiveChat';
import { Chat } from './Chat';

function makeMsg(id: string, content: string, timestamp: number): ChatMessageSnapshot {
  return {
    id,
    uuid: null,
    type: null,
    author: { id: 'user-1', name: 'Alice' },
    timestamp,
    flavor: '',
    content,
    speaker: { alias: 'Alice' },
    speakerOwnerIds: [],
    whisper: [],
    isRoll: false,
    rolls: [],
    flags: {},
  };
}

const OLDER = makeMsg('msg-1', 'First', 1000);
const NEWER = makeMsg('msg-2', 'Second', 2000);

const SORT_KEY = 'chat-feed:sort-order';

beforeEach(() => {
  vi.mocked(useLiveChat).mockReturnValue({
    messages: [OLDER, NEWER],
    status: 'connected',
    truncated: false,
  });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Chat sort toggle', () => {
  it('defaults to newest-first (descending) when no preference stored', () => {
    const { container } = render(<Chat actorId="actor-1" />);
    // Content order: NEWER text should appear before OLDER text in the DOM.
    const text = container.textContent ?? '';
    const idxFirst = text.indexOf('First');
    const idxSecond = text.indexOf('Second');
    expect(idxSecond).toBeLessThan(idxFirst);
  });

  it('shows the toggle button with correct label for descending', () => {
    const { getByTitle } = render(<Chat actorId="actor-1" />);
    const btn = getByTitle(/Showing newest first/i);
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/Newest first/i);
  });

  it('toggles to oldest-first on click', () => {
    const { getByTitle, container } = render(<Chat actorId="actor-1" />);
    const btn = getByTitle(/Showing newest first/i);
    fireEvent.click(btn);

    // After toggle: OLDER text should appear before NEWER.
    const text = container.textContent ?? '';
    const idxFirst = text.indexOf('First');
    const idxSecond = text.indexOf('Second');
    expect(idxFirst).toBeLessThan(idxSecond);
  });

  it('updates the button label after toggle', () => {
    const { getByTitle } = render(<Chat actorId="actor-1" />);
    const btn = getByTitle(/Showing newest first/i);
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Oldest first/i);
    expect(btn.title).toMatch(/Showing oldest first/i);
  });

  it('persists sort order to localStorage', () => {
    const { getByTitle } = render(<Chat actorId="actor-1" />);
    const btn = getByTitle(/Showing newest first/i);
    fireEvent.click(btn);
    expect(window.localStorage.getItem(SORT_KEY)).toBe('asc');
  });

  it('reads initial sort order from localStorage', () => {
    window.localStorage.setItem(SORT_KEY, 'asc');
    const { container } = render(<Chat actorId="actor-1" />);
    // Oldest-first: OLDER should appear before NEWER.
    const text = container.textContent ?? '';
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
  });

  it('can toggle back to descending', () => {
    const { getByTitle } = render(<Chat actorId="actor-1" />);
    const btn = getByTitle(/Showing newest first/i);
    fireEvent.click(btn); // → asc
    fireEvent.click(btn); // → desc again
    expect(window.localStorage.getItem(SORT_KEY)).toBe('desc');
    expect(btn.textContent).toMatch(/Newest first/i);
  });

  it('renders empty state when no messages', () => {
    vi.mocked(useLiveChat).mockReturnValue({
      messages: [],
      status: 'connected',
      truncated: false,
    });
    const { getByText } = render(<Chat actorId="actor-1" />);
    expect(getByText(/No messages yet/i)).toBeTruthy();
  });

  it('renders loading state', () => {
    vi.mocked(useLiveChat).mockReturnValue({
      messages: [],
      status: 'loading',
      truncated: false,
    });
    const { getByText } = render(<Chat actorId="actor-1" />);
    expect(getByText(/Connecting/i)).toBeTruthy();
  });
});
