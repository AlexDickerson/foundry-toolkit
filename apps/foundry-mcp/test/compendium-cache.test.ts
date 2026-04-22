import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CompendiumCache, type CompendiumDocument, type SendCommand } from '../src/http/compendium-cache.js';

// Synthetic equipment pack — just enough items to exercise every
// filter branch (tokens, traits, anyTraits, maxLevel, sources, price,
// rarity/size/usage/isMagical).
const equipmentDocs: CompendiumDocument[] = [
  {
    id: 'javelin',
    uuid: 'Compendium.pf2e.equipment-srd.Item.javelin',
    name: 'Javelin',
    type: 'weapon',
    img: '/icons/javelin.webp',
    system: {
      level: { value: 0 },
      traits: { value: ['thrown-30', 'agile'], rarity: 'common' },
      publication: { title: 'Player Core' },
      price: { value: { sp: 1 } },
      usage: { value: 'held-in-one-hand' },
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
      traits: { value: ['two-hand-d12'], rarity: 'common' },
      publication: { title: 'Player Core' },
      price: { value: { gp: 4 } },
      usage: { value: 'held-in-one-hand' },
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
      traits: { value: ['consumable', 'healing', 'potion', 'magical'], rarity: 'common' },
      publication: { title: 'Player Core' },
      price: { value: { gp: 40 } },
      usage: { value: 'held-in-one-hand' },
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
      traits: { value: [], rarity: 'common' },
      publication: { title: 'Player Core' },
      price: { value: { sp: 1 } },
      usage: { value: 'worn-backpack' },
    },
  },
  {
    id: 'amulet-of-mighty-fists',
    uuid: 'Compendium.pf2e.equipment-srd.Item.amulet-of-mighty-fists',
    name: 'Amulet of Mighty Fists',
    type: 'equipment',
    img: '/icons/amulet.webp',
    system: {
      level: { value: 8 },
      traits: { value: ['invested', 'magical'], rarity: 'uncommon' },
      publication: { title: 'Treasure Vault' },
      price: { value: { gp: 450 } },
      usage: { value: 'worn-amulet' },
    },
  },
];

// Synthetic bestiary pack — enough NPC actors to exercise the
// monster-only filters (rarity, size, creatureType, combat-stat
// ranges). All three creatures level 1-3 with distinct sizes and
// creature types so filter combinations pick out exactly one.
const bestiaryDocs: CompendiumDocument[] = [
  {
    id: 'goblin-warrior',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.goblin-warrior',
    name: 'Goblin Warrior',
    type: 'npc',
    img: '/icons/goblin.webp',
    system: {
      details: { level: { value: -1 }, publication: { title: 'Pathfinder Bestiary' } },
      publication: { title: 'Pathfinder Bestiary' },
      traits: { value: ['humanoid', 'goblin'], rarity: 'common', size: { value: 'sm' } },
      attributes: { hp: { max: 6 }, ac: { value: 16 } },
      saves: { fortitude: { value: 5 }, reflex: { value: 7 }, will: { value: 3 } },
    },
  },
  {
    id: 'young-red-dragon',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.young-red-dragon',
    name: 'Young Red Dragon',
    type: 'npc',
    img: '/icons/dragon.webp',
    system: {
      details: { level: { value: 10 }, publication: { title: 'Pathfinder Bestiary' } },
      publication: { title: 'Pathfinder Bestiary' },
      traits: { value: ['dragon', 'fire'], rarity: 'uncommon', size: { value: 'lg' } },
      attributes: { hp: { max: 175 }, ac: { value: 30 } },
      saves: { fortitude: { value: 20 }, reflex: { value: 18 }, will: { value: 17 } },
    },
  },
  {
    id: 'skeleton-guard',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.skeleton-guard',
    name: 'Skeleton Guard',
    type: 'npc',
    img: '/icons/skeleton.webp',
    system: {
      details: { level: { value: -1 }, publication: { title: 'Pathfinder Bestiary' } },
      publication: { title: 'Pathfinder Bestiary' },
      traits: { value: ['undead', 'skeleton', 'mindless'], rarity: 'common', size: { value: 'med' } },
      attributes: { hp: { max: 4 }, ac: { value: 16 } },
      saves: { fortitude: { value: 2 }, reflex: { value: 8 }, will: { value: 4 } },
    },
  },
];

