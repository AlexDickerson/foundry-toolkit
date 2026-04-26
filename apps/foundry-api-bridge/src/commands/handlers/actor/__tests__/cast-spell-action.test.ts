import { invokeActorActionHandler } from '../InvokeActorActionHandler';

// Minimal Foundry types needed for spell casting tests.
interface MockSpellItem {
  id: string;
  name: string;
  type: 'spell';
  system: {
    level: { value: number };
    traits: { value: string[] };
    time?: { value: string };
    location?: { value: string | null };
  };
}

interface MockSpellcastingEntry {
  id: string;
  name: string;
  type: 'spellcastingEntry';
  system: {
    prepared: { value: 'prepared' | 'spontaneous' | 'innate' | 'focus' };
    tradition: { value: string };
    slots?: Record<string, { max: number; value?: number; prepared?: Array<{ id: string | null; expended?: boolean }> }>;
  };
  cast: jest.Mock;
}

interface MockSpellcasting {
  get: jest.Mock;
}

interface MockActor {
  id: string;
  uuid: string;
  type: string;
  system: Record<string, unknown>;
  items: {
    get: jest.Mock;
    contents?: Array<MockSpellItem | MockSpellcastingEntry>;
  };
  update: jest.Mock;
  spellcasting?: MockSpellcasting;
}

function setupFoundry(actor: MockActor | null): void {
  const actors = new Map<string, MockActor>();
  if (actor) actors.set(actor.id, actor);
  (globalThis as unknown as Record<string, unknown>)['game'] = {
    actors: { get: (id: string) => actors.get(id) },
    messages: { contents: [] },
    pf2e: { actions: {} },
  };
}

function makeSpellItem(overrides: Partial<MockSpellItem> = {}): MockSpellItem {
  return {
    id: 'spell-1',
    name: 'Magic Missile',
    type: 'spell',
    system: {
      level: { value: 1 },
      traits: { value: [] },
      time: { value: '1' },
      location: { value: 'entry-1' },
    },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<MockSpellcastingEntry> = {}): MockSpellcastingEntry {
  return {
    id: 'entry-1',
    name: 'Arcane Spellcasting',
    type: 'spellcastingEntry',
    system: {
      prepared: { value: 'prepared' },
      tradition: { value: 'arcane' },
      slots: {
        slot1: { max: 3, value: 3, prepared: [{ id: 'spell-1', expended: false }] },
      },
    },
    cast: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeActor(entry: MockSpellcastingEntry, spellItem: MockSpellItem): MockActor {
  const spellcasting: MockSpellcasting = {
    get: jest.fn((id: string) => (id === entry.id ? entry : undefined)),
  };
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    type: 'character',
    system: {
      resources: { focus: { value: 3, max: 3 } },
    },
    items: {
      // items.contents is what get-spellcasting iterates — include both the
      // spellcastingEntry and the spell item so the handler can find both.
      get: jest.fn((id: string) => (id === spellItem.id ? spellItem : undefined)),
      contents: [entry, spellItem],
    },
    update: jest.fn(),
    spellcasting,
  };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['game'];
});

// ─── cast-spell ───────────────────────────────────────────────────────────────

describe('invokeActorActionHandler — cast-spell', () => {
  it('calls entry.cast with the resolved spell and rank', async () => {
    const spell = makeSpellItem();
    const entry = makeEntry();
    const actor = makeActor(entry, spell);
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'cast-spell',
      params: { entryId: 'entry-1', spellId: 'spell-1', rank: 1 },
    });

    expect(entry.cast).toHaveBeenCalledTimes(1);
    expect(entry.cast).toHaveBeenCalledWith(spell, { rank: 1 });
    expect(result).toEqual({ ok: true });
  });

  it('throws when entryId is missing', async () => {
    setupFoundry(makeActor(makeEntry(), makeSpellItem()));
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { spellId: 'spell-1', rank: 1 },
      }),
    ).rejects.toThrow(/params\.entryId is required/);
  });

  it('throws when spellId is missing', async () => {
    setupFoundry(makeActor(makeEntry(), makeSpellItem()));
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { entryId: 'entry-1', rank: 1 },
      }),
    ).rejects.toThrow(/params\.spellId is required/);
  });

  it('throws when rank is missing', async () => {
    setupFoundry(makeActor(makeEntry(), makeSpellItem()));
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { entryId: 'entry-1', spellId: 'spell-1' },
      }),
    ).rejects.toThrow(/params\.rank must be a non-negative integer/);
  });

  it('throws when the actor has no spellcasting', async () => {
    const actor = makeActor(makeEntry(), makeSpellItem());
    delete actor.spellcasting;
    setupFoundry(actor);
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { entryId: 'entry-1', spellId: 'spell-1', rank: 1 },
      }),
    ).rejects.toThrow(/has no spellcasting ability/);
  });

  it('throws when the entry is not found', async () => {
    const actor = makeActor(makeEntry(), makeSpellItem());
    setupFoundry(actor);
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { entryId: 'no-such-entry', spellId: 'spell-1', rank: 1 },
      }),
    ).rejects.toThrow(/spellcasting entry 'no-such-entry' not found/);
  });

  it('throws when the spell item is not found on the actor', async () => {
    const actor = makeActor(makeEntry(), makeSpellItem());
    setupFoundry(actor);
    await expect(
      invokeActorActionHandler({
        actorId: 'actor-1',
        action: 'cast-spell',
        params: { entryId: 'entry-1', spellId: 'no-such-spell', rank: 1 },
      }),
    ).rejects.toThrow(/spell item 'no-such-spell' not found/);
  });
});

