import { describe, expect, it } from 'vitest';
import { pcActorToDetail } from './pc-actor.js';
import type { PreparedActor } from '@foundry-toolkit/shared/foundry-api';

function makeActor(overrides: Partial<PreparedActor> = {}): PreparedActor {
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    name: 'Valeros',
    type: 'character',
    img: '',
    system: {},
    items: [],
    ...overrides,
  };
}

describe('pcActorToDetail', () => {
  it('maps id and name', () => {
    const detail = pcActorToDetail(makeActor({ id: 'abc', name: 'Seoni' }));
    expect(detail.id).toBe('abc');
    expect(detail.name).toBe('Seoni');
  });

  it('returns empty arrays for an actor with no items', () => {
    const detail = pcActorToDetail(makeActor({ items: [] }));
    expect(detail.actions).toEqual([]);
    expect(detail.spellGroups).toEqual([]);
  });

  describe('action extraction', () => {
    it('extracts a 1-action strike', () => {
      const actor = makeActor({
        items: [
          {
            id: 'a1',
            name: 'Strike',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'action' },
              actions: { value: 1 },
              traits: { value: ['attack'] },
              description: { value: '<p>Make a strike.</p>' },
            },
          },
        ],
      });
      const { actions } = pcActorToDetail(actor);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        name: 'Strike',
        actionType: 'action',
        actionCost: 1,
        traits: ['attack'],
      });
      expect(actions[0].description).toContain('Make a strike');
    });

    it('extracts a reaction', () => {
      const actor = makeActor({
        items: [
          {
            id: 'r1',
            name: 'Reactive Strike',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'reaction' },
              actions: { value: null },
              traits: { value: ['attack'] },
              description: { value: '' },
            },
          },
        ],
      });
      const { actions } = pcActorToDetail(actor);
      expect(actions[0]).toMatchObject({
        name: 'Reactive Strike',
        actionType: 'reaction',
        actionCost: undefined,
      });
    });

    it('extracts a free action', () => {
      const actor = makeActor({
        items: [
          {
            id: 'f1',
            name: 'Eschew Materials',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'free' },
              actions: { value: null },
              traits: { value: [] },
              description: { value: '' },
            },
          },
        ],
      });
      const { actions } = pcActorToDetail(actor);
      expect(actions[0]).toMatchObject({ name: 'Eschew Materials', actionType: 'free' });
    });

    it('excludes passive abilities', () => {
      const actor = makeActor({
        items: [
          {
            id: 'p1',
            name: 'Armor Expertise',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'passive' },
              actions: { value: null },
              traits: { value: [] },
              description: { value: '' },
            },
          },
        ],
      });
      expect(pcActorToDetail(actor).actions).toHaveLength(0);
    });

    it('sorts: reactions first, then free, then actions by cost', () => {
      const actor = makeActor({
        items: [
          {
            id: 'a3',
            name: 'Slow Burn',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'action' },
              actions: { value: 3 },
              traits: { value: [] },
              description: { value: '' },
            },
          },
          {
            id: 'a1',
            name: 'Strike',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'action' },
              actions: { value: 1 },
              traits: { value: [] },
              description: { value: '' },
            },
          },
          {
            id: 'r1',
            name: 'Reactive Strike',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'reaction' },
              actions: { value: null },
              traits: { value: [] },
              description: { value: '' },
            },
          },
          {
            id: 'f1',
            name: 'Free Action',
            type: 'action',
            img: '',
            system: {
              actionType: { value: 'free' },
              actions: { value: null },
              traits: { value: [] },
              description: { value: '' },
            },
          },
        ],
      });
      const names = pcActorToDetail(actor).actions.map((a) => a.name);
      expect(names).toEqual(['Reactive Strike', 'Free Action', 'Strike', 'Slow Burn']);
    });

    it('ignores non-action item types', () => {
      const actor = makeActor({
        items: [
          {
            id: 'w1',
            name: 'Longsword',
            type: 'weapon',
            img: '',
            system: {},
          },
          {
            id: 'e1',
            name: 'Chain Mail',
            type: 'armor',
            img: '',
            system: {},
          },
        ],
      });
      expect(pcActorToDetail(actor).actions).toHaveLength(0);
    });
  });

  describe('spell extraction', () => {
    it('extracts a prepared spellcasting entry with spells', () => {
      const actor = makeActor({
        items: [
          {
            id: 'entry-1',
            name: 'Arcane Prepared Spells',
            type: 'spellcastingEntry',
            img: '',
            system: {
              tradition: { value: 'arcane' },
              prepared: { value: 'prepared' },
              spelldc: { dc: 25, value: 17 },
            },
          },
          {
            id: 'spell-1',
            name: 'Fireball',
            type: 'spell',
            img: '',
            system: {
              level: { value: 3 },
              location: { value: 'entry-1' },
              time: { value: '2' },
              range: { value: '500 feet' },
              area: { value: 20, type: 'burst' },
              target: { value: '' },
              traits: { value: ['fire', 'arcane'] },
              description: { value: '<p>A ball of fire.</p>' },
            },
          },
        ],
      });

      const { spellGroups } = pcActorToDetail(actor);
      expect(spellGroups).toHaveLength(1);
      const [group] = spellGroups;
      expect(group.entryName).toBe('Arcane Prepared Spells');
      expect(group.tradition).toBe('arcane');
      expect(group.dc).toBe(25);
      expect(group.attack).toBe(17);
      expect(group.ranks).toHaveLength(1);
      expect(group.ranks[0].rank).toBe(3);
      const [spell] = group.ranks[0].spells;
      expect(spell.name).toBe('Fireball');
      expect(spell.castTime).toBe('2');
      expect(spell.area).toBe('20-foot burst');
      expect(spell.traits).toContain('fire');
      expect(spell.traits).toContain('arcane'); // tradition traits are kept
      // Rarity tags (common/uncommon/rare/unique) would be filtered, but fire/arcane are not rarity tags
    });

    it('ignores spells without a matching spellcasting entry', () => {
      const actor = makeActor({
        items: [
          {
            id: 'spell-orphan',
            name: 'Orphaned Spell',
            type: 'spell',
            img: '',
            system: {
              level: { value: 1 },
              location: { value: 'nonexistent-entry' },
              time: { value: '2' },
              range: { value: '' },
              area: {},
              target: { value: '' },
              traits: { value: [] },
              description: { value: '' },
            },
          },
        ],
      });
      expect(pcActorToDetail(actor).spellGroups).toHaveLength(0);
    });

    it('handles innate spells with uses per day', () => {
      const actor = makeActor({
        items: [
          {
            id: 'entry-innate',
            name: 'Innate Spells',
            type: 'spellcastingEntry',
            img: '',
            system: {
              tradition: { value: 'divine' },
              prepared: { value: 'innate' },
              spelldc: { dc: 20, value: 12 },
            },
          },
          {
            id: 'spell-innate',
            name: 'Darkness',
            type: 'spell',
            img: '',
            system: {
              level: { value: 2 },
              location: { value: 'entry-innate', uses: { max: 1 } },
              time: { value: '3' },
              range: { value: '' },
              area: {},
              target: { value: '' },
              traits: { value: [] },
              description: { value: '' },
            },
          },
        ],
      });

      const { spellGroups } = pcActorToDetail(actor);
      const spell = spellGroups[0]?.ranks[0]?.spells[0];
      expect(spell?.name).toBe('Darkness');
      expect(spell?.usesPerDay).toBe(1);
    });

    it('skips spellcasting entries with no spells', () => {
      const actor = makeActor({
        items: [
          {
            id: 'entry-empty',
            name: 'Empty Entry',
            type: 'spellcastingEntry',
            img: '',
            system: {
              tradition: { value: 'arcane' },
              prepared: { value: 'prepared' },
              spelldc: { dc: 20, value: 12 },
            },
          },
        ],
      });
      expect(pcActorToDetail(actor).spellGroups).toHaveLength(0);
    });
  });
});
