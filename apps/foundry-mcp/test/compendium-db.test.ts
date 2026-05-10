import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompendiumDb } from '../src/db/compendium-db.js';
import type { CompendiumDocument } from '../src/http/compendium-types.js';

const sampleDocs: CompendiumDocument[] = [
  {
    id: 'fireball',
    uuid: 'Compendium.pf2e.spells-srd.Item.fireball',
    name: 'Fireball',
    type: 'spell',
    img: '/icons/fire.webp',
    system: { level: { value: 3 } },
  },
  {
    id: 'shield',
    uuid: 'Compendium.pf2e.spells-srd.Item.shield',
    name: 'Shield',
    type: 'spell',
    img: '/icons/shield.webp',
    system: { level: { value: 1 } },
  },
];

describe('CompendiumDb', () => {
  let dir: string;
  let db: CompendiumDb;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'compendium-db-test-'));
    db = new CompendiumDb(join(dir, 'compendium-cache.db'));
  });

  after(() => {
    rmSync(dir, { recursive: true });
  });

  it('returns null for an uncached pack', () => {
    assert.equal(db.get('pf2e.spells-srd'), null);
  });

  it('stores and retrieves a pack', () => {
    db.set('pf2e.spells-srd', 'Spells', sampleDocs);
    const row = db.get('pf2e.spells-srd');
    assert.ok(row);
    assert.equal(row.packId, 'pf2e.spells-srd');
    assert.equal(row.packLabel, 'Spells');
    assert.equal(row.documents.length, 2);
    assert.equal(row.documents[0]?.name, 'Fireball');
    assert.ok(row.warmedAt > 0);
  });

  it('lists cached pack IDs', () => {
    db.set('pf2e.equipment-srd', 'Equipment', []);
    const ids = db.list();
    assert.ok(ids.includes('pf2e.spells-srd'));
    assert.ok(ids.includes('pf2e.equipment-srd'));
  });

  it('replaces an existing entry on re-set', () => {
    const updated: CompendiumDocument[] = [{ ...sampleDocs[0]!, name: 'Fireball (Updated)' }];
    db.set('pf2e.spells-srd', 'Spells', updated);
    const row = db.get('pf2e.spells-srd');
    assert.equal(row?.documents[0]?.name, 'Fireball (Updated)');
  });

  it('clears a single pack', () => {
    db.clear('pf2e.equipment-srd');
    assert.equal(db.get('pf2e.equipment-srd'), null);
    assert.ok(db.get('pf2e.spells-srd') !== null);
  });

  it('clears all packs when called without argument', () => {
    db.clear();
    assert.equal(db.list().length, 0);
  });
});
