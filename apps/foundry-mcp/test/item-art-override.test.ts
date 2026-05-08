import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveDb } from '../src/db/live-db.js';
import { applyItemArtOverrides } from '../src/http/item-art-helper.js';

function makeItem(slug: string, img = 'systems/pf2e/icons/default.webp'): unknown {
  return { id: slug, name: 'Test Item', img, system: { slug } };
}

describe('applyItemArtOverrides', () => {
  let db: LiveDb;

  before(() => {
    db = new LiveDb(':memory:');
    db.setItemArtOverride('acid-flask-greater', 'Acid+Flask+-+Greater.png');
  });

  after(() => {
    db.close();
  });

  it('substitutes img for items that have a matching override', () => {
    const item = makeItem('acid-flask-greater');
    const result = applyItemArtOverrides([item], db) as unknown[];
    const out = result[0] as { img: string };
    assert.equal(out.img, '/item-art/Acid+Flask+-+Greater.png');
  });

  it('leaves img untouched for items with no override', () => {
    const original = 'systems/pf2e/icons/falchion.webp';
    const item = makeItem('falchion', original);
    const result = applyItemArtOverrides([item], db) as unknown[];
    const out = result[0] as { img: string };
    assert.equal(out.img, original);
  });

  it('handles the {items: [...]} envelope shape', () => {
    const envelope = { items: [makeItem('acid-flask-greater'), makeItem('falchion')] };
    const result = applyItemArtOverrides(envelope, db) as { items: { img: string }[] };
    assert.equal(result.items[0]!.img, '/item-art/Acid+Flask+-+Greater.png');
    assert.equal(result.items[1]!.img, 'systems/pf2e/icons/default.webp');
  });

  it('passes through non-item values unchanged', () => {
    assert.equal(applyItemArtOverrides(null, db), null);
    assert.equal(applyItemArtOverrides('string', db), 'string');
    assert.equal(applyItemArtOverrides(42, db), 42);
  });

  it('skips items without system.slug', () => {
    const noSlug = { id: 'x', name: 'No Slug', img: 'original.webp', system: {} };
    const result = applyItemArtOverrides([noSlug], db) as { img: string }[];
    assert.equal(result[0]!.img, 'original.webp');
  });

  it('does not mutate the original item object', () => {
    const item = makeItem('acid-flask-greater') as { img: string };
    const originalImg = item.img;
    applyItemArtOverrides([item], db);
    assert.equal(item.img, originalImg); // original unchanged
  });
});
