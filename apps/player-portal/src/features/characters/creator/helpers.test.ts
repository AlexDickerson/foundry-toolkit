import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CompendiumMatch, PreparedActor } from '@/features/characters/types';
import { EMPTY_DRAFT } from './constants';
import { groupHeritages, hydrateFromActor } from './helpers';

function makeHeritage(name: string, isVersatile?: boolean): CompendiumMatch {
  return {
    packId: 'pf2e.heritages',
    packLabel: 'Heritages',
    documentId: `heritage-${name.toLowerCase().replace(/\s/g, '-')}`,
    uuid: `Compendium.pf2e.heritages.Item.${name}`,
    name,
    type: 'heritage',
    img: '',
    ...(isVersatile !== undefined ? { isVersatile } : {}),
  };
}

// ─── hydrateFromActor ───────────────────────────────────────────────────────

function makeActor(overrides: Partial<PreparedActor> = {}): PreparedActor {
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    name: 'Seraphina',
    type: 'character',
    img: '',
    system: {},
    items: [],
    statusEffects: [],
    flags: {},
    ...overrides,
  };
}

function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: (): Promise<unknown> => Promise.resolve(body),
    } as Response),
  );
}

describe('hydrateFromActor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores full draft from creatorDraft flag', async () => {
    const draft = { ...EMPTY_DRAFT, name: 'Zara', age: '24' };
    mockFetch(makeActor({ flags: { 'foundry-toolkit': { creatorDraft: JSON.stringify(draft) } } }));

    const result = await hydrateFromActor('actor-1');
    expect(result.error).toBeNull();
    expect(result.draft?.name).toBe('Zara');
    expect(result.draft?.age).toBe('24');
  });

  it('merges stored draft with EMPTY_DRAFT so missing fields get defaults', async () => {
    // A partial draft (simulates an older stored draft missing new fields)
    const partialDraft = { name: 'Aria' };
    mockFetch(makeActor({ flags: { 'foundry-toolkit': { creatorDraft: JSON.stringify(partialDraft) } } }));

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.name).toBe('Aria');
    // Fields absent from the stored draft fall back to EMPTY_DRAFT values
    expect(result.draft?.skillPicks).toEqual([]);
    expect(result.draft?.ancestry).toBeNull();
  });

  it('falls back to partial hydration when no creatorDraft flag', async () => {
    const actor = makeActor({
      name: 'Liara',
      system: {
        details: {
          gender: { value: 'she/her' },
          age: { value: '30' },
          ethnicity: { value: 'Garundi' },
          nationality: { value: 'Osiriani' },
        },
      },
      flags: {},
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.name).toBe('Liara');
    expect(result.draft?.gender).toBe('she/her');
    expect(result.draft?.age).toBe('30');
    expect(result.draft?.ethnicity).toBe('Garundi');
  });

  it('reconstructs ancestry and class slots from embedded items when no draft flag', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-anc',
          name: 'Elf',
          type: 'ancestry',
          img: 'elf.webp',
          system: {},
          flags: { core: { sourceId: 'Compendium.pf2e.ancestries.Item.elfId1' } },
        },
        {
          id: 'item-cls',
          name: 'Wizard',
          type: 'class',
          img: 'wizard.webp',
          system: {},
          flags: { core: { sourceId: 'Compendium.pf2e.classes.Item.wizardId1' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.ancestry).toEqual({
      match: expect.objectContaining({
        packId: 'pf2e.ancestries',
        documentId: 'elfId1',
        uuid: 'Compendium.pf2e.ancestries.Item.elfId1',
        name: 'Elf',
      }),
      itemId: 'item-anc',
    });
    expect(result.draft?.class).toEqual({
      match: expect.objectContaining({ packId: 'pf2e.classes', name: 'Wizard' }),
      itemId: 'item-cls',
    });
  });

  it('reconstructs class and ancestry feat slots from feat location field', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-cf',
          name: 'Spell Substitution',
          type: 'feat',
          img: '',
          system: { location: 'class-1' },
          flags: { core: { sourceId: 'Compendium.pf2e.feats-srd.Item.cfId1' } },
        },
        {
          id: 'item-af',
          name: 'Elven Weapon Elegance',
          type: 'feat',
          img: '',
          system: { location: 'ancestry-1' },
          flags: { core: { sourceId: 'Compendium.pf2e.feats-srd.Item.afId1' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.classFeat?.itemId).toBe('item-cf');
    expect(result.draft?.ancestryFeat?.itemId).toBe('item-af');
  });

  it('reads level-1 free boosts from actor.system.build.attributes.boosts["1"]', async () => {
    const actor = makeActor({
      system: {
        build: { attributes: { boosts: { '1': ['str', 'dex', 'con', 'int'] } } },
      },
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.levelOneBoosts).toEqual(['str', 'dex', 'con', 'int']);
  });

  it('reads ancestry boost selections from embedded item system.boosts.*.selected', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-anc',
          name: 'Elf',
          type: 'ancestry',
          img: '',
          system: {
            boosts: {
              '0': { value: ['dex'], selected: 'dex' },     // fixed slot
              '1': { value: ['int'], selected: 'int' },     // fixed slot
              '2': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'], selected: 'wis' }, // choice slot
            },
          },
          flags: { core: { sourceId: 'Compendium.pf2e.ancestries.Item.elfId' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.ancestryBoosts).toEqual(['dex', 'int', 'wis']);
  });

  it('reads class key ability from embedded class item system.keyAbility.selected', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-cls',
          name: 'Wizard',
          type: 'class',
          img: '',
          system: { keyAbility: { value: ['int', 'wis'], selected: 'int' } },
          flags: { core: { sourceId: 'Compendium.pf2e.classes.Item.wizardId' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.classKeyAbility).toBe('int');
  });

  it('reads background boost selections from embedded background item', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-bg',
          name: 'Acolyte',
          type: 'background',
          img: '',
          system: {
            boosts: {
              '0': { value: ['int', 'wis'], selected: 'wis' },
              '1': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'], selected: 'cha' },
            },
          },
          flags: { core: { sourceId: 'Compendium.pf2e.backgrounds.Item.acolyteId' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.backgroundBoosts).toEqual(['wis', 'cha']);
  });

  it('reads alternateAncestryBoosts from embedded ancestry item', async () => {
    const actor = makeActor({
      items: [
        {
          id: 'item-anc',
          name: 'Human',
          type: 'ancestry',
          img: '',
          system: { alternateAncestryBoosts: ['str', 'con'], boosts: {} },
          flags: { core: { sourceId: 'Compendium.pf2e.ancestries.Item.humanId' } },
        },
      ],
    });
    mockFetch(actor);

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.alternateAncestryBoosts).toEqual(['str', 'con']);
  });

  it('falls back to compendium name search when item has no sourceId', async () => {
    const actor = makeActor({
      items: [
        { id: 'item-anc', name: 'Dwarf', type: 'ancestry', img: 'dwarf.webp', system: {}, flags: {} },
      ],
    });
    const searchResult = {
      matches: [
        {
          packId: 'pf2e.ancestries',
          packLabel: 'Ancestries',
          documentId: 'dwarfId',
          uuid: 'Compendium.pf2e.ancestries.Item.dwarfId',
          name: 'Dwarf',
          type: 'ancestry',
          img: 'dwarf.webp',
        },
      ],
      total: 1,
    };
    // First call: getPreparedActor; subsequent calls: searchCompendium for each item
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: (): Promise<unknown> => Promise.resolve(actor),
        } as Response)
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: (): Promise<unknown> => Promise.resolve(searchResult),
        } as Response),
    );

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.ancestry).toEqual({
      match: expect.objectContaining({ packId: 'pf2e.ancestries', name: 'Dwarf' }),
      itemId: 'item-anc',
    });
  });

  it('leaves pick null when name search returns no results', async () => {
    const actor = makeActor({
      items: [
        { id: 'item-x', name: 'Homebrew Ancestry', type: 'ancestry', img: '', system: {}, flags: {} },
      ],
    });
    const emptySearch = { matches: [], total: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: (): Promise<unknown> => Promise.resolve(actor),
        } as Response)
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: (): Promise<unknown> => Promise.resolve(emptySearch),
        } as Response),
    );

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.ancestry).toBeNull();
  });

  it('returns an error when the actor fetch fails', async () => {
    mockFetch({ error: 'Actor not found', suggestion: undefined }, false);

    const result = await hydrateFromActor('missing-id');
    expect(result.error).not.toBeNull();
    expect(result.draft).toBeNull();
  });

  it('returns empty picks for actors with no items (no crash on partial actor)', async () => {
    mockFetch(makeActor({ name: 'Blank', items: [], flags: {} }));

    const result = await hydrateFromActor('actor-1');
    expect(result.draft?.ancestry).toBeNull();
    expect(result.draft?.class).toBeNull();
    expect(result.error).toBeNull();
  });
});

