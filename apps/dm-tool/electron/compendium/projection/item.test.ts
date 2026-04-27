// Golden-ish fixture tests for the item wire → dm-tool projection layer.
// Covers: price helpers and all item projections.

import { describe, expect, it } from 'vitest';
import type { CompendiumDocument, CompendiumMatch } from '../types';
import {
  itemDocToBrowserDetail,
  itemDocToBrowserRow,
  itemDocToLootShortlistItem,
  itemMatchToBrowserRow,
  priceToCopper,
} from './item';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
// Price helpers
// ---------------------------------------------------------------------------

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
    // img is passed through from doc.img (raw path; IPC layer rewrites to proxy URL)
    expect(row.img).toBe('systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp');
  });

  it('returns null img for a default-icon placeholder', () => {
    const doc = potionOfHealingDoc();
    doc.img = 'systems/pf2e/icons/default-icons/consumable.svg';
    expect(itemDocToBrowserRow(doc).img).toBeNull();
  });

  it('returns null img when img is absent', () => {
    const doc = potionOfHealingDoc();
    doc.img = '';
    expect(itemDocToBrowserRow(doc).img).toBeNull();
  });
});

describe('itemDocToBrowserDetail', () => {
  it('includes cleaned description, parsed variants, and itemType', () => {
    const detail = itemDocToBrowserDetail(potionOfHealingDoc());
    expect(detail.description).toContain('Drink to regain ◆ HP.');
    expect(detail.source).toBe('Player Core');
    expect(detail.variants).toHaveLength(2);
    expect(detail.variants[0]).toEqual({ type: 'lesser', level: 3, price: '12 gp' });
    // Consumable defaults to activatable
    expect(detail.hasActivation).toBe(true);
    // itemType mirrors doc.type
    expect(detail.itemType).toBe('consumable');
  });

  it('itemType reflects the document type for non-consumable items', () => {
    const weaponDoc: CompendiumDocument = {
      id: 'sword1',
      uuid: 'Compendium.pf2e.equipment-srd.Item.sword1',
      name: 'Longsword',
      type: 'weapon',
      img: '',
      system: {
        level: { value: 0 },
        publication: { title: 'Core Rulebook', remaster: false },
        traits: { value: ['versatile-p'], rarity: 'common' },
        price: { value: { gp: 1 } },
        bulk: { value: 1 },
        usage: { value: 'held-in-one-hand' },
        description: { value: '<p>A standard one-handed sword.</p>' },
      },
    };
    const detail = itemDocToBrowserDetail(weaponDoc);
    expect(detail.itemType).toBe('weapon');
    expect(detail.description).toBe('A standard one-handed sword.');
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

  it('passes through a non-default img path', () => {
    const m = { ...itemMatch(), img: 'systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp' };
    expect(itemMatchToBrowserRow(m).img).toBe('systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp');
  });

  it('returns null img for an empty string (the fixture default)', () => {
    expect(itemMatchToBrowserRow(itemMatch()).img).toBeNull();
  });

  it('returns null img for a default-icon path', () => {
    const m = { ...itemMatch(), img: 'systems/pf2e/icons/default-icons/consumable.svg' };
    expect(itemMatchToBrowserRow(m).img).toBeNull();
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
