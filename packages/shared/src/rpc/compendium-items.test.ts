import { describe, expect, it } from 'vitest';
import { compendiumItemPayload, createCompendiumItemBody, ensureCompendiumPackBody } from './schemas.js';

describe('homebrew compendium-item RPC schemas', () => {
  describe('ensureCompendiumPackBody', () => {
    it('accepts a lowercase kebab-case name with a label', () => {
      const parsed = ensureCompendiumPackBody.parse({ name: 'homebrew-items', label: 'Homebrew Items' });
      expect(parsed).toEqual({ name: 'homebrew-items', label: 'Homebrew Items' });
    });

    it('accepts an explicit type=Item', () => {
      const parsed = ensureCompendiumPackBody.parse({ name: 'homebrew', label: 'X', type: 'Item' });
      expect(parsed.type).toBe('Item');
    });

    it('rejects names with uppercase letters, spaces, or dots', () => {
      expect(() => ensureCompendiumPackBody.parse({ name: 'Homebrew', label: 'X' })).toThrow();
      expect(() => ensureCompendiumPackBody.parse({ name: 'homebrew items', label: 'X' })).toThrow();
      expect(() => ensureCompendiumPackBody.parse({ name: 'world.x', label: 'X' })).toThrow();
    });

    it('rejects names that begin with a hyphen', () => {
      expect(() => ensureCompendiumPackBody.parse({ name: '-homebrew', label: 'X' })).toThrow();
    });

    it('rejects empty name or label', () => {
      expect(() => ensureCompendiumPackBody.parse({ name: '', label: 'X' })).toThrow();
      expect(() => ensureCompendiumPackBody.parse({ name: 'x', label: '' })).toThrow();
    });

    it('rejects an unsupported pack type', () => {
      expect(() => ensureCompendiumPackBody.parse({ name: 'x', label: 'X', type: 'Actor' })).toThrow();
    });
  });

  describe('compendiumItemPayload', () => {
    it('round-trips a minimal item with name, type, and system', () => {
      const parsed = compendiumItemPayload.parse({
        name: 'Sword of Test',
        type: 'weapon',
        system: { level: { value: 1 } },
      });
      expect(parsed.name).toBe('Sword of Test');
      expect(parsed.type).toBe('weapon');
      expect(parsed.system).toEqual({ level: { value: 1 } });
      expect(parsed.effects).toBeUndefined();
    });

    it('round-trips an item with active effects intact (every field preserved)', () => {
      const input = {
        name: 'Cloak of Resistance',
        type: 'equipment',
        system: { level: { value: 5 } },
        effects: [
          {
            name: 'Resistance Bonus',
            disabled: false,
            transfer: true,
            changes: [
              { key: 'system.attributes.resistances.fire', mode: 2, value: '5', priority: 20 },
              { key: 'system.attributes.ac.value', mode: 4, value: '18' },
            ],
            duration: { rounds: 10 },
          },
        ],
      };
      const parsed = compendiumItemPayload.parse(input);
      expect(parsed.effects).toHaveLength(1);
      expect(parsed.effects?.[0]?.changes).toEqual(input.effects[0].changes);
      expect(parsed.effects?.[0]?.duration).toEqual({ rounds: 10 });
      expect(parsed.effects?.[0]?.transfer).toBe(true);
    });

    it('rejects a change row with mode out of range', () => {
      expect(() =>
        compendiumItemPayload.parse({
          name: 'X',
          type: 'weapon',
          system: {},
          effects: [{ name: 'e', changes: [{ key: 'k', mode: 99, value: '1' }] }],
        }),
      ).toThrow();
    });

    it('rejects an effect with an empty name', () => {
      expect(() =>
        compendiumItemPayload.parse({
          name: 'X',
          type: 'weapon',
          system: {},
          effects: [{ name: '' }],
        }),
      ).toThrow();
    });

    it('rejects when system is missing', () => {
      expect(() => compendiumItemPayload.parse({ name: 'X', type: 'weapon' })).toThrow();
    });
  });

  describe('createCompendiumItemBody', () => {
    it('round-trips a full request', () => {
      const parsed = createCompendiumItemBody.parse({
        packId: 'world.homebrew-items',
        item: { name: 'X', type: 'weapon', system: {} },
      });
      expect(parsed.packId).toBe('world.homebrew-items');
      expect(parsed.item.name).toBe('X');
    });

    it('rejects empty packId', () => {
      expect(() =>
        createCompendiumItemBody.parse({ packId: '', item: { name: 'X', type: 'w', system: {} } }),
      ).toThrow();
    });
  });
});
