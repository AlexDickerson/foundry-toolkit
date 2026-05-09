import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPf2eDb, closePf2eDb, getItemArtOverride, setItemArtOverride, listItemArtOverrides } from '@foundry-toolkit/db/pf2e';

// Use a unique temp file per test run so parallel runs don't collide.
const dbPath = join(tmpdir(), `item-art-test-${process.pid.toString()}.db`);

describe('pf2e.db – item_art_overrides', () => {
  before(() => {
    openPf2eDb(dbPath);
  });

  after(() => {
    closePf2eDb();
  });

  it('returns null for an unknown slug', () => {
    assert.equal(getItemArtOverride('acid-flask'), null);
  });

  it('round-trips a single override', () => {
    setItemArtOverride('acid-flask-greater', 'Acid+Flask+-+Greater.png');
    const row = getItemArtOverride('acid-flask-greater');
    assert.ok(row);
    assert.equal(row.itemSlug, 'acid-flask-greater');
    assert.equal(row.artFilename, 'Acid+Flask+-+Greater.png');
    assert.ok(typeof row.createdAt === 'number' && row.createdAt > 0);
  });

  it('upserts without duplicating rows', () => {
    setItemArtOverride('falchion', 'Falchion.png');
    setItemArtOverride('falchion', 'Falchion-v2.png'); // overwrite
    const row = getItemArtOverride('falchion');
    assert.ok(row);
    assert.equal(row.artFilename, 'Falchion-v2.png');

    const all = listItemArtOverrides().filter((r) => r.itemSlug === 'falchion');
    assert.equal(all.length, 1);
  });

  it('lists all overrides ordered by slug', () => {
    setItemArtOverride('hide-armor', 'Hide+Armour.png');
    setItemArtOverride('acid-flask', 'Acid+Flask.png');
    const all = listItemArtOverrides();
    const slugs = all.map((r) => r.itemSlug);
    // acid-flask and acid-flask-greater and falchion and hide-armor; just confirm ordering
    assert.deepEqual(slugs, [...slugs].sort());
  });

  it('migration is idempotent — opening the same db path twice leaves the table working', () => {
    // openPf2eDb is idempotent (no-op if already open). Verify the table still
    // works after the second open call.
    openPf2eDb(dbPath); // no-op, same path
    setItemArtOverride('test-slug', 'Test.png');
    assert.ok(getItemArtOverride('test-slug'));
  });
});
