import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CompendiumCache, type CompendiumDocument, type SendCommand } from '../src/http/compendium-cache.js';

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