// ─── get-spellcasting ─────────────────────────────────────────────────────────

describe('invokeActorActionHandler — get-spellcasting', () => {
  it('returns entries with spell summaries', async () => {
    const spell = makeSpellItem();
    const entry = makeEntry();
    const actor = makeActor(entry, spell);
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'get-spellcasting',
      params: {},
    });

    expect(result).toMatchObject({
      actorId: 'actor-1',
      entries: [
        expect.objectContaining({
          id: 'entry-1',
          name: 'Arcane Spellcasting',
          mode: 'prepared',
          tradition: 'arcane',
          spells: [
            expect.objectContaining({
              id: 'spell-1',
              name: 'Magic Missile',
              rank: 1,
              isCantrip: false,
              actions: '1',
            }),
          ],
        }),
      ],
    });
  });

  it('marks prepared spells as expended when the slot says so', async () => {
    const spell = makeSpellItem();
    const entry = makeEntry({
      system: {
        prepared: { value: 'prepared' },
        tradition: { value: 'arcane' },
        slots: {
          slot1: { max: 1, value: 0, prepared: [{ id: 'spell-1', expended: true }] },
        },
      },
    });
    const actor = makeActor(entry, spell);
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'get-spellcasting',
      params: {},
    });

    const spellResult = (result as { entries: Array<{ spells: Array<{ expended: boolean }> }> }).entries[0]?.spells[0];
    expect(spellResult?.expended).toBe(true);
  });

  it('returns slot counts for spontaneous entries', async () => {
    const spell = makeSpellItem();
    const entry = makeEntry({
      system: {
        prepared: { value: 'spontaneous' },
        tradition: { value: 'occult' },
        slots: {
          slot1: { max: 4, value: 2 },
          slot2: { max: 3, value: 3 },
        },
      },
    });
    const actor = makeActor(entry, spell);
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'get-spellcasting',
      params: {},
    });

    const entryResult = (result as { entries: Array<{ slots?: Array<{ rank: number; value: number; max: number }> }> })
      .entries[0];
    expect(entryResult?.slots).toEqual(
      expect.arrayContaining([
        { rank: 1, value: 2, max: 4 },
        { rank: 2, value: 3, max: 3 },
      ]),
    );
  });

  it('returns focusPoints for focus entries', async () => {
    const spell = makeSpellItem({ system: { level: { value: 3 }, traits: { value: [] }, location: { value: 'entry-1' } } });
    const entry = makeEntry({
      system: {
        prepared: { value: 'focus' },
        tradition: { value: '' },
        slots: {},
      },
    });
    const actor = makeActor(entry, spell);
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'get-spellcasting',
      params: {},
    });

    const entryResult = (result as { entries: Array<{ focusPoints?: { value: number; max: number } }> }).entries[0];
    expect(entryResult?.focusPoints).toEqual({ value: 3, max: 3 });
  });

  it('returns empty entries when actor has no spellcastingEntry items', async () => {
    // Actor with no spellcasting entry items in its items collection.
    const actor = makeActor(makeEntry(), makeSpellItem());
    actor.items.contents = []; // strip all items — no entry, no spells
    setupFoundry(actor);

    const result = await invokeActorActionHandler({
      actorId: 'actor-1',
      action: 'get-spellcasting',
      params: {},
    });

    expect(result).toEqual({ actorId: 'actor-1', entries: [] });
  });
});