describe('groupHeritages', () => {
  it('puts items without isVersatile in primary', () => {
    const items = [makeHeritage('Ancient Dwarf'), makeHeritage('Death Warden Dwarf')];
    const { primary, versatile } = groupHeritages(items);
    expect(primary).toHaveLength(2);
    expect(versatile).toHaveLength(0);
  });

  it('puts isVersatile=true items in versatile', () => {
    const items = [makeHeritage('Aiuvarin', true), makeHeritage('Changeling', true)];
    const { primary, versatile } = groupHeritages(items);
    expect(primary).toHaveLength(0);
    expect(versatile).toHaveLength(2);
  });

  it('puts isVersatile=false items in primary', () => {
    const item = makeHeritage('Ancient Dwarf', false);
    const { primary, versatile } = groupHeritages([item]);
    expect(primary).toHaveLength(1);
    expect(versatile).toHaveLength(0);
  });

  it('splits a mixed list correctly', () => {
    const items = [
      makeHeritage('Ancient Dwarf'),
      makeHeritage('Aiuvarin', true),
      makeHeritage('Death Warden Dwarf'),
      makeHeritage('Changeling', true),
      makeHeritage('Strong-Blooded Dwarf'),
    ];
    const { primary, versatile } = groupHeritages(items);
    expect(primary.map((m) => m.name)).toEqual(['Ancient Dwarf', 'Death Warden Dwarf', 'Strong-Blooded Dwarf']);
    expect(versatile.map((m) => m.name)).toEqual(['Aiuvarin', 'Changeling']);
  });

  it('returns empty groups for an empty list', () => {
    const { primary, versatile } = groupHeritages([]);
    expect(primary).toHaveLength(0);
    expect(versatile).toHaveLength(0);
  });

  it('preserves order within each group', () => {
    const items = [
      makeHeritage('Nephilim', true),
      makeHeritage('Ancient Dwarf'),
      makeHeritage('Aiuvarin', true),
      makeHeritage('Strong-Blooded Dwarf'),
    ];
    const { primary, versatile } = groupHeritages(items);
    expect(primary[0]?.name).toBe('Ancient Dwarf');
    expect(primary[1]?.name).toBe('Strong-Blooded Dwarf');
    expect(versatile[0]?.name).toBe('Nephilim');
    expect(versatile[1]?.name).toBe('Aiuvarin');
  });
});
