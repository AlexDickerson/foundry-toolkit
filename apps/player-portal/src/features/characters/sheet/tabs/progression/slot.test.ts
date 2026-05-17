import { describe, it, expect } from 'vitest';
import type { ClassItem } from '@/features/characters/types';
import { buildLevelSlotMap, parseFeatLocation, featSlotLocationFor } from './slot';

function makeClassSys(): ClassItem['system'] {
  // Minimal stand-in matching the only fields buildLevelSlotMap reads.
  return {
    items: {},
    classFeatLevels: { value: [1, 2, 4] },
    ancestryFeatLevels: { value: [1, 5] },
    skillFeatLevels: { value: [2] },
    generalFeatLevels: { value: [3] },
    skillIncreaseLevels: { value: [3] },
  } as unknown as ClassItem['system'];
}

describe('parseFeatLocation', () => {
  it('parses archetype-N → archetype-feat slot', () => {
    expect(parseFeatLocation('archetype-2')).toEqual({ slot: 'archetype-feat', level: 2 });
    expect(parseFeatLocation('archetype-20')).toEqual({ slot: 'archetype-feat', level: 20 });
  });

  it('still parses the existing four prefixes', () => {
    expect(parseFeatLocation('class-1')).toEqual({ slot: 'class-feat', level: 1 });
    expect(parseFeatLocation('ancestry-1')).toEqual({ slot: 'ancestry-feat', level: 1 });
    expect(parseFeatLocation('skill-2')).toEqual({ slot: 'skill-feat', level: 2 });
    expect(parseFeatLocation('general-3')).toEqual({ slot: 'general-feat', level: 3 });
  });

  it('returns null for unrecognised prefixes', () => {
    expect(parseFeatLocation('bonus-2')).toBeNull();
    expect(parseFeatLocation('archetype-')).toBeNull();
  });
});

describe('featSlotLocationFor', () => {
  it('returns archetype-N for archetype-feat slot', () => {
    expect(featSlotLocationFor('archetype-feat', 2)).toBe('archetype-2');
    expect(featSlotLocationFor('archetype-feat', 20)).toBe('archetype-20');
  });
});

describe('buildLevelSlotMap', () => {
  it('omits archetype-feat slots when no levels supplied', () => {
    const map = buildLevelSlotMap(makeClassSys());
    for (const slots of map.values()) {
      expect(slots).not.toContain('archetype-feat');
    }
  });

  it('injects archetype-feat at each level in archetypeFeatLevels', () => {
    const map = buildLevelSlotMap(makeClassSys(), [2, 4, 6, 8]);
    expect(map.get(2)).toContain('archetype-feat');
    expect(map.get(4)).toContain('archetype-feat');
    expect(map.get(6)).toContain('archetype-feat');
    expect(map.get(8)).toContain('archetype-feat');
    expect(map.get(3)).not.toContain('archetype-feat');
  });

  it('renders archetype-feat right after class-feat at shared levels', () => {
    const map = buildLevelSlotMap(makeClassSys(), [2, 4]);
    const lvl2 = map.get(2);
    expect(lvl2).toBeDefined();
    const classIdx = lvl2!.indexOf('class-feat');
    const archIdx = lvl2!.indexOf('archetype-feat');
    expect(classIdx).toBeGreaterThanOrEqual(0);
    expect(archIdx).toBe(classIdx + 1);
  });
});
