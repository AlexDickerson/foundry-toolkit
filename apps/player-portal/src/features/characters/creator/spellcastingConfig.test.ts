import { describe, expect, it } from 'vitest';
import {
  spellcastingConfigFor,
  sorcererBloodlineSlugFromItems,
} from './spellcastingConfig';
import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

describe('spellcastingConfigFor', () => {
  it('wizard → arcane prepared INT', () => {
    const config = spellcastingConfigFor('wizard');
    expect(config).toEqual({ tradition: 'arcane', prepared: 'prepared', ability: 'int' });
  });

  it('druid → primal prepared WIS', () => {
    const config = spellcastingConfigFor('druid');
    expect(config).toEqual({ tradition: 'primal', prepared: 'prepared', ability: 'wis' });
  });

  it('cleric → divine prepared WIS', () => {
    // Doctrine (Cloistered vs Warpriest) affects progression/slot bonuses via class
    // features but the entry itself is always divine/prepared/wis at level 1.
    const config = spellcastingConfigFor('cleric');
    expect(config).toEqual({ tradition: 'divine', prepared: 'prepared', ability: 'wis' });
  });

  it('bard → occult spontaneous CHA', () => {
    const config = spellcastingConfigFor('bard');
    expect(config).toEqual({ tradition: 'occult', prepared: 'spontaneous', ability: 'cha' });
  });

  it('oracle → divine spontaneous CHA', () => {
    const config = spellcastingConfigFor('oracle');
    expect(config).toEqual({ tradition: 'divine', prepared: 'spontaneous', ability: 'cha' });
  });

  it('magus → arcane prepared INT', () => {
    const config = spellcastingConfigFor('magus');
    expect(config).toEqual({ tradition: 'arcane', prepared: 'prepared', ability: 'int' });
  });

  it('psychic → occult spontaneous INT', () => {
    const config = spellcastingConfigFor('psychic');
    expect(config).toEqual({ tradition: 'occult', prepared: 'spontaneous', ability: 'int' });
  });

  it('sorcerer without bloodline → null (tradition unknown)', () => {
    expect(spellcastingConfigFor('sorcerer')).toBeNull();
    expect(spellcastingConfigFor('sorcerer', undefined)).toBeNull();
  });

  it('sorcerer + fey bloodline → primal spontaneous CHA', () => {
    const config = spellcastingConfigFor('sorcerer', 'bloodline-fey');
    expect(config).toEqual({ tradition: 'primal', prepared: 'spontaneous', ability: 'cha' });
  });

  it('sorcerer + angelic bloodline → divine spontaneous CHA', () => {
    const config = spellcastingConfigFor('sorcerer', 'bloodline-angelic');
    expect(config).toEqual({ tradition: 'divine', prepared: 'spontaneous', ability: 'cha' });
  });

  it('sorcerer + imperial bloodline → arcane spontaneous CHA', () => {
    const config = spellcastingConfigFor('sorcerer', 'bloodline-imperial');
    expect(config).toEqual({ tradition: 'arcane', prepared: 'spontaneous', ability: 'cha' });
  });

  it('sorcerer + elemental bloodline → primal spontaneous CHA', () => {
    const config = spellcastingConfigFor('sorcerer', 'bloodline-elemental');
    expect(config).toEqual({ tradition: 'primal', prepared: 'spontaneous', ability: 'cha' });
  });

  it('fighter → null (martial, no spellcasting entry)', () => {
    expect(spellcastingConfigFor('fighter')).toBeNull();
  });

  it('rogue → null', () => {
    expect(spellcastingConfigFor('rogue')).toBeNull();
  });

  it('barbarian → null', () => {
    expect(spellcastingConfigFor('barbarian')).toBeNull();
  });

  it('unknown class slug → null', () => {
    expect(spellcastingConfigFor('some-homebrew-class')).toBeNull();
  });
});

describe('sorcererBloodlineSlugFromItems', () => {
  function makeItem(overrides: Partial<PreparedActorItem>): PreparedActorItem {
    return {
      id: 'item1',
      name: 'Test Item',
      type: 'feat',
      img: '',
      system: {},
      ...overrides,
    };
  }

  it('returns slug when bloodline classfeature is present', () => {
    const items: PreparedActorItem[] = [
      makeItem({ type: 'class', system: { category: 'classfeature', slug: 'sorcerer' } }),
      makeItem({
        type: 'feat',
        system: { category: 'classfeature', slug: 'bloodline-fey' },
      }),
    ];
    expect(sorcererBloodlineSlugFromItems(items)).toBe('bloodline-fey');
  });

  it('returns undefined when no bloodline item is present', () => {
    const items: PreparedActorItem[] = [
      makeItem({ type: 'class', system: { slug: 'wizard' } }),
      makeItem({ type: 'feat', system: { category: 'classfeature', slug: 'wizard-spellcasting' } }),
    ];
    expect(sorcererBloodlineSlugFromItems(items)).toBeUndefined();
  });

  it('ignores non-classfeature feat items', () => {
    const items: PreparedActorItem[] = [
      makeItem({ type: 'feat', system: { category: 'general', slug: 'bloodline-fey' } }),
    ];
    expect(sorcererBloodlineSlugFromItems(items)).toBeUndefined();
  });

  it('ignores items without a slug', () => {
    const items: PreparedActorItem[] = [
      makeItem({ type: 'feat', system: { category: 'classfeature', slug: null } }),
    ];
    expect(sorcererBloodlineSlugFromItems(items)).toBeUndefined();
  });

  it('returns elemental bloodline slug', () => {
    const items: PreparedActorItem[] = [
      makeItem({ type: 'feat', system: { category: 'classfeature', slug: 'bloodline-elemental' } }),
    ];
    expect(sorcererBloodlineSlugFromItems(items)).toBe('bloodline-elemental');
  });
});
