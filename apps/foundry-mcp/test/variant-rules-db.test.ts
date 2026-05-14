import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openPf2eDb,
  closePf2eDb,
  getVariantRules,
  setVariantRules,
  KNOWN_VARIANT_RULE_KEYS,
  DEFAULT_VARIANT_RULES,
} from '@foundry-toolkit/db/pf2e';

const dbPath = join(tmpdir(), `variant-rules-test-${process.pid.toString()}.db`);

describe('pf2e.db – variant_rules (settings table)', () => {
  before(() => {
    openPf2eDb(dbPath);
  });

  after(() => {
    closePf2eDb();
  });

  it('returns all-false defaults when no row exists', () => {
    assert.deepEqual(getVariantRules(), DEFAULT_VARIANT_RULES);
  });

  it('round-trips freeArchetype enabled', () => {
    setVariantRules({ ...DEFAULT_VARIANT_RULES, freeArchetype: true });
    const rules = getVariantRules();
    assert.equal(rules.freeArchetype, true);
    assert.equal(rules.ancestryParagon, false);
    assert.equal(rules.dualClass, false);
  });

  it('round-trips all keys enabled', () => {
    const allTrue = {
      freeArchetype: true,
      ancestryParagon: true,
      dualClass: true,
      automaticBonusProgression: true,
      proficiencyWithoutLevel: true,
      gradualAbilityBoosts: true,
    };
    setVariantRules(allTrue);
    assert.deepEqual(getVariantRules(), allTrue);
  });

  it('upserts on repeated writes', () => {
    setVariantRules({ ...DEFAULT_VARIANT_RULES, freeArchetype: true });
    setVariantRules({ ...DEFAULT_VARIANT_RULES, freeArchetype: false, ancestryParagon: true });
    const rules = getVariantRules();
    assert.equal(rules.freeArchetype, false);
    assert.equal(rules.ancestryParagon, true);
  });

  it('KNOWN_VARIANT_RULE_KEYS has exactly six entries', () => {
    assert.equal(KNOWN_VARIANT_RULE_KEYS.size, 6);
    for (const key of [
      'freeArchetype',
      'ancestryParagon',
      'dualClass',
      'automaticBonusProgression',
      'proficiencyWithoutLevel',
      'gradualAbilityBoosts',
    ]) {
      assert.ok(KNOWN_VARIANT_RULE_KEYS.has(key), `missing key: ${key}`);
    }
  });
});
