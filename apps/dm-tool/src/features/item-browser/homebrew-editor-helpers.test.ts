import { describe, expect, it } from 'vitest';
import {
  DraftValidationError,
  draftToPayload,
  emptyDraft,
  templateToDraft,
  type ItemDraft,
} from './homebrew-editor-helpers';
import type { CompendiumItemTemplate } from '../../../electron/ipc/homebrew-items';

const fullWeaponTemplate: CompendiumItemTemplate = {
  name: 'Greatsword',
  type: 'weapon',
  img: 'systems/pf2e/icons/weapons/greatsword.webp',
  system: {
    level: { value: 0 },
    traits: { value: ['versatile-p'], rarity: 'common' },
    price: { value: { gp: 2, sp: 0, cp: 0, pp: 0 } },
    bulk: { value: 2 },
    description: { value: 'A sword.' },
    publication: { title: 'Pathfinder Player Core' },
    damage: { die: 'd12', dice: 1, damageType: 'slashing' },
    category: 'martial',
    group: 'sword',
    // Field the editor doesn't model — must round-trip via systemRaw.
    customField: 'preserve-me',
    nested: { value: 42 },
  },
  effects: [
    {
      name: 'Striking',
      disabled: false,
      transfer: true,
      changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1', priority: 20 }],
      duration: { rounds: 5 },
    },
  ],
  flags: { 'pf2e-toolbelt': { tag: 'demo' } },
};

describe('emptyDraft', () => {
  it('produces a valid blank draft for a default type', () => {
    const draft = emptyDraft();
    expect(draft.type).toBe('equipment');
    expect(draft.name).toBe('');
    expect(draft.rarity).toBe('common');
    expect(draft.traits).toEqual([]);
    expect(draft.systemRaw).toEqual({});
    expect(draft.effects).toEqual([]);
  });

  it('respects an explicit type', () => {
    expect(emptyDraft('weapon').type).toBe('weapon');
    expect(emptyDraft('treasure').type).toBe('treasure');
  });
});

describe('templateToDraft — identity stripping happens upstream, structure is read here', () => {
  it('reads name, type, img, level, rarity, traits, price, bulk, source, description', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    expect(draft.name).toBe('Greatsword');
    expect(draft.type).toBe('weapon');
    expect(draft.img).toBe('systems/pf2e/icons/weapons/greatsword.webp');
    expect(draft.level).toBe(0);
    expect(draft.rarity).toBe('common');
    expect(draft.traits).toEqual(['versatile-p']);
    expect(draft.price).toEqual({ pp: 0, gp: 2, sp: 0, cp: 0 });
    expect(draft.bulk).toBe('2');
    expect(draft.source).toBe('Pathfinder Player Core');
    expect(draft.description).toBe('A sword.');
  });

  it('reads weapon mechanical fields', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    expect(draft.weapon).toEqual({
      damageDie: 'd12',
      damageDice: 1,
      damageType: 'slashing',
      category: 'martial',
      group: 'sword',
    });
  });

  it('preserves unknown system fields via systemRaw', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    expect(draft.systemRaw['customField']).toBe('preserve-me');
    expect(draft.systemRaw['nested']).toEqual({ value: 42 });
  });

  it('reads active effects intact', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    expect(draft.effects).toHaveLength(1);
    expect(draft.effects[0]).toMatchObject({
      name: 'Striking',
      disabled: false,
      transfer: true,
      durationRounds: 5,
      changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1', priority: 20 }],
    });
  });

  it('preserves flags', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    expect(draft.flags).toEqual({ 'pf2e-toolbelt': { tag: 'demo' } });
  });

  it('handles a template missing every optional system field gracefully', () => {
    const draft = templateToDraft({
      name: 'Empty',
      type: 'equipment',
      img: null,
      system: {},
      effects: [],
      flags: {},
    });
    expect(draft.type).toBe('equipment');
    expect(draft.level).toBe(0);
    expect(draft.rarity).toBe('common');
    expect(draft.traits).toEqual([]);
    expect(draft.bulk).toBe('-');
    expect(draft.img).toBe('');
  });

  it('falls back to equipment type when the template has an unsupported type', () => {
    const draft = templateToDraft({
      name: 'Spell-as-item',
      type: 'spell',
      img: null,
      system: {},
      effects: [],
      flags: {},
    });
    expect(draft.type).toBe('equipment');
  });

  it('falls back to common rarity when traits.rarity is unrecognised', () => {
    const draft = templateToDraft({
      name: 'Weird',
      type: 'equipment',
      img: null,
      system: { traits: { value: [], rarity: 'mythic' } },
      effects: [],
      flags: {},
    });
    expect(draft.rarity).toBe('common');
  });
});

