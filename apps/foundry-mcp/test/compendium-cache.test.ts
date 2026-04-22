import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CompendiumCache, type CompendiumDocument, type SendCommand } from '../src/http/compendium-cache.js';

// Synthetic bestiary pack — covers every NPC facet branch: a common
// humanoid, an uncommon beast at medium size, a rare dragon at huge
// size, plus a deliberate odd `size.value` to ensure the extractor
// takes what pf2e gives us rather than normalising.
const bestiaryDocs: CompendiumDocument[] = [
  {
    id: 'goblin-warrior',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.goblin-warrior',
    name: 'Goblin Warrior',
    type: 'npc',
    img: '/icons/goblin.webp',
    system: {
      details: { level: { value: -1 } },
      traits: {
        rarity: 'common',
        size: { value: 'sm' },
        value: ['humanoid', 'goblin'],
      },
      publication: { title: 'Pathfinder Bestiary' },
    },
  },
  {
    id: 'giant-centipede',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.giant-centipede',
    name: 'Giant Centipede',
    type: 'npc',
    img: '/icons/centipede.webp',
    system: {
      details: { level: { value: 1 } },
      traits: {
        rarity: 'uncommon',
        size: { value: 'med' },
        value: ['animal', 'beast'],
      },
      publication: { title: 'Pathfinder Bestiary' },
    },
  },
  {
    id: 'adult-red-dragon',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.adult-red-dragon',
    name: 'Adult Red Dragon',
    type: 'npc',
    img: '/icons/dragon.webp',
    system: {
      details: { level: { value: 14 } },
      traits: {
        rarity: 'rare',
        size: { value: 'huge' },
        value: ['dragon', 'fire'],
      },
      publication: { title: 'Pathfinder Bestiary' },
    },
  },
];

// Equipment fixture with usage/rarity/traits/sources variety — drives
// the item-flavoured facet tests. Deliberately mixes worn-*, held-*,
// and affixed-* prefixes plus one uncategorisable slug to exercise the
// `'other'` bucket.
const equipmentFacetDocs: CompendiumDocument[] = [
  {
    id: 'longsword',
    uuid: 'Compendium.pf2e.equipment-srd.Item.longsword',
    name: 'Longsword',
    type: 'weapon',
    img: '/icons/longsword.webp',
    system: {
      level: { value: 0 },
      traits: { rarity: 'common', value: ['versatile-p'] },
      publication: { title: 'Player Core' },
      usage: { value: 'held-in-one-hand' },
      price: { value: { gp: 1 } },
    },
  },
  {
    id: 'amulet-of-undying',
    uuid: 'Compendium.pf2e.equipment-srd.Item.amulet-of-undying',
    name: 'Amulet of Undying',
    type: 'equipment',
    img: '/icons/amulet.webp',
    system: {
      level: { value: 19 },
      traits: { rarity: 'rare', value: ['invested', 'magical', 'necromancy'] },
      publication: { title: 'Gamemastery Guide' },
      usage: { value: 'worn-necklace' },
      price: { value: { gp: 8000 } },
    },
  },
  {
    id: 'striking-rune',
    uuid: 'Compendium.pf2e.equipment-srd.Item.striking-rune',
    name: 'Striking Rune',
    type: 'weapon',
    img: '/icons/rune.webp',
    system: {
      level: { value: 4 },
      traits: { rarity: 'uncommon', value: ['magical', 'transmutation'] },
      publication: { title: 'Player Core' },
      usage: { value: 'affixed-to-a-weapon' },
      price: { value: { gp: 65 } },
    },
  },
  {
    id: 'bag-of-holding',
    uuid: 'Compendium.pf2e.equipment-srd.Item.bag-of-holding',
    name: 'Bag of Holding',
    type: 'equipment',
    img: '/icons/bag.webp',
    system: {
      level: { value: 4 },
      traits: { rarity: 'common', value: ['extradimensional', 'magical'] },
      publication: { title: 'Player Core' },
      usage: { value: 'carried' },
      price: { value: { gp: 75 } },
    },
  },
];

