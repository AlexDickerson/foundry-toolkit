import { extractChangedPaths } from '../EventChannelController';

describe('extractChangedPaths', () => {
  it('flattens a nested diff to dot-notation leaves', () => {
    expect(
      extractChangedPaths({
        system: {
          attributes: { hp: { value: 10 } },
          crafting: { formulas: [{ uuid: 'abc' }] },
        },
      }).sort(),
    ).toEqual(['system.attributes.hp.value', 'system.crafting.formulas'].sort());
  });

  it('passes dot-notation keys through as-is', () => {
    expect(
      extractChangedPaths({
        'system.crafting.formulas': [],
        'system.attributes.hp.value': 10,
      }).sort(),
    ).toEqual(['system.attributes.hp.value', 'system.crafting.formulas'].sort());
  });

  it('handles mixed nested + dot-notation in the same payload', () => {
    expect(
      extractChangedPaths({
        'system.crafting.formulas': [],
        system: { attributes: { hp: { value: 10 } } },
      }).sort(),
    ).toEqual(['system.attributes.hp.value', 'system.crafting.formulas'].sort());
  });

  it('treats null and primitive values as leaves', () => {
    expect(extractChangedPaths({ system: { details: { biography: null } } })).toEqual([
      'system.details.biography',
    ]);
    expect(extractChangedPaths({ name: 'Amiri', img: 'foo.webp' }).sort()).toEqual(['img', 'name']);
  });

  it('treats arrays as a single leaf (no index paths)', () => {
    expect(extractChangedPaths({ system: { crafting: { formulas: [{ uuid: 'a' }, { uuid: 'b' }] } } })).toEqual([
      'system.crafting.formulas',
    ]);
  });

  it('returns an empty array for non-object input', () => {
    expect(extractChangedPaths(null)).toEqual([]);
    expect(extractChangedPaths(undefined)).toEqual([]);
    expect(extractChangedPaths('system.crafting')).toEqual([]);
    expect(extractChangedPaths(42)).toEqual([]);
  });

  it('returns an empty array for an empty diff', () => {
    expect(extractChangedPaths({})).toEqual([]);
  });

  it('lets subscribers filter by path prefix', () => {
    const paths = extractChangedPaths({
      system: {
        crafting: { formulas: [] },
        attributes: { hp: { value: 10 } },
      },
    });
    expect(paths.some((p) => p.startsWith('system.crafting'))).toBe(true);
    expect(paths.some((p) => p.startsWith('system.attributes'))).toBe(true);
    expect(paths.some((p) => p.startsWith('system.details'))).toBe(false);
  });
});