describe('draftToPayload', () => {
  it('rejects a blank name', () => {
    const draft = emptyDraft('weapon');
    expect(() => draftToPayload(draft)).toThrow(DraftValidationError);
  });

  it('writes core fields onto system', () => {
    const draft: ItemDraft = {
      ...emptyDraft('weapon'),
      name: 'Sword of Test',
      level: 3,
      rarity: 'uncommon',
      traits: ['magical', 'evocation'],
      price: { pp: 0, gp: 100, sp: 0, cp: 0 },
      bulk: '1',
      source: 'Homebrew Manual',
      description: 'A test sword.',
    };
    const payload = draftToPayload(draft);
    expect(payload.name).toBe('Sword of Test');
    expect(payload.type).toBe('weapon');
    expect(payload.system).toMatchObject({
      level: { value: 3 },
      traits: { value: ['magical', 'evocation'], rarity: 'uncommon' },
      price: { value: { pp: 0, gp: 100, sp: 0, cp: 0 } },
      bulk: { value: 1 },
      description: { value: 'A test sword.' },
      publication: { title: 'Homebrew Manual' },
    });
  });

  it('writes weapon mechanical fields on weapon type', () => {
    const draft: ItemDraft = {
      ...emptyDraft('weapon'),
      name: 'Test',
      weapon: { damageDie: 'd10', damageDice: 2, damageType: 'piercing', category: 'martial', group: 'spear' },
    };
    const payload = draftToPayload(draft);
    expect(payload.system).toMatchObject({
      damage: { die: 'd10', dice: 2, damageType: 'piercing' },
      category: 'martial',
      group: 'spear',
    });
  });

  it('writes armor mechanical fields on armor type', () => {
    const draft: ItemDraft = {
      ...emptyDraft('armor'),
      name: 'Plate',
      armor: { category: 'heavy', group: 'plate', acBonus: 6, strength: 18, dex: 0, check: -3, slowness: -10 },
    };
    const payload = draftToPayload(draft);
    expect(payload.system).toMatchObject({
      category: 'heavy',
      group: 'plate',
      acBonus: 6,
      strength: 18,
      dex: 0,
      check: -3,
      slowness: -10,
    });
  });

  it('omits frequency and uses when max is 0', () => {
    const payload = draftToPayload({ ...emptyDraft('equipment'), name: 'X' });
    expect(payload.system).not.toHaveProperty('frequency');
    expect(payload.system).not.toHaveProperty('uses');
  });

  it('writes uses + frequency when max is positive', () => {
    const payload = draftToPayload({
      ...emptyDraft('consumable'),
      name: 'Wand',
      uses: { value: 7, max: 10 },
      frequency: { max: 3, per: 'PT24H' },
    });
    expect(payload.system).toMatchObject({ uses: { value: 7, max: 10 }, frequency: { max: 3, per: 'PT24H' } });
  });

  it('writes rules JSON to system.rules when valid', () => {
    const payload = draftToPayload({
      ...emptyDraft('equipment'),
      name: 'X',
      rulesJson: JSON.stringify([{ key: 'FlatModifier', selector: 'ac', value: 1 }]),
    });
    expect(payload.system['rules']).toEqual([{ key: 'FlatModifier', selector: 'ac', value: 1 }]);
  });

  it('rejects invalid rules JSON', () => {
    expect(() => draftToPayload({ ...emptyDraft('equipment'), name: 'X', rulesJson: '{not valid}' })).toThrow(/parsed/);
  });

  it('rejects rules JSON that is not an array', () => {
    expect(() => draftToPayload({ ...emptyDraft('equipment'), name: 'X', rulesJson: '{"key":"X"}' })).toThrow(/array/);
  });

  it('writes effects through to payload (round-trip preserves changes / mode / value)', () => {
    const payload = draftToPayload({
      ...emptyDraft('equipment'),
      name: 'X',
      effects: [
        {
          name: 'Bonus',
          disabled: false,
          transfer: true,
          changes: [{ key: 'system.attributes.ac.value', mode: 4, value: '18', priority: 40 }],
          durationRounds: 10,
        },
      ],
    });
    expect(payload.effects).toEqual([
      {
        name: 'Bonus',
        disabled: false,
        transfer: true,
        changes: [{ key: 'system.attributes.ac.value', mode: 4, value: '18', priority: 40 }],
        duration: { rounds: 10 },
      },
    ]);
  });

  it('drops effects key when none are defined', () => {
    const payload = draftToPayload({ ...emptyDraft('equipment'), name: 'X' });
    expect(payload).not.toHaveProperty('effects');
  });

  it('preserves systemRaw fields the editor does not know about', () => {
    const draft: ItemDraft = {
      ...emptyDraft('weapon'),
      name: 'Test',
      systemRaw: { customField: 'keep-me', another: { nested: true } },
    };
    const payload = draftToPayload(draft);
    expect(payload.system['customField']).toBe('keep-me');
    expect(payload.system['another']).toEqual({ nested: true });
  });

  it('round-trips: templateToDraft → draftToPayload preserves systemRaw + effects + flags', () => {
    const draft = templateToDraft(fullWeaponTemplate);
    // Pretend the user only edited the name.
    draft.name = 'Custom Greatsword';
    const payload = draftToPayload(draft);
    expect(payload.name).toBe('Custom Greatsword');
    expect(payload.type).toBe('weapon');
    expect(payload.system['customField']).toBe('preserve-me');
    expect(payload.system['nested']).toEqual({ value: 42 });
    expect(payload.system['damage']).toMatchObject({ die: 'd12', dice: 1, damageType: 'slashing' });
    expect(payload.system['traits']).toMatchObject({ rarity: 'common', value: ['versatile-p'] });
    expect(payload.flags).toEqual({ 'pf2e-toolbelt': { tag: 'demo' } });
    expect(payload.effects).toHaveLength(1);
    expect(payload.effects?.[0]).toMatchObject({
      name: 'Striking',
      transfer: true,
      duration: { rounds: 5 },
      changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1', priority: 20 }],
    });
  });
});
