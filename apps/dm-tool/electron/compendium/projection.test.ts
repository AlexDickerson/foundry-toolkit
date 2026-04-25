// Golden-ish fixture tests for the wire → dm-tool projection layer.
// We build realistic-looking pf2e-system docs (one monster, one item)
// that exercise every branch the mappers care about, then assert the
// resulting dm-tool-shape is what consumer UIs expect.
//
// These are *not* copied from a real AoN export — the goal is to cover
// the projection branches end-to-end (hp/ac/saves, traits, descriptions
// with Foundry @-markup, structured prices, variants, Unicode action
// glyphs) without pulling a 100 KB JSON blob into the repo.

import { describe, expect, it } from 'vitest';
import type { CompendiumDocument, CompendiumMatch } from './types';
import {
  cleanDescription,
  formatActions,
  formatImmunities,
  formatMelee,
  formatSpeed,
  formatWeaknesses,
  itemDocToBrowserDetail,
  itemDocToBrowserRow,
  itemDocToLootShortlistItem,
  itemMatchToBrowserRow,
  monsterDocToDetail,
  monsterDocToResult,
  monsterDocToRow,
  monsterDocToSummary,
  monsterMatchToSummary,
  priceToCopper,
} from './projection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function youngRedDragonDoc(): CompendiumDocument {
  return {
    id: 'abc123',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.abc123',
    name: 'Young Red Dragon',
    type: 'npc',
    img: 'systems/pf2e/icons/classes/young-red-dragon.webp',
    // tokenImg is the shape the bridge PR will populate on npc docs.
    // Included here to verify the projection reads it when present.
    ...{ tokenImg: 'systems/pf2e/icons/tokens/young-red-dragon-token.webp' },
    system: {
      details: {
        level: { value: 10 },
        creatureType: 'Dragon',
        publicNotes: '<p>A scion of flame. @UUID[Item.fire-breath]{Fire Breath}.</p>',
      },
      publication: { title: 'PF2e Bestiary', remaster: false },
      traits: {
        rarity: 'uncommon',
        size: { value: 'huge' },
        value: ['dragon', 'fire'],
      },
      attributes: {
        hp: { max: 180 },
        ac: { value: 30 },
        speed: {
          value: 40,
          otherSpeeds: [{ type: 'fly', value: 120 }],
        },
        immunities: [{ type: 'fire' }, { type: 'paralyzed' }],
        weaknesses: [{ type: 'cold', value: 10 }],
        resistances: [{ type: 'piercing', value: 5 }],
      },
      saves: {
        fortitude: { value: 20 },
        reflex: { value: 18 },
        will: { value: 17 },
      },
      perception: { mod: 19 },
      abilities: {
        str: { mod: 6 },
        dex: { mod: 2 },
        con: { mod: 5 },
        int: { mod: 1 },
        wis: { mod: 3 },
        cha: { mod: 4 },
      },
      skills: {
        athletics: { base: 22 },
        intimidation: { base: 20 },
      },
      actions: {
        melee: [
          {
            name: 'Jaws',
            bonus: 22,
            damage: [
              { formula: '3d12+10', type: 'piercing', category: null },
              { formula: '2d6', type: 'fire', category: 'persistent' },
            ],
            traits: ['magical', 'reach 15 feet'],
          },
        ],
        ranged: [
          {
            name: 'Breath Weapon',
            bonus: 20,
            damage: [{ formula: '10d6', type: 'fire', category: null }],
            traits: ['fire', 'range 40 feet'],
          },
        ],
      },
    },
  };
}

function potionOfHealingDoc(): CompendiumDocument {
  return {
    id: 'pot42',
    uuid: 'Compendium.pf2e.equipment-srd.Item.pot42',
    name: 'Potion of Healing (Minor)',
    type: 'consumable',
    img: 'systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp',
    system: {
      level: { value: 1 },
      publication: { title: 'Player Core', remaster: true },
      traits: {
        value: ['consumable', 'magical', 'healing', 'potion', 'UNCOMMON'],
        rarity: 'uncommon',
      },
      price: { value: { gp: 4 } },
      bulk: { value: 0.1 },
      usage: { value: 'held in 1 hand' },
      description: {
        value: '<p>Drink to regain <span class="action-glyph">1</span> HP.</p>',
      },
      actionType: { value: 'action' },
      variants: [
        { type: 'lesser', level: 3, price: { value: { gp: 12 } } },
        { type: 'moderate', level: 6, price: { value: { gp: 50 } } },
      ],
    },
  };
}

