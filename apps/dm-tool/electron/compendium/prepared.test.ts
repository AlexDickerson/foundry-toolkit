// Happy-path + empty-path coverage for each method on the prepared
// compendium facade. Uses a hand-rolled fake `CompendiumApi` with the
// same wiring-level tests use so the surface the projection layer hits
// is the same as production.
//
// The projection logic itself is covered exhaustively in
// `projection.test.ts`; this file just asserts that `prepared.ts` calls
// the api with the right filters, threads the match/doc payload through
// the right mapper, and applies the client-side post-filter + sort.

import { describe, expect, it, vi } from 'vitest';
import type { CompendiumApi } from './index';
import { createPreparedCompendium } from './prepared';
import type { CompendiumDocument, CompendiumMatch } from './types';

function doc(overrides: Partial<CompendiumDocument> = {}): CompendiumDocument {
  return {
    id: 'x',
    uuid: 'x',
    name: 'Test',
    type: 'npc',
    img: '',
    system: {},
    ...overrides,
  };
}

function monsterMatch(over: Partial<CompendiumMatch> = {}): CompendiumMatch {
  return {
    packId: 'pf2e.pathfinder-bestiary',
    packLabel: 'PF2e Bestiary',
    documentId: 'dragon1',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.dragon1',
    name: 'Young Red Dragon',
    type: 'npc',
    img: '',
    level: 10,
    traits: ['dragon', 'fire'],
    ...over,
  };
}

function itemMatch(over: Partial<CompendiumMatch> = {}): CompendiumMatch {
  return {
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: 'potion1',
    uuid: 'Compendium.pf2e.equipment-srd.Item.potion1',
    name: 'Potion of Healing',
    type: 'consumable',
    img: '',
    level: 3,
    traits: ['consumable', 'magical'],
    price: { value: { gp: 12 } },
    ...over,
  };
}

function fakeApi(overrides: Partial<CompendiumApi> = {}): CompendiumApi {
  return {
    searchCompendium: vi.fn().mockResolvedValue({ matches: [] }),
    getCompendiumDocument: vi.fn().mockResolvedValue({ document: doc(), stale: false }),
    listCompendiumPacks: vi.fn().mockResolvedValue({ packs: [] }),
    listCompendiumSources: vi.fn().mockResolvedValue({ sources: [] }),
    ensureCompendiumPack: vi.fn(),
    createCompendiumItem: vi.fn(),
    invalidateDocument: vi.fn(),
    invalidateAllDocuments: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

describe('searchMonsters', () => {
  it('returns a formatted chat block for each match', async () => {
    const search = vi.fn().mockResolvedValue({ matches: [monsterMatch()] });
    const get = vi.fn().mockResolvedValue({
      document: doc({
        name: 'Young Red Dragon',
        system: {
          details: { level: { value: 10 } },
          publication: { title: 'Bestiary' },
          traits: { rarity: 'uncommon', size: { value: 'huge' }, value: ['dragon'] },
          attributes: { hp: { max: 180 }, ac: { value: 30 } },
          saves: { fortitude: { value: 20 }, reflex: { value: 18 }, will: { value: 17 } },
          perception: { mod: 19 },
          abilities: {
            str: { mod: 6 },
            dex: { mod: 2 },
            con: { mod: 5 },
            int: { mod: 1 },
            wis: { mod: 3 },
            cha: { mod: 4 },
          },
        },
      }),
      stale: false,
    });
    const api = fakeApi({ searchCompendium: search, getCompendiumDocument: get });
    const out = await createPreparedCompendium(api).searchMonsters('dragon');
    expect(out).toContain('--- Creature Result 1: Young Red Dragon (Level 10) ---');
    expect(out).toContain('HP 180 | AC 30');
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'dragon',
        documentType: 'npc',
        limit: 3,
        packIds: expect.arrayContaining(['pf2e.pathfinder-bestiary']),
      }),
    );
  });

  it('returns a "no results" message when the search is empty', async () => {
    const api = fakeApi({ searchCompendium: vi.fn().mockResolvedValue({ matches: [] }) });
    const out = await createPreparedCompendium(api).searchMonsters('xyz');
    expect(out).toBe('[No creatures found for "xyz"]');
  });

  it('honors a resolveMonsterPackIds override on each call', async () => {
    const search = vi.fn().mockResolvedValue({ matches: [] });
    const api = fakeApi({ searchCompendium: search });
    // Simulate a Settings → Monsters override: first call sees one pack,
    // second call sees two (e.g. the user ticked another box between
    // calls). The resolver must fire per call, not at factory time.
    let current: readonly string[] = ['pf2e.pathfinder-bestiary'];
    const prepared = createPreparedCompendium(api, {
      resolveMonsterPackIds: () => current,
    });

    await prepared.searchMonsters('a');
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ packIds: ['pf2e.pathfinder-bestiary'] }));

    current = ['pf2e.pathfinder-bestiary', 'pf2e.pathfinder-bestiary-2'];
    await prepared.searchMonsters('b');
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ packIds: ['pf2e.pathfinder-bestiary', 'pf2e.pathfinder-bestiary-2'] }),
    );
  });
});

