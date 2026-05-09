import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPf2eDb, closePf2eDb, setItemArtOverride } from '@foundry-toolkit/db/pf2e';
import { applyItemArtOverrides } from '../src/http/item-art-helper.js';

const dbPath = join(tmpdir(), `override-test-${process.pid.toString()}.db`);

function makeItem(slug: string, img = 'systems/pf2e/icons/default.webp'): unknown {
  return { id: slug, name: 'Test Item', img, system: { slug } };
}

describe('applyItemArtOverrides', () => {
  before(() => {
    openPf2eDb(dbPath);
    setItemArtOverride('acid-flask-greater', 'Acid+Flask+-+Greater.png');
  });

  after(() => {
    closePf2eDb();
  });

  it('substitutes img for items that have a matching override', () => {
    const result = applyItemArtOverrides([makeItem('acid-flask-greater')]) as { img: string }[];
    assert.equal(result[0]!.img, '/item-art/Acid+Flask+-+Greater.png');
  });

  it('leaves img untouched for items with no override', () => {
    const original = 'systems/pf2e/icons/falchion.webp';
    const result = applyItemArtOverrides([makeItem('falchion', original)]) as { img: string }[];
    assert.equal(result[0]!.img, original);
  });

  it('handles the {items: [...]} envelope shape', () => {
    const envelope = { items: [makeItem('acid-flask-greater'), makeItem('falchion')] };
    const result = applyItemArtOverrides(envelope) as { items: { img: string }[] };
    assert.equal(result.items[0]!.img, '/item-art/Acid+Flask+-+Greater.png');
    assert.equal(result.items[1]!.img, 'systems/pf2e/icons/default.webp');
  });

  it('passes through non-item values unchanged', () => {
    assert.equal(applyItemArtOverrides(null), null);
    assert.equal(applyItemArtOverrides('string'), 'string');
    assert.equal(applyItemArtOverrides(42), 42);
  });

  it('skips items without system.slug', () => {
    const noSlug = { id: 'x', name: 'No Slug', img: 'original.webp', system: {} };
    const result = applyItemArtOverrides([noSlug]) as { img: string }[];
    assert.equal(result[0]!.img, 'original.webp');
  });

  it('does not mutate the original item object', () => {
    const item = makeItem('acid-flask-greater') as { img: string };
    const originalImg = item.img;
    applyItemArtOverrides([item]);
    assert.equal(item.img, originalImg);
  });
});