/** Lean match — only the fields the bridge emits (no stats). */
function monsterMatchLean(): CompendiumMatch {
  return {
    packId: 'pf2e.pathfinder-bestiary',
    packLabel: 'PF2e Bestiary',
    documentId: 'abc123',
    uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.abc123',
    name: 'Young Red Dragon',
    type: 'npc',
    img: 'systems/pf2e/icons/classes/young-red-dragon.webp',
    level: 10,
    traits: ['dragon', 'fire'],
  };
}

/** Enriched match — includes the cache-served stat fields mcp adds when
 *  the server's compendium cache is warm. */
function monsterMatchEnriched(): CompendiumMatch {
  return {
    ...monsterMatchLean(),
    hp: 180,
    ac: 30,
    fort: 20,
    ref: 18,
    will: 17,
    rarity: 'uncommon',
    size: 'huge',
    creatureType: 'Dragon',
    source: 'PF2e Bestiary',
  };
}

function itemMatch(): CompendiumMatch {
  return {
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: 'pot42',
    uuid: 'Compendium.pf2e.equipment-srd.Item.pot42',
    name: 'Potion of Healing (Minor)',
    type: 'consumable',
    img: '',
    level: 1,
    traits: ['consumable', 'magical', 'healing', 'UNCOMMON'],
    price: { value: { gp: 4 } },
  };
}

// ---------------------------------------------------------------------------
// Formatter helpers
// ---------------------------------------------------------------------------

describe('cleanDescription', () => {
  it('strips @UUID markup and surrounding HTML', () => {
    expect(cleanDescription('<p>A scion. @UUID[Item.x]{Fire Breath}.</p>')).toBe('A scion. Fire Breath.');
  });

  it('converts action-glyph spans to Unicode diamonds', () => {
    expect(cleanDescription('<span class="action-glyph">1</span>')).toBe('◆');
    expect(cleanDescription('<span class="action-glyph">2</span>')).toBe('◆◆');
  });

  it('returns an empty string for null / undefined input', () => {
    expect(cleanDescription(null)).toBe('');
    expect(cleanDescription(undefined)).toBe('');
  });

  it('normalises <hr> and <br> to line breaks', () => {
    expect(cleanDescription('<p>A</p><hr/><p>B</p>')).toBe('A\n\n---\n\nB');
  });
});

describe('formatMelee / formatRanged', () => {
  it('renders an attack with multiple damage rolls and traits', () => {
    const doc = youngRedDragonDoc();
    const melee = (doc.system as { actions: { melee: unknown } }).actions.melee;
    const out = formatMelee(melee);
    expect(out).toContain('◆ Jaws +22');
    expect(out).toContain('3d12+10 piercing');
    expect(out).toContain('2d6 fire persistent');
    expect(out).toContain('(magical, reach 15 feet)');
  });

  it('returns an empty string for a non-array input', () => {
    expect(formatMelee(undefined)).toBe('');
  });
});

describe('formatActions', () => {
  it('prefixes action cost glyphs and cleans description markup', () => {
    const out = formatActions([
      { name: 'Stomp', action_type: 'action', actions: 2, traits: ['flourish'], description: '<p>Slam.</p>' },
      { name: 'Aura', action_type: 'passive', actions: null, traits: [], description: '' },
    ]);
    expect(out).toContain('◆◆ Stomp (flourish) Slam.');
    expect(out).toContain('Aura');
  });
});

describe('formatImmunities / formatWeaknesses', () => {
  it('joins typed rows', () => {
    expect(formatImmunities([{ type: 'fire' }, { type: 'paralyzed' }])).toBe('fire, paralyzed');
  });

  it('emits a value-weighted weakness row', () => {
    expect(formatWeaknesses([{ type: 'cold', value: 10 }])).toBe('cold 10');
  });
});

describe('formatSpeed', () => {
  it('joins land and other speeds', () => {
    const system = {
      attributes: { speed: { value: 40, otherSpeeds: [{ type: 'fly', value: 120 }] } },
    };
    expect(formatSpeed(system)).toBe('40 feet, fly 120 feet');
  });

  it('returns an empty string when speed is missing', () => {
    expect(formatSpeed({})).toBe('');
  });
});

