import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { FocusPool, PreparedActorItem, SpellcastingEntryItem, SpellItem } from '@/features/characters/types';

// ─── API mock ─────────────────────────────────────────────────────────────

vi.mock('@/features/characters/api', () => ({
  api: {
    dispatch: vi.fn().mockResolvedValue({ result: null }),
    invokeActorAction: vi.fn().mockResolvedValue({ ok: true }),
    prepareSpell: vi.fn().mockResolvedValue({ ok: true }),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

import { api } from '@/features/characters/api';
import { Spells } from './Spells';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const NO_FOCUS: FocusPool = { value: 0, max: 0, cap: 0 };
const FULL_FOCUS: FocusPool = { value: 3, max: 3, cap: 3 };
const EMPTY_FOCUS: FocusPool = { value: 0, max: 3, cap: 3 };

function makeEntry(overrides: Partial<SpellcastingEntryItem['system']> = {}): SpellcastingEntryItem {
  return {
    id: 'entry-1',
    name: 'Arcane Spellcasting',
    type: 'spellcastingEntry',
    img: '',
    system: {
      slug: null,
      prepared: { value: 'prepared' },
      tradition: { value: 'arcane' },
      slots: {
        slot1: { max: 2, value: 2, prepared: [{ id: 'spell-1', expended: false }] },
      },
      ...overrides,
    },
  };
}

function makeSpell(overrides: Partial<SpellItem> = {}): SpellItem {
  return {
    id: 'spell-1',
    name: 'Magic Missile',
    type: 'spell',
    img: '',
    system: {
      slug: 'magic-missile',
      level: { value: 1 },
      traits: { value: [], rarity: 'common' },
      time: { value: '1' },
      location: { value: 'entry-1' },
    },
    ...overrides,
  };
}

function renderSpells(
  items: PreparedActorItem[],
  opts: { focusPoints?: FocusPool; onCast?: () => void } = {},
): ReturnType<typeof render> {
  return render(
    <Spells
      items={items}
      characterLevel={1}
      actorId="actor-1"
      onCast={opts.onCast ?? vi.fn()}
      focusPoints={opts.focusPoints ?? NO_FOCUS}
    />,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Spells tab', () => {
  beforeEach(() => {
    vi.mocked(api.invokeActorAction).mockReset();
    vi.mocked(api.invokeActorAction).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows empty state when there are no spells', () => {
    renderSpells([]);
    expect(screen.getByText('No spellcasting.')).toBeTruthy();
  });

  it('renders spell name and entry heading', () => {
    const items = [makeEntry(), makeSpell()] as PreparedActorItem[];
    renderSpells(items);
    expect(screen.getByText('Arcane Spellcasting')).toBeTruthy();
    // Prepared-mode rendering surfaces a known spell twice: once in its
    // assigned slot and once in the spellbook below.
    expect(screen.getAllByText('Magic Missile').length).toBeGreaterThan(0);
  });

  it('renders a Cast button for each spell', () => {
    const items = [makeEntry(), makeSpell()] as PreparedActorItem[];
    renderSpells(items);
    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    expect(castBtn).toBeTruthy();
    expect(castBtn.hasAttribute('disabled')).toBe(false);
  });

  it('routes Cast through pf2eClient.spellEntry().cast() → invokeActorAction', async () => {
    const onCast = vi.fn();
    const items = [makeEntry(), makeSpell()] as PreparedActorItem[];
    renderSpells(items, { onCast });

    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    fireEvent.click(castBtn);

    await vi.waitFor(() => {
      expect(api.invokeActorAction).toHaveBeenCalledOnce();
      expect(api.invokeActorAction).toHaveBeenCalledWith('actor-1', 'cast-spell', {
        entryId: 'entry-1',
        spellId: 'spell-1',
        rank: 1,
      });
    });
    await vi.waitFor(() => expect(onCast).toHaveBeenCalledOnce());
  });

  it('disables Cast for an expended prepared spell', () => {
    const entry = makeEntry({
      prepared: { value: 'prepared' },
      slots: { slot1: { max: 1, value: 0, prepared: [{ id: 'spell-1', expended: true }] } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    renderSpells(items);

    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    expect(castBtn.hasAttribute('disabled')).toBe(true);
  });

  it('disables Cast for spontaneous when no slots remain', () => {
    const entry = makeEntry({
      prepared: { value: 'spontaneous' },
      slots: { slot1: { max: 2, value: 0 } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    renderSpells(items);

    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    expect(castBtn.hasAttribute('disabled')).toBe(true);
  });

  it('shows spontaneous slot count in rank heading', () => {
    const entry = makeEntry({
      prepared: { value: 'spontaneous' },
      slots: { slot1: { max: 3, value: 2 } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    renderSpells(items);

    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('disables Cast for focus spell when focus pool is empty', () => {
    const entry = makeEntry({
      prepared: { value: 'focus' },
      tradition: { value: '' },
      slots: {},
    });
    const focusSpell = makeSpell({ system: { ...makeSpell().system, level: { value: 3 } } });
    const items = [entry, focusSpell] as PreparedActorItem[];
    renderSpells(items, { focusPoints: EMPTY_FOCUS });

    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    expect(castBtn.hasAttribute('disabled')).toBe(true);
  });

  it('enables Cast for focus spell when focus points remain', () => {
    const entry = makeEntry({
      prepared: { value: 'focus' },
      tradition: { value: '' },
      slots: {},
    });
    const focusSpell = makeSpell({ system: { ...makeSpell().system, level: { value: 3 } } });
    const items = [entry, focusSpell] as PreparedActorItem[];
    renderSpells(items, { focusPoints: FULL_FOCUS });

    const castBtn = screen.getByRole('button', { name: /cast magic missile/i });
    expect(castBtn.hasAttribute('disabled')).toBe(false);
  });
});

describe('Spells tab — prepared-caster slots', () => {
  beforeEach(() => {
    vi.mocked(api.invokeActorAction).mockReset();
    vi.mocked(api.invokeActorAction).mockResolvedValue({ ok: true });
    vi.mocked(api.prepareSpell).mockReset();
    vi.mocked(api.prepareSpell).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders an empty drop-zone cell for each unfilled slot', () => {
    const entry = makeEntry({
      slots: {
        slot1: { max: 2, value: 2, prepared: [{ id: null, expended: false }, { id: null, expended: false }] },
      },
    });
    const { container } = renderSpells([entry] as PreparedActorItem[]);
    const empties = container.querySelectorAll('[data-slot-state="empty"]');
    expect(empties.length).toBe(2);
    expect(container.textContent).toContain('Drag a spell here');
  });

  it('shows a x/max counter in the rank heading', () => {
    const entry = makeEntry({
      slots: {
        slot1: {
          max: 3,
          value: 3,
          prepared: [{ id: 'spell-1', expended: false }, { id: null }, { id: null }],
        },
      },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    renderSpells(items);
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('lists known spells in the spellbook section as draggable chips', () => {
    const entry = makeEntry({
      slots: { slot1: { max: 1, value: 1, prepared: [{ id: null }] } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    const { container } = renderSpells(items);
    const chip = container.querySelector('[data-spellbook-entry="spell-1"]');
    expect(chip).toBeTruthy();
    expect(chip!.getAttribute('draggable')).toBe('true');
  });

  it('dropping a spell on an empty slot calls api.prepareSpell with the slot rank + index', async () => {
    const entry = makeEntry({
      slots: { slot1: { max: 1, value: 1, prepared: [{ id: null, expended: false }] } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    const { container } = renderSpells(items);
    const dropZone = container.querySelector('[data-slot-state="empty"]') as HTMLElement;
    expect(dropZone).toBeTruthy();

    // Simulate dragging a spell from the spellbook onto the empty slot.
    const data = new Map<string, string>();
    const dataTransfer = {
      getData: (k: string): string => data.get(k) ?? '',
      setData: (k: string, v: string): void => { data.set(k, v); },
      dropEffect: 'move',
      effectAllowed: 'move',
    };
    data.set('text/x-pf2e-spell-id', 'spell-1');

    fireEvent.drop(dropZone, { dataTransfer });

    await vi.waitFor(() => {
      expect(api.prepareSpell).toHaveBeenCalledWith('actor-1', 'entry-1', 1, 0, 'spell-1');
    });
  });

  it('clicking the unprepare × calls api.prepareSpell with spellId=null', async () => {
    const entry = makeEntry({
      slots: { slot1: { max: 1, value: 1, prepared: [{ id: 'spell-1', expended: false }] } },
    });
    const items = [entry, makeSpell()] as PreparedActorItem[];
    renderSpells(items);
    const clearBtn = screen.getByRole('button', { name: /clear prepared slot/i });
    fireEvent.click(clearBtn);

    await vi.waitFor(() => {
      expect(api.prepareSpell).toHaveBeenCalledWith('actor-1', 'entry-1', 1, 0, null);
    });
  });
});
