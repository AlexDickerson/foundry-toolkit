import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { FocusPool, PreparedActorItem, SpellcastingEntryItem, SpellItem } from '../../api/types';

// ─── API mock ─────────────────────────────────────────────────────────────

vi.mock('../../api/client', () => ({
  api: {
    dispatch: vi.fn().mockResolvedValue({ result: null }),
    invokeActorAction: vi.fn().mockResolvedValue({ ok: true }),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

import { api } from '../../api/client';
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
    expect(screen.getByText('Magic Missile')).toBeTruthy();
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