// Bestiary pack is wired into the same mock so we can warm both packs
// from a single test cache. Level-shape here mirrors pf2e bestiary
// docs which put `level.value` under `system.details` rather than
// `system` directly; the level extractor already handles the
// `system.level.value` shape used by items, so we also add a
// top-level level alias to keep the fixture readable.
for (const doc of bestiaryDocs) {
  (doc.system as { level?: { value: number } }).level = {
    value: (doc.system as { details: { level: { value: number } } }).details.level.value,
  };
}

// Default mock uses the bulk `dump-compendium-pack` command — the
// path used by any current bridge build. Knows about both the
// equipment-srd and pathfinder-bestiary synthetic packs so tests
// can warm either.
function docsForPack(packId: string): { packLabel: string; documents: CompendiumDocument[] } | null {
  if (packId === 'pf2e.equipment-srd') return { packLabel: 'Equipment', documents: equipmentDocs };
  if (packId === 'pf2e.pathfinder-bestiary') return { packLabel: 'Pathfinder Bestiary', documents: bestiaryDocs };
  return null;
}

function makeSendCommand(): SendCommand {
  return async (type, params) => {
    if (type === 'dump-compendium-pack') {
      const packId = String(params?.['packId'] ?? '');
      const hit = docsForPack(packId);
      if (!hit) throw new Error(`unknown pack: ${packId}`);
      return { packId, packLabel: hit.packLabel, documents: hit.documents };
    }
    if (type === 'find-in-compendium') {
      const packId = String(params?.['packId'] ?? '');
      const hit = docsForPack(packId);
      if (!hit) return { matches: [] };
      return {
        matches: hit.documents.map((d) => ({
          packId,
          packLabel: hit.packLabel,
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
      for (const pool of [equipmentDocs, bestiaryDocs]) {
        const doc = pool.find((d) => d.uuid === uuid);
        if (doc) return { document: doc };
      }
      throw new Error(`doc not found: ${uuid}`);
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
    const playerCoreCount = equipmentDocs.filter(
      (d) => (d.system as { publication?: { title?: string } }).publication?.title === 'Player Core',
    ).length;
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], sources: ['Player Core'] });
    assert.equal(result?.matches.length, playerCoreCount);
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

describe('CompendiumCache.search — dm-tool filters (monsters)', () => {
  let cache: CompendiumCache;
  beforeEach(async () => {
    cache = new CompendiumCache(makeSendCommand());
    await cache.warmPack('pf2e.pathfinder-bestiary');
  });

  it('filters by minLevel (loot-gen party-level window)', () => {
    const result = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], minLevel: 5 });
    const names = result?.matches.map((m) => m.name) ?? [];
    assert.deepEqual(names, ['Young Red Dragon']);
  });

  it('combines minLevel + maxLevel as a range', () => {
    const result = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], minLevel: -1, maxLevel: 0 });
    const names = (result?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Goblin Warrior', 'Skeleton Guard']);
  });

  it('filters by rarity', () => {
    const uncommon = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], rarities: ['uncommon'] });
    assert.deepEqual(
      uncommon?.matches.map((m) => m.name),
      ['Young Red Dragon'],
    );
    const commonOrUncommon = cache.search({
      packIds: ['pf2e.pathfinder-bestiary'],
      rarities: ['common', 'uncommon'],
    });
    assert.equal(commonOrUncommon?.matches.length, bestiaryDocs.length);
  });

  it('filters by size', () => {
    const result = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], sizes: ['lg'] });
    assert.deepEqual(
      result?.matches.map((m) => m.name),
      ['Young Red Dragon'],
    );
  });

  it('filters by creatureType (from traits array)', () => {
    const undead = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], creatureTypes: ['undead'] });
    assert.deepEqual(
      undead?.matches.map((m) => m.name),
      ['Skeleton Guard'],
    );
    const dragonOrHumanoid = cache.search({
      packIds: ['pf2e.pathfinder-bestiary'],
      creatureTypes: ['dragon', 'humanoid'],
    });
    const names = (dragonOrHumanoid?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Goblin Warrior', 'Young Red Dragon']);
  });

  it('filters by hp range', () => {
    const tough = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], hpMin: 100 });
    assert.deepEqual(
      tough?.matches.map((m) => m.name),
      ['Young Red Dragon'],
    );
    const weak = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], hpMax: 5 });
    assert.deepEqual(
      weak?.matches.map((m) => m.name),
      ['Skeleton Guard'],
    );
  });

  it('filters by ac range', () => {
    const armored = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], acMin: 20 });
    assert.deepEqual(
      armored?.matches.map((m) => m.name),
      ['Young Red Dragon'],
    );
  });

  it('filters by fort/ref/will save thresholds', () => {
    const toughWill = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], willMin: 10 });
    assert.deepEqual(
      toughWill?.matches.map((m) => m.name),
      ['Young Red Dragon'],
    );
    const quickRef = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], refMin: 7, refMax: 8 });
    const names = (quickRef?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Goblin Warrior', 'Skeleton Guard']);
  });

  it('composes monster filters (AND)', () => {
    const result = cache.search({
      packIds: ['pf2e.pathfinder-bestiary'],
      rarities: ['common'],
      creatureTypes: ['humanoid', 'undead'],
      hpMax: 10,
    });
    const names = (result?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Goblin Warrior', 'Skeleton Guard']);
  });

  it('surfaces combat-stat fields on matches for browser rendering', () => {
    const result = cache.search({ packIds: ['pf2e.pathfinder-bestiary'], q: 'dragon' });
    const dragon = result?.matches[0];
    assert.equal(dragon?.hp, 175);
    assert.equal(dragon?.ac, 30);
    assert.equal(dragon?.fort, 20);
    assert.equal(dragon?.ref, 18);
    assert.equal(dragon?.will, 17);
    assert.equal(dragon?.rarity, 'uncommon');
    assert.equal(dragon?.size, 'lg');
    assert.equal(dragon?.creatureType, 'dragon');
    assert.equal(dragon?.source, 'Pathfinder Bestiary');
  });

  it('skips monster-only filters on documents that lack the field', async () => {
    // Items don't have an hp.max field — the filter should no-op
    // rather than exclude everything.
    const combined = new CompendiumCache(makeSendCommand());
    await combined.warmPack('pf2e.equipment-srd');
    const result = combined.search({ packIds: ['pf2e.equipment-srd'], hpMax: 100 });
    // All equipment passes the no-op hp filter.
    assert.equal(result?.matches.length, equipmentDocs.length);
  });
});