// Synthetic equipment pack — just enough items to exercise every
// filter branch (tokens, traits, anyTraits, maxLevel, sources, price).
const equipmentDocs: CompendiumDocument[] = [
  {
    id: 'javelin',
    uuid: 'Compendium.pf2e.equipment-srd.Item.javelin',
    name: 'Javelin',
    type: 'weapon',
    img: '/icons/javelin.webp',
    system: {
      level: { value: 0 },
      traits: { value: ['thrown-30', 'agile'] },
      publication: { title: 'Player Core' },
      price: { value: { sp: 1 } },
    },
  },
  {
    id: 'bastard-sword',
    uuid: 'Compendium.pf2e.equipment-srd.Item.bastard-sword',
    name: 'Bastard Sword',
    type: 'weapon',
    img: '/icons/bastard-sword.webp',
    system: {
      level: { value: 0 },
      traits: { value: ['two-hand-d12'] },
      publication: { title: 'Player Core' },
      price: { value: { gp: 4 } },
    },
  },
  {
    id: 'greater-healing-potion',
    uuid: 'Compendium.pf2e.equipment-srd.Item.greater-healing-potion',
    name: 'Healing Potion (Greater)',
    type: 'consumable',
    img: '/icons/potion.webp',
    system: {
      level: { value: 6 },
      traits: { value: ['consumable', 'healing', 'potion'] },
      publication: { title: 'Player Core' },
      price: { value: { gp: 40 } },
    },
  },
  {
    id: 'backpack',
    uuid: 'Compendium.pf2e.equipment-srd.Item.backpack',
    name: 'Backpack',
    type: 'backpack',
    img: '/icons/backpack.webp',
    system: {
      level: { value: 0 },
      traits: { value: [] },
      publication: { title: 'Player Core' },
      price: { value: { sp: 1 } },
    },
  },
];

// Default mock uses the bulk `dump-compendium-pack` command — the
// path used by any current bridge build.
function makeSendCommand(): SendCommand {
  return async (type, params) => {
    if (type === 'dump-compendium-pack') {
      const packId = String(params?.['packId'] ?? '');
      return { packId, packLabel: 'Equipment', documents: equipmentDocs };
    }
    if (type === 'find-in-compendium') {
      const packId = String(params?.['packId'] ?? '');
      return {
        matches: equipmentDocs.map((d) => ({
          packId,
          packLabel: 'Equipment',
          documentId: d.id,
          uuid: d.uuid,
          name: d.name,
          type: d.type,
          img: d.img,
        })),
      };
    }
    if (type === 'get-compendium-document') {
      const uuid = String(params?.['uuid'] ?? '');
      const doc = equipmentDocs.find((d) => d.uuid === uuid);
      if (!doc) throw new Error(`doc not found: ${uuid}`);
      return { document: doc };
    }
    throw new Error(`unexpected command: ${type}`);
  };
}

// Legacy bridge that doesn't know about dump-compendium-pack — forces
// the fallback path (find-in-compendium + per-doc get).
function makeLegacySendCommand(): SendCommand {
  return async (type, params) => {
    if (type === 'dump-compendium-pack') {
      throw new Error('No handler registered for command: dump-compendium-pack');
    }
    return makeSendCommand()(type, params);
  };
}

async function makeWarmCache(): Promise<CompendiumCache> {
  const cache = new CompendiumCache(makeSendCommand());
  await cache.warmPack('pf2e.equipment-srd');
  return cache;
}

describe('CompendiumCache — warm + getDocument', () => {
  it('populates the cache and serves documents on hit', async () => {
    const cache = await makeWarmCache();
    const javelin = cache.getDocument('Compendium.pf2e.equipment-srd.Item.javelin');
    assert.equal(javelin?.name, 'Javelin');
  });

  it('returns null for documents outside cached packs', async () => {
    const cache = await makeWarmCache();
    assert.equal(cache.getDocument('Compendium.pf2e.spells-srd.Item.fireball'), null);
  });

  it('reports stats after warm', async () => {
    const cache = await makeWarmCache();
    const s = cache.stats();
    assert.equal(s.packs.length, 1);
    assert.equal(s.docs, equipmentDocs.length);
    assert.ok(s.bytes > 0);
  });

  it('is idempotent — warming twice doesn\'t double-fetch', async () => {
    const cache = new CompendiumCache(makeSendCommand());
    await Promise.all([cache.warmPack('pf2e.equipment-srd'), cache.warmPack('pf2e.equipment-srd')]);
    assert.equal(cache.stats().warmings, 1);
  });

  it('falls back to per-document fetching when dump-compendium-pack is absent', async () => {
    let dumpCalls = 0;
    let findCalls = 0;
    let docCalls = 0;
    const legacy: SendCommand = async (type, params) => {
      if (type === 'dump-compendium-pack') {
        dumpCalls++;
        throw new Error('No handler registered for command: dump-compendium-pack');
      }
      if (type === 'find-in-compendium') {
        findCalls++;
        return makeSendCommand()(type, params);
      }
      if (type === 'get-compendium-document') {
        docCalls++;
        return makeSendCommand()(type, params);
      }
      throw new Error(`unexpected ${type}`);
    };
    const cache = new CompendiumCache(legacy);
    await cache.warmPack('pf2e.equipment-srd');
    assert.equal(dumpCalls, 1, 'dump was attempted');
    assert.equal(findCalls, 1, 'fell back to find-in-compendium for the index');
    assert.equal(docCalls, equipmentDocs.length, 'fetched each doc individually');
    // Sanity — same search results regardless of warm path.
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'bastard' });
    assert.equal(result?.matches[0]?.name, 'Bastard Sword');
  });

  it('issues a single dump-compendium-pack on the fast path', async () => {
    let dumpCalls = 0;
    let otherCalls = 0;
    const fast: SendCommand = async (type, params) => {
      if (type === 'dump-compendium-pack') {
        dumpCalls++;
        return makeSendCommand()(type, params);
      }
      otherCalls++;
      return makeSendCommand()(type, params);
    };
    const cache = new CompendiumCache(fast);
    await cache.warmPack('pf2e.equipment-srd');
    assert.equal(dumpCalls, 1);
    assert.equal(otherCalls, 0, 'no per-doc fallback on the fast path');
  });
});

