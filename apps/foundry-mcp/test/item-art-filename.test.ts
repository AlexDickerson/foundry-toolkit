import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArtFilename, sluggify } from '../src/cli/seed-item-art.js';

describe('parseArtFilename', () => {
  it('decodes + as space and +-+ as a variant separator', () => {
    const result = parseArtFilename('Acid+Flask+-+Greater.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Acid Flask (Greater)');
    assert.equal(result.originalFilename, 'Acid+Flask+-+Greater.png');
  });

  it('decodes multi-word variant', () => {
    const result = parseArtFilename('Aeon+Stone+-+Agate+Ellipsoid.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Aeon Stone (Agate Ellipsoid)');
  });

  it('handles a no-variant filename', () => {
    const result = parseArtFilename('Falchion.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Falchion');
  });

  it('decodes %26 as &', () => {
    const result = parseArtFilename('Guns+%26+Gears+Special.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Guns & Gears Special');
  });

  it('normalises UK Armour spelling to Armor', () => {
    const result = parseArtFilename('Hide+Armour.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Hide Armor');
  });

  it('normalises Armour in a variant position', () => {
    const result = parseArtFilename('Scale+Mail+Armour+-+Greater.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Scale Mail Armor (Greater)');
  });

  it('returns null for non-png files', () => {
    assert.equal(parseArtFilename('Acid+Flask.jpg'), null);
    assert.equal(parseArtFilename('README.txt'), null);
  });

  it('preserves originalFilename verbatim', () => {
    const result = parseArtFilename('Acid+Flask+-+Greater.png');
    assert.ok(result);
    assert.equal(result.originalFilename, 'Acid+Flask+-+Greater.png');
  });

  it('oddball with short variant code — parses without error (lands in needs-review at runtime)', () => {
    // Briar+-+S8.png is a known oddball: "Briar (S8)" won't match any
    // standard PF2e compendium entry, so it ends up in the needs-review list
    // when the seed CLI runs. The parser itself doesn't fail — it just emits
    // the name and lets the lookup step decide.
    const result = parseArtFilename('Briar+-+S8.png');
    assert.ok(result);
    assert.equal(result.itemName, 'Briar (S8)');
  });
});

describe('sluggify', () => {
  it('lowercases and replaces non-alphanumeric runs with dashes', () => {
    assert.equal(sluggify('Acid Flask (Greater)'), 'acid-flask-greater');
  });

  it('handles a simple one-word name', () => {
    assert.equal(sluggify('Falchion'), 'falchion');
  });

  it('handles multi-word variant', () => {
    assert.equal(sluggify('Aeon Stone (Agate Ellipsoid)'), 'aeon-stone-agate-ellipsoid');
  });

  it('strips leading and trailing dashes', () => {
    assert.equal(sluggify('(test)'), 'test');
  });
});