describe('priceToCopper', () => {
  it('totals an ItemPrice struct', () => {
    expect(priceToCopper({ value: { gp: 4 } })).toBe(400);
    expect(priceToCopper({ value: { pp: 1, gp: 0, sp: 5 } })).toBe(1050);
  });

  it('handles legacy string prices', () => {
    expect(priceToCopper('1,600 gp')).toBe(160000);
    expect(priceToCopper('5 sp')).toBe(50);
  });

  it('sorts unpriced items to the end via MAX_SAFE_INTEGER', () => {
    expect(priceToCopper(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(priceToCopper(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ---------------------------------------------------------------------------
// Monster projections
// ---------------------------------------------------------------------------

describe('monsterDocToResult', () => {
  it('maps every stat-block field from system.*', () => {
    const out = monsterDocToResult(youngRedDragonDoc());
    expect(out.name).toBe('Young Red Dragon');
    expect(out.level).toBe(10);
    expect(out.source).toBe('PF2e Bestiary');
    expect(out.rarity).toBe('uncommon');
    expect(out.size).toBe('huge');
    expect(out.traits).toEqual(['dragon', 'fire']);
    expect(out.hp).toBe(180);
    expect(out.ac).toBe(30);
    expect(out.fort).toBe(20);
    expect(out.ref).toBe(18);
    expect(out.will).toBe(17);
    expect(out.perception).toBe(19);
    expect(out.str).toBe(6);
    expect(out.dex).toBe(2);
    expect(out.con).toBe(5);
    expect(out.speed).toBe('40 feet, fly 120 feet');
    expect(out.immunities).toBe('fire, paralyzed');
    expect(out.weaknesses).toBe('cold 10');
    expect(out.resistances).toBe('piercing 5');
    expect(out.melee).toContain('◆ Jaws +22');
    expect(out.ranged).toContain('◆ Breath Weapon +20');
    expect(out.description).toBe('A scion of flame. Fire Breath.');
    // aonUrl is scope-dropped
    expect(out.aon_url).toBe('');
  });

  it('falls back to empty fields when system is mostly missing', () => {
    const doc: CompendiumDocument = {
      id: 'x',
      uuid: 'x',
      name: 'Blank',
      type: 'npc',
      img: '',
      system: {},
    };
    const out = monsterDocToResult(doc);
    expect(out.name).toBe('Blank');
    expect(out.level).toBe(0);
    expect(out.hp).toBe(0);
    expect(out.traits).toEqual([]);
  });
});

describe('monsterDocToRow', () => {
  it('infers creature_type from details.creatureType', () => {
    const row = monsterDocToRow(youngRedDragonDoc());
    expect(row.creature_type).toBe('Dragon');
    expect(row.traits).toBe(JSON.stringify(['dragon', 'fire']));
    expect(row.skills).toContain('Athletics +22');
    expect(row.speed_land).toBe(40);
    expect(row.image_file).toBe('systems/pf2e/icons/classes/young-red-dragon.webp');
    expect(row.token_file).toBe('systems/pf2e/icons/tokens/young-red-dragon-token.webp');
  });

  it('falls back to image when tokenImg is missing', () => {
    const doc = youngRedDragonDoc();
    delete (doc as { tokenImg?: unknown }).tokenImg;
    const row = monsterDocToRow(doc);
    // TODO(compendium-migration): the fallback should flip to null once
    // the bridge PR populates tokenImg on every actor doc.
    expect(row.token_file).toBe(doc.img);
  });

  it('falls back to scanning traits when details.creatureType is absent', () => {
    const doc = youngRedDragonDoc();
    const system = doc.system as Record<string, unknown>;
    const details = system.details as Record<string, unknown>;
    delete details.creatureType;
    const row = monsterDocToRow(doc);
    expect(row.creature_type).toBe('Dragon');
  });
});

describe('monsterDocToDetail', () => {
  it('produces the full MonsterDetail shape with token+image urls', () => {
    const out = monsterDocToDetail(youngRedDragonDoc());
    expect(out.name).toBe('Young Red Dragon');
    expect(out.imageUrl).toBe('systems/pf2e/icons/classes/young-red-dragon.webp');
    expect(out.tokenUrl).toBe('systems/pf2e/icons/tokens/young-red-dragon-token.webp');
    expect(out.skills).toContain('Athletics +22');
  });

  it('returns null imageUrl and tokenUrl for default-icons placeholders', () => {
    const doc: CompendiumDocument = {
      ...youngRedDragonDoc(),
      img: 'systems/pf2e/icons/default-icons/npc.svg',
      ...{ tokenImg: 'systems/pf2e/icons/default-icons/npc.svg' },
    };
    const out = monsterDocToDetail(doc);
    expect(out.imageUrl).toBeNull();
    expect(out.tokenUrl).toBeNull();
  });
});

describe('monsterDocToSummary / monsterMatchToSummary', () => {
  it('doc projection populates every field', () => {
    const out = monsterDocToSummary(youngRedDragonDoc());
    expect(out.name).toBe('Young Red Dragon');
    expect(out.level).toBe(10);
    expect(out.hp).toBe(180);
    expect(out.ac).toBe(30);
    expect(out.creatureType).toBe('Dragon');
    expect(out.traits).toEqual(['dragon', 'fire']);
  });

  it('enriched match (cache-warm) uses hp/ac/saves/rarity/size/creatureType from the match', () => {
    // When the mcp server's cache is warm it populates these fields on
    // CompendiumMatch. monsterMatchToSummary must read them rather than
    // returning placeholder zeros — this is the fix for the "stats show as
    // 0 on every Monster Browser grid chip" bug.
    const out = monsterMatchToSummary(monsterMatchEnriched());
    expect(out.name).toBe('Young Red Dragon');
    expect(out.level).toBe(10);
    expect(out.hp).toBe(180);
    expect(out.ac).toBe(30);
    expect(out.fort).toBe(20);
    expect(out.ref).toBe(18);
    expect(out.will).toBe(17);
    expect(out.rarity).toBe('uncommon');
    expect(out.size).toBe('huge');
    expect(out.creatureType).toBe('Dragon');
    expect(out.source).toBe('PF2e Bestiary');
    expect(out.traits).toEqual(['dragon', 'fire']);
  });

  it('lean match (bridge fallback / cache-cold) falls back to safe defaults for missing stats', () => {
    // When the mcp server is not yet warm (or the search fell through to
    // the bridge) the match doesn't carry stats. Defaults must be safe
    // numeric/string values, not undefined, so the UI renders without
    // crashing.
    const out = monsterMatchToSummary(monsterMatchLean());
    expect(out.name).toBe('Young Red Dragon');
    expect(out.level).toBe(10);
    expect(out.hp).toBe(0);
    expect(out.ac).toBe(0);
    expect(out.fort).toBe(0);
    expect(out.ref).toBe(0);
    expect(out.will).toBe(0);
    expect(out.rarity).toBe('common');
    expect(out.size).toBe('');
    expect(out.creatureType).toBe('');
    expect(out.source).toBe('');
    expect(out.traits).toEqual(['dragon', 'fire']);
  });

  it('partial enrichment — present fields win, absent fields default', () => {
    // Only hp/ac populated (e.g. a hypothetical partial cache hit).
    const partial: CompendiumMatch = { ...monsterMatchLean(), hp: 95, ac: 22 };
    const out = monsterMatchToSummary(partial);
    expect(out.hp).toBe(95);
    expect(out.ac).toBe(22);
    expect(out.fort).toBe(0);
    expect(out.rarity).toBe('common');
  });
});

// ---------------------------------------------------------------------------
// Item projections
// ---------------------------------------------------------------------------

describe('itemDocToBrowserRow', () => {
  it('extracts rarity, bulk, usage, and magical flag', () => {
    const row = itemDocToBrowserRow(potionOfHealingDoc());
    expect(row.id).toBe('pot42');
    expect(row.name).toBe('Potion of Healing (Minor)');
    expect(row.level).toBe(1);
    expect(row.rarity).toBe('UNCOMMON');
    expect(row.price).toBe('4 gp');
    expect(row.bulk).toBe('L'); // 0.1 → Light
    expect(row.usage).toBe('held in 1 hand');
    expect(row.isMagical).toBe(true);
    expect(row.hasVariants).toBe(true);
    expect(row.isRemastered).toBe(true);
    // Rarity trait should not leak into the public traits array
    expect(row.traits).not.toContain('UNCOMMON');
  });
});

describe('itemDocToBrowserDetail', () => {
  it('includes cleaned description and parsed variants', () => {
    const detail = itemDocToBrowserDetail(potionOfHealingDoc());
    expect(detail.description).toContain('Drink to regain ◆ HP.');
    expect(detail.source).toBe('Player Core');
    expect(detail.variants).toHaveLength(2);
    expect(detail.variants[0]).toEqual({ type: 'lesser', level: 3, price: '12 gp' });
    // Consumable defaults to activatable
    expect(detail.hasActivation).toBe(true);
  });
});

describe('itemMatchToBrowserRow', () => {
  it('folds a match-only row without a doc fetch', () => {
    const row = itemMatchToBrowserRow(itemMatch());
    expect(row.id).toBe('pot42');
    expect(row.level).toBe(1);
    expect(row.rarity).toBe('UNCOMMON');
    expect(row.price).toBe('4 gp');
    expect(row.isMagical).toBe(true);
  });
});

describe('itemDocToLootShortlistItem', () => {
  it('emits the lean loot-agent shape', () => {
    const out = itemDocToLootShortlistItem(potionOfHealingDoc());
    expect(out.id).toBe('pot42');
    expect(out.name).toBe('Potion of Healing (Minor)');
    expect(out.level).toBe(1);
    expect(out.price).toBe('4 gp');
    expect(out.isMagical).toBe(1);
    expect(out.source).toBe('Player Core');
    expect(out.traits).toContain('magical');
  });
});
