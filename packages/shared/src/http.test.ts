import { describe, expect, it } from 'vitest';
import { buildCompendiumQuery } from './http';
import { compendiumSearchQuery } from './rpc/schemas';

function roundTrip(qs: string) {
  return compendiumSearchQuery.parse(Object.fromEntries(new URLSearchParams(qs)));
}

describe('buildCompendiumQuery', () => {
  it('round-trips all 26 CompendiumSearchOptions fields through the Zod schema', () => {
    const qs = buildCompendiumQuery({
      q: 'goblin',
      packIds: ['pf2e.bestiary-family-ability-glossary', 'pf2e.feats-srd'],
      documentType: 'Actor',
      traits: ['humanoid', 'goblin'],
      anyTraits: ['orc'],
      sources: ['Core Rulebook'],
      ancestrySlug: 'goblin',
      minLevel: 2,
      maxLevel: 10,
      rarities: ['common', 'uncommon'],
      sizes: ['sm', 'med'],
      creatureTypes: ['humanoid'],
      usageCategories: ['held', 'worn'],
      isMagical: true,
      hpMin: 10,
      hpMax: 100,
      acMin: 15,
      acMax: 25,
      fortMin: 5,
      fortMax: 15,
      refMin: 3,
      refMax: 12,
      willMin: 2,
      willMax: 10,
      limit: 50,
      offset: 100,
    });

    const parsed = roundTrip(qs);
    expect(parsed.q).toBe('goblin');
    expect(parsed.packId).toEqual(['pf2e.bestiary-family-ability-glossary', 'pf2e.feats-srd']);
    expect(parsed.documentType).toBe('Actor');
    expect(parsed.traits).toEqual(['humanoid', 'goblin']);
    expect(parsed.anyTraits).toEqual(['orc']);
    expect(parsed.sources).toEqual(['Core Rulebook']);
    expect(parsed.ancestrySlug).toBe('goblin');
    expect(parsed.minLevel).toBe(2);
    expect(parsed.maxLevel).toBe(10);
    expect(parsed.rarities).toEqual(['common', 'uncommon']);
    expect(parsed.sizes).toEqual(['sm', 'med']);
    expect(parsed.creatureTypes).toEqual(['humanoid']);
    expect(parsed.usageCategories).toEqual(['held', 'worn']);
    expect(parsed.isMagical).toBe(true);
    expect(parsed.hpMin).toBe(10);
    expect(parsed.hpMax).toBe(100);
    expect(parsed.acMin).toBe(15);
    expect(parsed.acMax).toBe(25);
    expect(parsed.fortMin).toBe(5);
    expect(parsed.fortMax).toBe(15);
    expect(parsed.refMin).toBe(3);
    expect(parsed.refMax).toBe(12);
    expect(parsed.willMin).toBe(2);
    expect(parsed.willMax).toBe(10);
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(100);
  });

  it('omits empty arrays from the query string', () => {
    const qs = buildCompendiumQuery({
      q: 'goblin',
      rarities: [],
      sizes: [],
      creatureTypes: [],
      usageCategories: [],
    });
    const params = new URLSearchParams(qs);
    expect(params.has('rarities')).toBe(false);
    expect(params.has('sizes')).toBe(false);
    expect(params.has('creatureTypes')).toBe(false);
    expect(params.has('usageCategories')).toBe(false);
  });

  it('encodes falsy number offset=0', () => {
    const qs = buildCompendiumQuery({ q: 'x', offset: 0 });
    expect(new URLSearchParams(qs).get('offset')).toBe('0');
    expect(roundTrip(qs).offset).toBe(0);
  });

  it('encodes falsy number hpMin=0', () => {
    const qs = buildCompendiumQuery({ q: 'x', hpMin: 0 });
    expect(new URLSearchParams(qs).get('hpMin')).toBe('0');
    expect(roundTrip(qs).hpMin).toBe(0);
  });

  it('encodes isMagical=true as the string "true"', () => {
    const qs = buildCompendiumQuery({ q: 'x', isMagical: true });
    expect(new URLSearchParams(qs).get('isMagical')).toBe('true');
    expect(roundTrip(qs).isMagical).toBe(true);
  });

  it('encodes isMagical=false as the string "false"', () => {
    const qs = buildCompendiumQuery({ q: 'x', isMagical: false });
    expect(new URLSearchParams(qs).get('isMagical')).toBe('false');
    expect(roundTrip(qs).isMagical).toBe(false);
  });
});
