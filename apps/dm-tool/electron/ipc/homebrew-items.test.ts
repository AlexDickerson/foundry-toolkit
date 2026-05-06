// Tests for the identity-stripping helper used by the homebrew item
// editor's "Use as template" path. Coverage focuses on the bookkeeping
// fields a clone must drop so re-submitting the result produces a fresh
// document rather than reattaching to the source compendium item.

import { describe, expect, it } from 'vitest';
import { stripIdentityForClone } from './homebrew-items-clone';
import type { CompendiumDocument } from '../compendium/types';

function doc(overrides: Partial<CompendiumDocument> & Record<string, unknown> = {}): CompendiumDocument {
  return {
    id: 'src-id',
    uuid: 'Compendium.pf2e.equipment-srd.Item.src-id',
    name: 'Source Item',
    type: 'weapon',
    img: 'systems/pf2e/icons/x.webp',
    system: { level: { value: 5 } },
    ...overrides,
  } as CompendiumDocument;
}

describe('stripIdentityForClone', () => {
  it('returns name, type, img, system from the source document', () => {
    const result = stripIdentityForClone(doc());
    expect(result.name).toBe('Source Item');
    expect(result.type).toBe('weapon');
    expect(result.img).toBe('systems/pf2e/icons/x.webp');
    expect(result.system).toEqual({ level: { value: 5 } });
  });

  it('coerces an empty img to null so the editor renders the placeholder cleanly', () => {
    const result = stripIdentityForClone(doc({ img: '' }));
    expect(result.img).toBeNull();
  });

  it('preserves effects[] but strips _id, _stats, and origin from each effect', () => {
    const result = stripIdentityForClone(
      doc({
        effects: [
          {
            _id: 'effect-id',
            _stats: { foo: 'bar' },
            origin: 'Compendium.pf2e.equipment-srd.Item.src-id',
            name: 'Striking',
            disabled: false,
            transfer: true,
            changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1' }],
          },
        ],
      } as Partial<CompendiumDocument>),
    );
    expect(result.effects).toHaveLength(1);
    const effect = result.effects[0];
    expect(effect).not.toHaveProperty('_id');
    expect(effect).not.toHaveProperty('_stats');
    expect(effect).not.toHaveProperty('origin');
    // Everything else round-trips intact.
    expect(effect).toMatchObject({
      name: 'Striking',
      disabled: false,
      transfer: true,
      changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1' }],
    });
  });

  it('returns an empty effects array when the source has none', () => {
    const result = stripIdentityForClone(doc());
    expect(result.effects).toEqual([]);
  });

  it('passes flags through (object-typed values only)', () => {
    const result = stripIdentityForClone(
      doc({
        flags: {
          'pf2e-toolbelt': { tag: 'demo' },
          // String value at the top level is NOT a valid flag scope and
          // should be filtered out.
          bogus: 'not-an-object',
        },
      } as Partial<CompendiumDocument>),
    );
    expect(result.flags).toEqual({ 'pf2e-toolbelt': { tag: 'demo' } });
  });

  it('falls back to {} for system / effects / flags when the source omits them', () => {
    const sparse = { id: 'x', uuid: 'u', name: 'X', type: 'equipment', img: '' } as unknown as CompendiumDocument;
    const result = stripIdentityForClone(sparse);
    expect(result.system).toEqual({});
    expect(result.effects).toEqual([]);
    expect(result.flags).toEqual({});
  });
});
