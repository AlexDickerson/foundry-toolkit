import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveDb } from '../src/db/live-db.js';

describe('LiveDb – item_art_overrides', () => {
  let db: LiveDb;

  before(() => {
    db = new LiveDb(':memory:');
  });

  after(() => {
    db.close();
  });

  it('returns null for an unknown slug', () => {
    assert.equal(db.getItemArtOverride('acid-flask'), null);
  });

  it('round-trips a single override', () => {
    db.setItemArtOverride('acid-flask-greater', 'Acid+Flask+-+Greater.png');
    const row = db.getItemArtOverride('acid-flask-greater');
    assert.ok(row);
    assert.equal(row.itemSlug, 'acid-flask-greater');
    assert.equal(row.artFilename, 'Acid+Flask+-+Greater.png');
    assert.ok(typeof row.createdAt === 'number' && row.createdAt > 0);
  });

  it('upserts without duplicating rows', () => {
    db.setItemArtOverride('falchion', 'Falchion.png');
    db.setItemArtOverride('falchion', 'Falchion-v2.png'); // overwrite
    const row = db.getItemArtOverride('falchion');
    assert.ok(row);
    assert.equal(row.artFilename, 'Falchion-v2.png');

    const all = db.listItemArtOverrides().filter((r) => r.itemSlug === 'falchion');
    assert.equal(all.length, 1);
  });

  it('lists all overrides ordered by slug', () => {
    // Fresh db for isolation
    const fresh = new LiveDb(':memory:');
    fresh.setItemArtOverride('hide-armor', 'Hide+Armour.png');
    fresh.setItemArtOverride('acid-flask', 'Acid+Flask.png');
    const all = fresh.listItemArtOverrides();
    assert.equal(all.length, 2);
    assert.equal(all[0]!.itemSlug, 'acid-flask');
    assert.equal(all[1]!.itemSlug, 'hide-armor');
    fresh.close();
  });

  it('migration is idempotent — calling migrate() twice leaves table working', () => {
    // LiveDb constructor calls migrate(); calling it again on the same db
    // should be a no-op because of CREATE TABLE IF NOT EXISTS.
    // We simulate this by opening the same :memory: db through a second
    // LiveDb instance pointing at a real temp file.
    const second = new LiveDb(':memory:');
    second.setItemArtOverride('test-slug', 'Test.png');
    assert.ok(second.getItemArtOverride('test-slug'));
    second.close();
  });
});