describe('CompendiumCache — legacy bridge', () => {
  it('search results match regardless of warm path', async () => {
    const fastCache = new CompendiumCache(makeSendCommand());
    await fastCache.warmPack('pf2e.equipment-srd');
    const fastMatches = fastCache.search({ packIds: ['pf2e.equipment-srd'] })?.matches.map((m) => m.name);

    const legacyCache = new CompendiumCache(makeLegacySendCommand());
    await legacyCache.warmPack('pf2e.equipment-srd');
    const legacyMatches = legacyCache.search({ packIds: ['pf2e.equipment-srd'] })?.matches.map((m) => m.name);

    assert.deepEqual(fastMatches, legacyMatches);
  });
});

describe('CompendiumCache.search — filters', () => {
  let cache: CompendiumCache;
  beforeEach(async () => {
    cache = await makeWarmCache();
  });

  it('returns null when no matching packs are cached (caller falls through)', () => {
    const result = cache.search({ packIds: ['pf2e.spells-srd'] });
    assert.equal(result, null);
  });

  it('returns all items when no filters are set', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'] });
    assert.equal(result?.matches.length, equipmentDocs.length);
  });

  it('narrows to name tokens (q)', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'potion' });
    assert.equal(result?.matches.length, 1);
    assert.equal(result?.matches[0]?.name, 'Healing Potion (Greater)');
  });

  it('matches tokens against traits as a fallback', () => {
    // "thrown" is in javelin's traits, not its name.
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'thrown' });
    assert.equal(result?.matches.length, 1);
    assert.equal(result?.matches[0]?.name, 'Javelin');
  });

  it('filters by required traits (AND)', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], traits: ['consumable', 'healing'] });
    assert.equal(result?.matches.length, 1);
    assert.equal(result?.matches[0]?.name, 'Healing Potion (Greater)');
  });

  it('filters by maxLevel', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], maxLevel: 1 });
    const names = result?.matches.map((m) => m.name);
    assert.ok(!names?.includes('Healing Potion (Greater)'), 'L6 potion should be excluded by maxLevel=1');
    assert.ok(names?.includes('Javelin'));
  });

  it('filters by source', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], sources: ['Player Core'] });
    assert.equal(result?.matches.length, equipmentDocs.length);
    const emptyResult = cache.search({ packIds: ['pf2e.equipment-srd'], sources: ['Gamemastery Guide'] });
    assert.equal(emptyResult?.matches.length, 0);
  });

  it('respects limit', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], limit: 2 });
    assert.equal(result?.matches.length, 2);
  });

  it('enriches matches with price read from the cached document', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'bastard' });
    const sword = result?.matches[0];
    assert.deepEqual(sword?.price, { value: { gp: 4 } });
  });

  it('sorts alphabetically when no query is present', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'] });
    const names = result?.matches.map((m) => m.name) ?? [];
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  it('ranks exact-name matches above substring matches', () => {
    // Both "Bastard Sword" and "Healing Potion (Greater)" contain a
    // space-separated token "sword" vs "healing" — exact-single-token
    // match on "Bastard" should beat it.
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'bastard' });
    assert.equal(result?.matches[0]?.name, 'Bastard Sword');
  });
});

