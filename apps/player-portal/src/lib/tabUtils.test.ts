import { describe, it, expect } from 'vitest';
import { normalizeTabId } from './tabUtils';

describe('normalizeTabId', () => {
  it('passes through all valid tab IDs unchanged', () => {
    const valid = ['character', 'actions', 'spells', 'inventory', 'feats', 'details', 'progression'];
    for (const id of valid) {
      expect(normalizeTabId(id), `valid id: ${id}`).toBe(id);
    }
  });

  it('redirects the removed "crafting" tab to "inventory"', () => {
    expect(normalizeTabId('crafting')).toBe('inventory');
  });

  it('redirects the removed "proficiencies" and "background" tabs to "details"', () => {
    expect(normalizeTabId('proficiencies')).toBe('details');
    expect(normalizeTabId('background')).toBe('details');
  });

  it('falls back to "character" for unrecognised IDs', () => {
    expect(normalizeTabId('unknown-tab')).toBe('character');
    expect(normalizeTabId('')).toBe('character');
    expect(normalizeTabId('CRAFTING')).toBe('character'); // case-sensitive — no match
    expect(normalizeTabId('Inventory')).toBe('character'); // must be lowercase
  });
});