describe('listMonsters', () => {
  it('fetches all matches with no server-side facet filters (client-side post-filter only)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'A', level: 1 }),
        monsterMatch({ name: 'B', level: 5 }),
        monsterMatch({ name: 'C', level: 9 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    // The server call must NOT receive q / traits / maxLevel — those are
    // applied client-side. Pack selection is the only thing sent over the wire.
    await createPreparedCompendium(api).listMonsters({ levels: [3, 7], traits: ['fire'] });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10000,
        packIds: expect.arrayContaining(['pf2e.pathfinder-bestiary']),
      }),
    );
    const call = search.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('q');
    expect(call).not.toHaveProperty('traits');
    expect(call).not.toHaveProperty('maxLevel');
    expect(call).not.toHaveProperty('documentType');
  });

  // ----- client-side filter regression tests -----
  // These tests cover the bug where facet filters (level, rarity, size, etc.)
  // were accepted by the UI but silently ignored — every filter change left
  // the monster list unchanged.

  it('filters by level range client-side', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'A', level: 1 }),
        monsterMatch({ name: 'B', level: 5 }),
        monsterMatch({ name: 'C', level: 9 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ levels: [3, 7] });
    expect(out.map((s) => s.name)).toEqual(['B']);
  });

  it('filters by rarity client-side (case-insensitive)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Common', rarity: 'common' }),
        monsterMatch({ name: 'Rare', rarity: 'rare' }),
        monsterMatch({ name: 'Uncommon', rarity: 'uncommon' }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ rarities: ['Rare'] });
    expect(out.map((s) => s.name)).toEqual(['Rare']);
  });

  // Rarity filter matrix: each rarity, "all selected", "none selected"
  it.each([
    ['common', ['Common Explicit', 'Common Implicit']],
    ['uncommon', ['Uncommon']],
    ['rare', ['Rare']],
    ['unique', ['Unique']],
  ])('rarity filter "%s" includes only matching monsters', async (rarity, expected) => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Common Explicit', rarity: 'common', level: 1 }),
        monsterMatch({ name: 'Common Implicit', level: 2 }), // no rarity → defaults to 'common'
        monsterMatch({ name: 'Uncommon', rarity: 'uncommon', level: 3 }),
        monsterMatch({ name: 'Rare', rarity: 'rare', level: 4 }),
        monsterMatch({ name: 'Unique', rarity: 'unique', level: 5 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ rarities: [rarity] });
    expect(out.map((s) => s.name)).toEqual(expected);
  });

  it('shows all monsters when no rarity filter is applied (none selected)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Common', rarity: 'common', level: 1 }),
        monsterMatch({ name: 'Uncommon', rarity: 'uncommon', level: 2 }),
        monsterMatch({ name: 'Rare', rarity: 'rare', level: 3 }),
        monsterMatch({ name: 'Unique', rarity: 'unique', level: 4 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({});
    expect(out.map((s) => s.name)).toEqual(['Common', 'Uncommon', 'Rare', 'Unique']);
  });

  it('shows all monsters when all four rarities are selected', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Common', rarity: 'common', level: 1 }),
        monsterMatch({ name: 'Uncommon', rarity: 'uncommon', level: 2 }),
        monsterMatch({ name: 'Rare', rarity: 'rare', level: 3 }),
        monsterMatch({ name: 'Unique', rarity: 'unique', level: 4 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({
      rarities: ['common', 'uncommon', 'rare', 'unique'],
    });
    expect(out.map((s) => s.name)).toEqual(['Common', 'Uncommon', 'Rare', 'Unique']);
  });

  it('filters by size client-side', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Tiny', size: 'tiny' }),
        monsterMatch({ name: 'Large', size: 'large' }),
        monsterMatch({ name: 'Huge', size: 'huge' }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ sizes: ['large', 'huge'] });
    expect(out.map((s) => s.name)).toEqual(['Large', 'Huge']);
  });

  it('filters by creature type client-side (case-insensitive)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'A Dragon', creatureType: 'Dragon' }),
        monsterMatch({ name: 'A Humanoid', creatureType: 'Humanoid' }),
        monsterMatch({ name: 'An Undead', creatureType: 'Undead' }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ creatureTypes: ['humanoid', 'undead'] });
    expect(out.map((s) => s.name)).toEqual(['A Humanoid', 'An Undead']);
  });

  it('filters by traits client-side (all selected traits must be present)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Dragon', traits: ['dragon', 'fire'] }),
        monsterMatch({ name: 'Fire Elemental', traits: ['fire', 'elemental'] }),
        monsterMatch({ name: 'Goblin', traits: ['humanoid', 'goblin'] }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    // Only the dragon has BOTH dragon AND fire traits
    const out = await createPreparedCompendium(api).listMonsters({ traits: ['dragon', 'fire'] });
    expect(out.map((s) => s.name)).toEqual(['Dragon']);
  });

  it('filters by source client-side', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'A', source: 'Bestiary' }),
        monsterMatch({ name: 'B', source: 'Bestiary 2' }),
        monsterMatch({ name: 'C', source: 'Monster Core' }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ sources: ['Bestiary', 'Monster Core'] });
    expect(out.map((s) => s.name)).toEqual(['A', 'C']);
  });

  it('filters by hp range client-side', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Weak', hp: 20 }),
        monsterMatch({ name: 'Medium', hp: 100 }),
        monsterMatch({ name: 'Strong', hp: 300 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ hpMin: 50, hpMax: 200 });
    expect(out.map((s) => s.name)).toEqual(['Medium']);
  });

  it('stacks keyword + facet filters (AND semantics across filter types)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Young Red Dragon', level: 10, rarity: 'uncommon', traits: ['dragon', 'fire'] }),
        monsterMatch({ name: 'Young Blue Dragon', level: 10, rarity: 'rare', traits: ['dragon', 'electricity'] }),
        monsterMatch({ name: 'Ancient Red Dragon', level: 19, rarity: 'uncommon', traits: ['dragon', 'fire'] }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    // keyword 'young' + levels [1,15] + rarities ['uncommon'] → only Young Red Dragon
    const out = await createPreparedCompendium(api).listMonsters({
      keywords: 'young',
      levels: [1, 15],
      rarities: ['uncommon'],
    });
    expect(out.map((s) => s.name)).toEqual(['Young Red Dragon']);
  });

  it('filters matches client-side by keyword (name substring)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Young Red Dragon', traits: ['dragon', 'fire'] }),
        monsterMatch({ name: 'Goblin Warrior', traits: ['humanoid', 'goblin'] }),
        monsterMatch({ name: 'Ancient Brass Dragon', traits: ['dragon', 'fire'] }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ keywords: 'brass' });
    expect(out.map((s) => s.name)).toEqual(['Ancient Brass Dragon']);
    // No `q` on the wire — filter is purely client-side.
    const call = search.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('q');
  });

  it('filters matches client-side by keyword (trait substring)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Goblin Warrior', traits: ['humanoid', 'goblin'] }),
        monsterMatch({ name: 'Young Red Dragon', traits: ['dragon', 'fire'] }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ keywords: 'fire' });
    expect(out.map((s) => s.name)).toEqual(['Young Red Dragon']);
  });

  it('requires every whitespace-tokenized keyword to match (AND semantics)', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'Young Red Dragon', traits: [] }),
        monsterMatch({ name: 'Young Brass Dragon', traits: [] }),
        monsterMatch({ name: 'Ancient Red Dragon', traits: [] }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ keywords: 'young red' });
    expect(out.map((s) => s.name)).toEqual(['Young Red Dragon']);
  });

  it('is case-insensitive and tolerates leading/trailing whitespace', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [monsterMatch({ name: 'Young Red Dragon', traits: [] })],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ keywords: '  DRAGON  ' });
    expect(out.map((s) => s.name)).toEqual(['Young Red Dragon']);
  });

  it('honors the sort request (name ascending) when supplied', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        monsterMatch({ name: 'C', level: 9 }),
        monsterMatch({ name: 'A', level: 1 }),
        monsterMatch({ name: 'B', level: 5 }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({ sortBy: 'name', sortDir: 'asc' });
    expect(out.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('returns empty for an empty match list', async () => {
    const api = fakeApi();
    const out = await createPreparedCompendium(api).listMonsters({});
    expect(out).toEqual([]);
  });

  it('surfaces hp/ac/saves from enriched matches (cache-warm path)', async () => {
    // Regression test: previously monsterMatchToSummary ignored these fields
    // and every grid chip showed HP 0 / AC 0 / F +0 / R +0 / W +0.
    const enriched: CompendiumMatch = {
      ...monsterMatch(),
      hp: 180,
      ac: 30,
      fort: 20,
      ref: 18,
      will: 17,
      rarity: 'uncommon',
      size: 'huge',
      creatureType: 'Dragon',
    };
    const search = vi.fn().mockResolvedValue({ matches: [enriched] });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).listMonsters({});
    expect(out).toHaveLength(1);
    expect(out[0].hp).toBe(180);
    expect(out[0].ac).toBe(30);
    expect(out[0].fort).toBe(20);
    expect(out[0].ref).toBe(18);
    expect(out[0].will).toBe(17);
    expect(out[0].rarity).toBe('uncommon');
    expect(out[0].size).toBe('huge');
    expect(out[0].creatureType).toBe('Dragon');
  });
});

