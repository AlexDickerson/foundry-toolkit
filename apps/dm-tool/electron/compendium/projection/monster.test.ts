// Golden-ish fixture tests for the monster wire → dm-tool projection layer.
// Covers: shared description/formatter helpers and all monster projections.

import { describe, expect, it } from 'vitest';
import type { CompendiumDocument, CompendiumMatch } from '../types';
import { cleanDescription } from './shared';
import {
  formatActions,
  formatImmunities,
  formatMelee,
  formatSpeed,
  formatWeaknesses,
  monsterDocToDetail,
  monsterDocToResult,
  monsterDocToRow,
  monsterDocToSummary,
  monsterMatchToSummary,
  monsterSpells,
} from './monster';

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
  it('joins land and other speeds (legacy attributes.speed shape)', () => {
    const system = {
      attributes: { speed: { value: 40, otherSpeeds: [{ type: 'fly', value: 120 }] } },
    };
    expect(formatSpeed(system)).toBe('40 feet, fly 120 feet');
  });

  it('reads the PF2e processed movement.speeds shape', () => {
    // Barbazu-style: system.movement.speeds.{ land: {value:35}, burrow: null, ... }
    const system = {
      movement: {
        speeds: {
          land: { value: 35 },
          burrow: null,
          climb: null,
          fly: { value: 60 },
          swim: null,
        },
      },
    };
    expect(formatSpeed(system)).toBe('35 feet, fly 60 feet');
  });

  it('returns an empty string when speed is missing', () => {
    expect(formatSpeed({})).toBe('');
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

describe('monsterDocToResult — PF2e processed shape (system.actions flat array)', () => {
  it('extracts melee strikes and speed from the processed actor format', () => {
    // Minimal Barbazu-style document: flat system.actions[] of strike objects
    // and speed under system.movement.speeds instead of system.attributes.speed.
    const doc: CompendiumDocument = {
      id: 'barb1',
      uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.barb1',
      name: 'Barbazu',
      type: 'npc',
      img: 'systems/pf2e/icons/bestiary/barbazu.webp',
      system: {
        details: { level: { value: 5 }, publication: { title: 'Bestiary' } },
        traits: { rarity: 'common', size: { value: 'med' }, value: ['devil', 'fiend'] },
        attributes: {
          hp: { max: 60 },
          ac: { value: 22 },
          immunities: [{ type: 'fire' }],
          weaknesses: [{ type: 'holy', value: 5 }],
          resistances: [],
        },
        saves: { fortitude: { value: 15 }, reflex: { value: 11 }, will: { value: 11 } },
        perception: { mod: 13 },
        abilities: {
          str: { mod: 4 },
          dex: { mod: 2 },
          con: { mod: 4 },
          int: { mod: -2 },
          wis: { mod: 2 },
          cha: { mod: 1 },
        },
        movement: {
          speeds: { land: { value: 35 }, burrow: null, climb: null, fly: null, swim: null },
        },
        actions: [
          {
            type: 'strike',
            attackRollType: 'PF2E.NPCAttackMelee',
            label: 'Beard',
            totalModifier: 15,
            traits: [
              { name: 'attack', label: 'Attack' },
              { name: 'magical', label: 'Magical' },
              { name: 'unholy', label: 'Unholy' },
            ],
            item: {
              system: {
                damageRolls: { abc: { damage: '1d6+7', damageType: 'piercing', category: null } },
              },
            },
          },
          {
            type: 'strike',
            attackRollType: 'PF2E.NPCAttackMelee',
            label: 'Glaive',
            totalModifier: 15,
            traits: [{ name: 'attack', label: 'Attack' }],
            item: {
              system: {
                damageRolls: {
                  def: { damage: '1d8+7', damageType: 'slashing', category: null },
                  ghi: { damage: '2d6', damageType: 'spirit', category: null },
                },
              },
            },
          },
        ],
      },
    };

    const out = monsterDocToResult(doc);

    // Stats
    expect(out.hp).toBe(60);
    expect(out.ac).toBe(22);
    expect(out.fort).toBe(15);
    expect(out.speed).toBe('35 feet');

    // Melee: two strikes formatted from processed shape
    expect(out.melee).toContain('◆ Beard +15');
    expect(out.melee).toContain('1d6+7 piercing');
    expect(out.melee).toContain('(magical, unholy)'); // "attack" trait filtered out
    expect(out.melee).toContain('◆ Glaive +15');
    expect(out.melee).toContain('1d8+7 slashing');
    expect(out.melee).toContain('2d6 spirit');

    // No ranged strikes in this fixture
    expect(out.ranged).toBe('');
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
    // No items array on this fixture → empty spells array
    expect(out.spells).toEqual([]);
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

describe('monsterSpells', () => {
  /** A minimal npc doc with one spellcastingEntry + two spells. */
  function spellcasterDoc(): CompendiumDocument {
    return {
      id: 'caster1',
      uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.caster1',
      name: 'Accuser Devil',
      type: 'npc',
      img: '',
      system: {
        details: { level: { value: 6 } },
        traits: { rarity: 'common', size: { value: 'sm' }, value: ['devil', 'fiend'] },
        attributes: { hp: { max: 70 }, ac: { value: 22 }, immunities: [], weaknesses: [], resistances: [] },
        saves: { fortitude: { value: 14 }, reflex: { value: 12 }, will: { value: 13 } },
        perception: { mod: 13 },
        abilities: {
          str: { mod: 1 },
          dex: { mod: 3 },
          con: { mod: 2 },
          int: { mod: 0 },
          wis: { mod: 3 },
          cha: { mod: 4 },
        },
        publication: { title: 'Bestiary 2' },
      },
      items: [
        // Spellcasting entry
        {
          id: 'entry1',
          type: 'spellcastingEntry',
          name: 'Divine Innate Spells',
          system: {
            tradition: { value: 'divine' },
            prepared: { value: 'innate' },
            spelldc: { dc: 24, value: 16 },
          },
        },
        // Cantrip
        {
          id: 'spell1',
          type: 'spell',
          name: 'Detect Magic',
          system: {
            level: { value: 0 },
            location: { value: 'entry1', heightenedLevel: null, uses: {} },
            time: { value: '2' },
            range: { value: '30 feet' },
            area: {},
            target: { value: '' },
            traits: { value: ['detection', 'uncommon'] },
            description: { value: '<p>You sense magical auras.</p>' },
          },
        },
        // Rank-3 innate spell
        {
          id: 'spell2',
          type: 'spell',
          name: 'Fear',
          system: {
            level: { value: 1 },
            location: { value: 'entry1', heightenedLevel: 3, uses: { max: 2 } },
            time: { value: 'reaction' },
            range: { value: '30 feet' },
            area: { value: 10, type: 'emanation' },
            target: { value: '1 creature' },
            traits: { value: ['emotion', 'fear', 'mental'] },
            description: { value: '<p>The target <em>flees</em>.</p>' },
          },
        },
      ],
    };
  }

  it('returns an array with one group for a single spellcastingEntry', () => {
    const groups = monsterSpells(spellcasterDoc().items);
    expect(groups).toHaveLength(1);
  });

  it('group has correct entryName, tradition, castingType, dc, attack', () => {
    const [group] = monsterSpells(spellcasterDoc().items);
    expect(group.entryName).toBe('Divine Innate Spells');
    expect(group.tradition).toBe('divine');
    expect(group.castingType).toBe('innate');
    expect(group.dc).toBe(24);
    expect(group.attack).toBe(16);
  });

  it('groups spells by effective rank (cantrip + heightened rank-3)', () => {
    const [group] = monsterSpells(spellcasterDoc().items);
    expect(group.ranks).toHaveLength(2);
    const ranks = group.ranks.map((r) => r.rank);
    expect(ranks).toEqual([0, 3]); // cantrip first, then rank 3
  });

  it('cantrip spell has correct fields', () => {
    const [group] = monsterSpells(spellcasterDoc().items);
    const cantripRank = group.ranks.find((r) => r.rank === 0)!;
    expect(cantripRank.spells).toHaveLength(1);
    const spell = cantripRank.spells[0];
    expect(spell.name).toBe('Detect Magic');
    expect(spell.rank).toBe(0);
    expect(spell.usesPerDay).toBeUndefined();
    expect(spell.castTime).toBe('2');
    expect(spell.range).toBe('30 feet');
    expect(spell.area).toBe('');
    // Rarity trait 'uncommon' should be filtered out
    expect(spell.traits).toEqual(['detection']);
    expect(spell.description).toBe('You sense magical auras.');
  });

  it('rank-3 spell has correct fields including usesPerDay, area, heightenedLevel', () => {
    const [group] = monsterSpells(spellcasterDoc().items);
    const rank3 = group.ranks.find((r) => r.rank === 3)!;
    expect(rank3.spells).toHaveLength(1);
    const spell = rank3.spells[0];
    expect(spell.name).toBe('Fear');
    expect(spell.rank).toBe(3);
    expect(spell.usesPerDay).toBe(2);
    expect(spell.castTime).toBe('reaction');
    expect(spell.area).toBe('10-foot emanation');
    expect(spell.target).toBe('1 creature');
    expect(spell.traits).toEqual(['emotion', 'fear', 'mental']);
    expect(spell.description).toBe('The target flees.');
  });

  it('returns empty array when items is undefined', () => {
    expect(monsterSpells(undefined)).toEqual([]);
  });

  it('returns empty array when there are no spellcastingEntry items', () => {
    expect(monsterSpells([])).toEqual([]);
  });

  it('monsterDocToDetail spells field is populated for spellcaster doc', () => {
    const out = monsterDocToDetail(spellcasterDoc());
    expect(out.spells).toHaveLength(1);
    expect(out.spells[0].entryName).toBe('Divine Innate Spells');
    expect(out.spells[0].dc).toBe(24);
    expect(out.spells[0].tradition).toBe('divine');
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
