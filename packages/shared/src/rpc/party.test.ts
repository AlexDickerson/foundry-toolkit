import { describe, it, expect } from 'vitest';
import { partyForMemberSchema, partyStashSchema } from './party.js';

describe('partyForMemberSchema', () => {
  it('parses a full response with party and multiple members', () => {
    const input = {
      party: { id: 'prt-1', name: 'The Party', img: 'img/party.webp' },
      members: [
        {
          id: 'chr-1',
          name: 'Amiri',
          img: 'img/amiri.webp',
          level: 5,
          hp: { value: 40, max: 60, temp: 0 },
          ac: 18,
          perceptionMod: 8,
          heroPoints: { value: 1, max: 3 },
          shield: null,
          conditions: [],
          isOwnedByUser: true,
        },
        {
          id: 'chr-2',
          name: 'Harsk',
          img: 'img/harsk.webp',
          level: 5,
          hp: { value: 55, max: 70, temp: 0 },
          ac: 22,
          perceptionMod: 12,
          heroPoints: { value: 0, max: 3 },
          shield: { hpValue: 18, hpMax: 20, raised: true, broken: false },
          conditions: [],
          isOwnedByUser: false,
        },
      ],
    };
    expect(partyForMemberSchema.parse(input)).toMatchObject(input);
  });

  it('parses null party (character not in any party)', () => {
    const input = { party: null, members: [] };
    expect(partyForMemberSchema.parse(input)).toEqual(input);
  });

  it('parses conditions with degrees and null values', () => {
    const input = {
      party: { id: 'prt-1', name: 'The Party', img: '' },
      members: [
        {
          id: 'chr-3',
          name: 'Kyra',
          img: '',
          level: 4,
          hp: { value: 30, max: 52, temp: 0 },
          ac: 19,
          perceptionMod: 7,
          heroPoints: { value: 2, max: 3 },
          shield: null,
          conditions: [
            { slug: 'frightened', value: 2 },
            { slug: 'sickened', value: 1 },
            { slug: 'off-guard', value: null },
          ],
          isOwnedByUser: false,
        },
      ],
    };
    const result = partyForMemberSchema.parse(input);
    expect(result.members[0]?.conditions).toEqual([
      { slug: 'frightened', value: 2 },
      { slug: 'sickened', value: 1 },
      { slug: 'off-guard', value: null },
    ]);
  });

  it('parses a member with a broken raised shield', () => {
    const input = {
      party: { id: 'prt-1', name: 'The Party', img: '' },
      members: [
        {
          id: 'chr-4',
          name: 'Valeros',
          img: '',
          level: 6,
          hp: { value: 80, max: 90, temp: 10 },
          ac: 24,
          perceptionMod: 9,
          heroPoints: { value: 1, max: 3 },
          shield: { hpValue: 2, hpMax: 20, raised: true, broken: true },
          conditions: [],
          isOwnedByUser: false,
        },
      ],
    };
    const result = partyForMemberSchema.parse(input);
    expect(result.members[0]?.shield).toEqual({ hpValue: 2, hpMax: 20, raised: true, broken: true });
  });

  it('fails on missing required fields', () => {
    expect(() => partyForMemberSchema.parse({ members: [] })).toThrow();
  });
});

describe('partyStashSchema', () => {
  it('parses an empty stash', () => {
    expect(partyStashSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it('parses items with system data', () => {
    const input = {
      items: [
        {
          id: 'itm-1',
          name: 'Healing Potion',
          type: 'consumable',
          img: 'img/potion.webp',
          system: { quantity: 3, price: { value: 3, denomination: 'gp' } },
        },
        {
          id: 'itm-2',
          name: 'Rope',
          type: 'equipment',
          img: '',
          system: { quantity: 1, bulk: { value: 'L' } },
        },
      ],
    };
    const result = partyStashSchema.parse(input);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: 'itm-1', name: 'Healing Potion' });
  });

  it('fails on missing items array', () => {
    expect(() => partyStashSchema.parse({})).toThrow();
  });
});