describe('getMonsterByName', () => {
  it('prefers the exact case-insensitive name match over the top fuzzy hit', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [monsterMatch({ name: 'Young Red Dragon Spawn', uuid: 'u1' }), monsterMatch({ uuid: 'u2' })],
    });
    const get = vi.fn().mockResolvedValue({ document: doc({ name: 'Young Red Dragon' }), stale: false });
    const api = fakeApi({ searchCompendium: search, getCompendiumDocument: get });
    const out = await createPreparedCompendium(api).getMonsterByName('young red dragon');
    expect(out).not.toBeNull();
    expect(get).toHaveBeenCalledWith('u2');
  });

  it('returns null when nothing matches', async () => {
    const api = fakeApi();
    const out = await createPreparedCompendium(api).getMonsterByName('not-here');
    expect(out).toBeNull();
  });
});

describe('getMonsterPreview', () => {
  it('strips a URL-like input back to a name segment before searching', async () => {
    const search = vi.fn().mockResolvedValue({ matches: [monsterMatch()] });
    const get = vi.fn().mockResolvedValue({ document: doc({ name: 'Young Red Dragon' }), stale: false });
    const api = fakeApi({ searchCompendium: search, getCompendiumDocument: get });
    await createPreparedCompendium(api).getMonsterPreview('https://2e.aonprd.com/Monsters.aspx?ID=young-red-dragon');
    // searchCompendium should have been called with the last path segment,
    // underscores/dashes replaced with spaces.
    const args = search.mock.calls[0][0];
    expect(args.q.toLowerCase()).toContain('young red dragon');
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describe('searchItems', () => {
  it('returns a formatted block for each match', async () => {
    const search = vi.fn().mockResolvedValue({ matches: [itemMatch()] });
    const get = vi.fn().mockResolvedValue({
      document: doc({
        name: 'Potion of Healing',
        type: 'consumable',
        system: {
          level: { value: 3 },
          publication: { title: 'Player Core' },
          traits: { value: ['magical', 'healing'] },
          price: { value: { gp: 12 } },
          bulk: { value: 0.1 },
          usage: { value: 'held in 1 hand' },
          description: { value: '<p>A vial of glowing red liquid.</p>' },
        },
      }),
      stale: false,
    });
    const api = fakeApi({ searchCompendium: search, getCompendiumDocument: get });
    const out = await createPreparedCompendium(api).searchItems('potion');
    expect(out).toContain('Item Result 1: Potion of Healing');
    expect(out).toContain('Price: 12 gp');
  });

  it('returns empty message when nothing matches', async () => {
    const api = fakeApi();
    const out = await createPreparedCompendium(api).searchItems('nope');
    expect(out).toBe('[No items found for "nope"]');
  });
});

describe('searchItemsBrowser', () => {
  it('maps matches to rows and sorts by name by default', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [itemMatch({ name: 'Zephyr', documentId: 'z' }), itemMatch({ name: 'Amulet', documentId: 'a' })],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).searchItemsBrowser({});
    expect(out.map((r) => r.id)).toEqual(['a', 'z']);
  });

  it('filters by rarity client-side', async () => {
    const search = vi.fn().mockResolvedValue({
      matches: [
        itemMatch({ name: 'Common Item', traits: ['item'], documentId: 'c' }),
        itemMatch({ name: 'Rare Item', traits: ['item', 'RARE'], documentId: 'r' }),
      ],
    });
    const api = fakeApi({ searchCompendium: search });
    const out = await createPreparedCompendium(api).searchItemsBrowser({ rarities: ['RARE'] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r');
  });
});

describe('getItemBrowserDetail', () => {
  it('resolves the id to a compendium uuid', async () => {
    const get = vi.fn().mockResolvedValue({ document: doc({ type: 'equipment' }), stale: false });
    const api = fakeApi({ getCompendiumDocument: get });
    await createPreparedCompendium(api).getItemBrowserDetail('pot42');
    expect(get).toHaveBeenCalledWith('Compendium.pf2e.equipment-srd.Item.pot42');
  });

  it('returns null when the document fetch throws', async () => {
    const get = vi.fn().mockRejectedValue(new Error('not found'));
    const api = fakeApi({ getCompendiumDocument: get });
    const out = await createPreparedCompendium(api).getItemBrowserDetail('ghost');
    expect(out).toBeNull();
  });
});

describe('buildLootShortlist', () => {
  it('filters to party level ±2 and samples up to 80', async () => {
    const matches: CompendiumMatch[] = [];
    // Level out of range
    matches.push(itemMatch({ level: 1, documentId: 'low' }));
    for (let i = 0; i < 100; i++) {
      matches.push(itemMatch({ level: 5, documentId: `mid-${i.toString()}` }));
    }
    matches.push(itemMatch({ level: 10, documentId: 'high' }));
    const search = vi.fn().mockResolvedValue({ matches });
    const api = fakeApi({ searchCompendium: search });

    const out = await createPreparedCompendium(api).buildLootShortlist(5);
    expect(out).toHaveLength(80);
    // Everything we returned should be in the level-3..7 window
    for (const row of out) {
      expect(row.level).toBe(5);
    }
    // The server got called with maxLevel = level+2
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentType: 'Item', maxLevel: 7 }));
  });

  it('returns empty when there are no items in range', async () => {
    const api = fakeApi();
    const out = await createPreparedCompendium(api).buildLootShortlist(1);
    expect(out).toEqual([]);
  });
});