describe('CompendiumCache.search — dm-tool filters (items)', () => {
  let cache: CompendiumCache;
  beforeEach(async () => {
    cache = await makeWarmCache();
  });

  it('filters by isMagical=true (magical + tradition traits)', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], isMagical: true });
    const names = (result?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Amulet of Mighty Fists', 'Healing Potion (Greater)']);
  });

  it('filters by isMagical=false (no tradition traits)', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], isMagical: false });
    const names = (result?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Backpack', 'Bastard Sword', 'Javelin']);
  });

  it('filters by usageCategory prefix (held, worn, …)', () => {
    const worn = cache.search({ packIds: ['pf2e.equipment-srd'], usageCategories: ['worn'] });
    const names = (worn?.matches.map((m) => m.name) ?? []).sort();
    assert.deepEqual(names, ['Amulet of Mighty Fists', 'Backpack']);
    const held = cache.search({ packIds: ['pf2e.equipment-srd'], usageCategories: ['held'] });
    assert.equal(held?.matches.length, 3);
  });

  it('filters by rarity on items', () => {
    const uncommon = cache.search({ packIds: ['pf2e.equipment-srd'], rarities: ['uncommon'] });
    assert.deepEqual(
      uncommon?.matches.map((m) => m.name),
      ['Amulet of Mighty Fists'],
    );
  });

  it('surfaces item filter fields on matches', () => {
    const result = cache.search({ packIds: ['pf2e.equipment-srd'], q: 'amulet' });
    const amulet = result?.matches[0];
    assert.equal(amulet?.rarity, 'uncommon');
    assert.equal(amulet?.usage, 'worn-amulet');
    assert.equal(amulet?.isMagical, true);
    assert.equal(amulet?.source, 'Treasure Vault');
  });

  it('composes item filters (AND)', () => {
    const result = cache.search({
      packIds: ['pf2e.equipment-srd'],
      isMagical: true,
      usageCategories: ['worn'],
      minLevel: 5,
    });
    assert.deepEqual(
      result?.matches.map((m) => m.name),
      ['Amulet of Mighty Fists'],
    );
  });
});
