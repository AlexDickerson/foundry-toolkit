// Unit coverage for the facets aggregator. Exercises the pure-fold logic
// against a curated match set plus the singleton cache behaviour.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumApi } from './index';
import type { CompendiumMatch } from './types';
import { __internal, getItemFacetsIndex, getMonsterFacetsIndex, resetFacetsIndex } from './facets-index';

function monsterMatch(over: Partial<CompendiumMatch> = {}): CompendiumMatch {
  return {
    packId: 'pf2e.pathfinder-bestiary',
    packLabel: 'PF2e Bestiary',
    documentId: 'x',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.x',
    name: 'Something',
    type: 'npc',
    img: '',
    level: 1,
    traits: [],
    ...over,
  };
}

function itemMatch(over: Partial<CompendiumMatch> = {}): CompendiumMatch {
  return {
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: 'x',
    uuid: 'Compendium.pf2e.equipment-srd.Item.x',
    name: 'Thing',
    type: 'equipment',
    img: '',
    level: 1,
    traits: [],
    ...over,
  };
}

function fakeApi(searchResult: CompendiumMatch[], sources: { title: string; count: number }[] = []): CompendiumApi {
  return {
    searchCompendium: vi.fn().mockResolvedValue({ matches: searchResult }),
    getCompendiumDocument: vi.fn(),
    listCompendiumPacks: vi.fn().mockResolvedValue({ packs: [] }),
    listCompendiumSources: vi.fn().mockResolvedValue({ sources }),
    ensureCompendiumPack: vi.fn(),
    createCompendiumItem: vi.fn(),
    invalidateDocument: vi.fn(),
    invalidateAllDocuments: vi.fn(),
  };
}

beforeEach(() => {
  resetFacetsIndex();
});

// ---------------------------------------------------------------------------
// Pure folds
// ---------------------------------------------------------------------------

describe('aggregateMonsterFacets', () => {
  it('partitions traits into rarity / size / creature-type / other buckets', () => {
    // rarity comes from m.rarity (MCP server reads system.traits.rarity scalar),
    // not from the traits value array.
    const out = __internal.aggregateMonsterFacets([
      monsterMatch({ level: 1, rarity: 'common', traits: ['large', 'dragon', 'fire'] }),
      monsterMatch({ level: 5, rarity: 'uncommon', traits: ['huge', 'dragon', 'amphibious'] }),
      monsterMatch({ level: 10, rarity: 'rare', traits: ['medium', 'humanoid', 'aquatic'] }),
    ]);
    expect(out.rarities).toEqual(['common', 'uncommon', 'rare']);
    expect(out.sizes).toEqual(['huge', 'large', 'medium']);
    expect(out.creatureTypes).toEqual(['Dragon', 'Humanoid']);
    expect(out.traits.sort()).toEqual(['amphibious', 'aquatic', 'fire']);
    expect(out.levelRange).toEqual([1, 10]);
  });

  it('always includes "common" even when no rows carry the tag', () => {
    const out = __internal.aggregateMonsterFacets([monsterMatch({ traits: ['dragon'] })]);
    expect(out.rarities).toContain('common');
  });

  it('reads all four rarities from m.rarity (the MCP server field)', () => {
    const out = __internal.aggregateMonsterFacets([
      monsterMatch({ rarity: 'unique', traits: ['dragon'] }),
      monsterMatch({ rarity: 'common', traits: ['humanoid'] }),
      monsterMatch({ rarity: 'uncommon', traits: ['fiend'] }),
      monsterMatch({ rarity: 'rare', traits: ['undead'] }),
    ]);
    expect(out.rarities).toEqual(['common', 'uncommon', 'rare', 'unique']);
    expect(out.traits).not.toContain('unique');
    expect(out.traits).not.toContain('common');
  });

  it('produces a zero range when no rows have a level', () => {
    const out = __internal.aggregateMonsterFacets([]);
    expect(out.levelRange).toEqual([0, 0]);
  });
});

describe('aggregateItemFacets', () => {
  it('keeps the top-50 traits by frequency, drops rarity traits', () => {
    const matches: CompendiumMatch[] = [];
    for (let i = 0; i < 5; i++) matches.push(itemMatch({ traits: ['magical', 'COMMON'] }));
    for (let i = 0; i < 3; i++) matches.push(itemMatch({ traits: ['consumable'] }));
    matches.push(itemMatch({ traits: ['alchemical', 'UNCOMMON'] }));
    const out = __internal.aggregateItemFacets(matches);
    expect(out.traits[0]).toBe('MAGICAL');
    expect(out.traits).toContain('CONSUMABLE');
    expect(out.traits).toContain('ALCHEMICAL');
    expect(out.traits).not.toContain('COMMON');
    expect(out.traits).not.toContain('UNCOMMON');
  });

  it('seeds the canonical usage buckets', () => {
    const out = __internal.aggregateItemFacets([]);
    expect(out.usageCategories).toEqual(expect.arrayContaining(['Held', 'Worn', 'Other']));
  });
});

describe('bucketUsage', () => {
  it('buckets known prefixes', () => {
    expect(__internal.bucketUsage('held in 1 hand')).toBe('Held');
    expect(__internal.bucketUsage('worn cloak')).toBe('Worn');
    expect(__internal.bucketUsage('etched onto armor')).toBe('Etched');
    expect(__internal.bucketUsage('carried')).toBe('Carried');
    expect(__internal.bucketUsage('weird free-form')).toBe('Other');
    expect(__internal.bucketUsage(null)).toBe('Other');
  });
});

// ---------------------------------------------------------------------------
// Public accessors — singleton + integration
// ---------------------------------------------------------------------------

describe('getMonsterFacetsIndex', () => {
  it('fetches once, then serves from cache on subsequent calls', async () => {
    const api = fakeApi([monsterMatch({ traits: ['dragon', 'common'], level: 2 })]);
    const a = await getMonsterFacetsIndex(api);
    const b = await getMonsterFacetsIndex(api);
    expect(a).toBe(b);
    expect(api.searchCompendium).toHaveBeenCalledTimes(1);
    expect(a.creatureTypes).toContain('Dragon');
  });

  it('swallows a listCompendiumSources failure and keeps sources empty', async () => {
    const api = fakeApi([monsterMatch({ level: 1 })]);
    (api.listCompendiumSources as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const out = await getMonsterFacetsIndex(api);
    expect(out.sources).toEqual([]);
  });

  it('uses listCompendiumSources to populate sources when available', async () => {
    const api = fakeApi(
      [monsterMatch({ level: 1 })],
      [
        { title: 'Bestiary 1', count: 100 },
        { title: 'Bestiary 3', count: 50 },
      ],
    );
    const out = await getMonsterFacetsIndex(api);
    expect(out.sources).toEqual(['Bestiary 1', 'Bestiary 3']);
  });
});

describe('getItemFacetsIndex', () => {
  it('returns a populated ItemFacets from a single search call', async () => {
    const api = fakeApi([itemMatch({ traits: ['magical', 'rare'] }), itemMatch({ traits: ['magical', 'invested'] })]);
    const out = await getItemFacetsIndex(api);
    expect(out.traits).toContain('MAGICAL');
    expect(out.traits).toContain('INVESTED');
    expect(out.usageCategories.length).toBeGreaterThan(0);
  });
});