describe('CompendiumCache.facets', () => {
  // Mocks that expose a bestiary and an equipment pack side by side so
  // the cross-pack / documentType-filter tests have real data to chew
  // on. Mirrors `makeSendCommand` above but keyed by packId.
  function makeMultiPackSendCommand(): SendCommand {
    return async (type, params) => {
      if (type !== 'dump-compendium-pack') throw new Error(`unexpected command: ${type}`);
      const packId = String(params?.['packId'] ?? '');
      if (packId === 'pf2e.pathfinder-bestiary') {
        return { packId, packLabel: 'Pathfinder Bestiary', documents: bestiaryDocs };
      }
      if (packId === 'pf2e.equipment-srd') {
        return { packId, packLabel: 'Equipment', documents: equipmentFacetDocs };
      }
      throw new Error(`unknown pack: ${packId}`);
    };
  }

  it('returns null when the cache is empty', () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    assert.equal(cache.facets(), null);
  });

  it('aggregates bestiary facets from the warmed pack', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await cache.warmPack('pf2e.pathfinder-bestiary');
    const facets = cache.facets({ packIds: ['pf2e.pathfinder-bestiary'] });
    assert.ok(facets, 'facets should be returned for a warmed pack');
    assert.deepEqual(facets.rarities, ['common', 'rare', 'uncommon']);
    assert.deepEqual(facets.sizes, ['huge', 'med', 'sm']);
    assert.deepEqual(facets.creatureTypes, ['animal', 'dragon', 'humanoid']);
    assert.ok(facets.traits.includes('goblin'));
    assert.ok(facets.traits.includes('fire'));
    assert.deepEqual(facets.sources, ['Pathfinder Bestiary']);
    assert.deepEqual(facets.levelRange, [-1, 14]);
    // Bestiary actors don't carry `system.usage`, so the bucket stays empty.
    assert.deepEqual(facets.usageCategories, []);
  });

  it('aggregates equipment facets including bucketed usage categories', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await cache.warmPack('pf2e.equipment-srd');
    const facets = cache.facets({ packIds: ['pf2e.equipment-srd'] });
    assert.ok(facets);
    assert.deepEqual(facets.rarities, ['common', 'rare', 'uncommon']);
    assert.ok(facets.traits.includes('magical'));
    assert.ok(facets.traits.includes('versatile-p'));
    assert.deepEqual(facets.sources, ['Gamemastery Guide', 'Player Core']);
    // held-in-one-hand → 'held', worn-necklace → 'worn',
    // affixed-to-a-weapon → 'affixed', carried → 'other'. Alphabetical.
    assert.deepEqual(facets.usageCategories, ['affixed', 'held', 'other', 'worn']);
    // Items never carry a creature-type trait.
    assert.deepEqual(facets.creatureTypes, []);
    // Items don't set `system.traits.size` → sizes stays empty here.
    assert.deepEqual(facets.sizes, []);
  });

  it('filters the docList by documentType', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await Promise.all([
      cache.warmPack('pf2e.pathfinder-bestiary'),
      cache.warmPack('pf2e.equipment-srd'),
    ]);
    const npcFacets = cache.facets({ documentType: 'npc' });
    assert.ok(npcFacets);
    // Narrowed to NPCs: creature types present, no equipment traits,
    // no usage buckets.
    assert.deepEqual(npcFacets.creatureTypes, ['animal', 'dragon', 'humanoid']);
    assert.deepEqual(npcFacets.usageCategories, []);
    assert.equal(npcFacets.sources.length, 1);
    assert.deepEqual(npcFacets.sources, ['Pathfinder Bestiary']);
  });

  it('restricts aggregation to the requested packIds', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await Promise.all([
      cache.warmPack('pf2e.pathfinder-bestiary'),
      cache.warmPack('pf2e.equipment-srd'),
    ]);
    const onlyEquipment = cache.facets({ packIds: ['pf2e.equipment-srd'] });
    assert.ok(onlyEquipment);
    assert.deepEqual(onlyEquipment.creatureTypes, [], 'equipment pack has no creature types');
    assert.deepEqual(onlyEquipment.sources, ['Gamemastery Guide', 'Player Core']);

    // Omitting packIds falls back to "all cached packs" → merged sources.
    const allCached = cache.facets();
    assert.ok(allCached);
    assert.deepEqual(allCached.sources, ['Gamemastery Guide', 'Pathfinder Bestiary', 'Player Core']);
  });

  it('returns alphabetically sorted arrays', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await Promise.all([
      cache.warmPack('pf2e.pathfinder-bestiary'),
      cache.warmPack('pf2e.equipment-srd'),
    ]);
    const facets = cache.facets();
    assert.ok(facets);
    for (const key of ['rarities', 'sizes', 'creatureTypes', 'traits', 'sources', 'usageCategories'] as const) {
      const arr = facets[key];
      assert.deepEqual(arr, [...arr].sort((a, b) => a.localeCompare(b)), `${key} not sorted`);
    }
  });

  it('returns null when any requested pack is not warmed', async () => {
    const cache = new CompendiumCache(makeMultiPackSendCommand());
    await cache.warmPack('pf2e.pathfinder-bestiary');
    // Equipment pack not yet warmed → cold-call signal.
    assert.equal(cache.facets({ packIds: ['pf2e.equipment-srd'] }), null);
  });
});
