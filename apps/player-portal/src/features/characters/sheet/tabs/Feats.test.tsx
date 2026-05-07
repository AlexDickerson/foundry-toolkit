import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import amiri from '@/fixtures/amiri-prepared.json';
import type { FeatItem, PreparedActorItem } from '@/features/characters/types';
import { Feats } from './Feats';
import { resolveFeatCategory } from '@/_quarantine/lib/pf2e-maps';

// Amiri's expected feats grouped by category, from the live fixture.
// Shape: { category: [featName, featName, ...] }
const EXPECTED: Record<string, string[]> = {
  ancestry: ['Natural Ambition'],
  class: ['Raging Intimidation', 'Sudden Charge'],
  classfeature: ['Instinct', 'Rage', 'Giant Instinct', 'Quick-Tempered'],
  skill: ['Survey Wildlife', 'Intimidating Glare'],
  general: ['Diehard'],
};

const items = (amiri as unknown as { items: PreparedActorItem[] }).items;

describe('Feats tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a section per populated category', () => {
    const { container } = render(<Feats items={items} />);
    for (const category of Object.keys(EXPECTED)) {
      const section = container.querySelector(`[data-feat-category="${category}"]`);
      expect(section, `feats section for ${category}`).toBeTruthy();
    }
  });

  it("places each of Amiri's feats in the expected category", () => {
    const { container } = render(<Feats items={items} />);
    for (const [category, featNames] of Object.entries(EXPECTED)) {
      const section = container.querySelector(`[data-feat-category="${category}"]`);
      // Look in the card's summary row only — expanded descriptions
      // can contain @UUID links to other feats, which would otherwise
      // make getByText match multiple elements.
      const summaries = Array.from((section as HTMLElement).querySelectorAll('summary')).map(
        (el) => el.textContent ?? '',
      );
      for (const name of featNames) {
        expect(
          summaries.some((s) => s.includes(name)),
          `${name} in ${category} (summaries: ${summaries.join(' | ')})`,
        ).toBe(true);
      }
    }
  });

  it('shows a level label on each feat card', () => {
    const { container } = render(<Feats items={items} />);
    // Every feat should show "Level <n>" in the expanded panel (Amiri's feats are all level 1).
    const levelLabels = container.querySelectorAll('[data-feat-slug]');
    expect(levelLabels.length).toBeGreaterThan(0);
    for (const el of Array.from(levelLabels)) {
      expect(el.textContent).toMatch(/Level \d/);
    }
  });

  it('always shows the Bonus Feats section even when empty', () => {
    const { container } = render(<Feats items={items} />);
    const bonus = container.querySelector('[data-feat-category="bonus"]');
    expect(bonus, 'Bonus Feats section').toBeTruthy();
    expect(bonus?.textContent).toContain('Bonus Feats');
    // Amiri has no bonus feats — placeholder text should appear.
    expect(bonus?.textContent).toContain('None yet');
  });

  it('shows all six canonical categories with placeholders when empty', () => {
    const { container } = render(<Feats items={[]} />);
    for (const category of ['ancestry', 'class', 'classfeature', 'skill', 'general', 'bonus']) {
      const section = container.querySelector(`[data-feat-category="${category}"]`);
      expect(section, `${category} section`).toBeTruthy();
      expect(section?.textContent).toContain('None yet');
    }
    // PFS Boons stays hidden when empty.
    expect(container.querySelector('[data-feat-category="pfsboon"]')).toBeNull();
    // Archetype stays hidden when empty (not a canonical always-show category).
    expect(container.querySelector('[data-feat-category="archetype"]')).toBeNull();
  });

  it('routes an archetype feat to its own section, not Class Feats', () => {
    const archetypeFeat: FeatItem = makeFeat({ category: 'class', traits: ['archetype'], name: 'Crafter Dedication' });
    const classFeat: FeatItem = makeFeat({ category: 'class', traits: [], name: 'Power Attack' });
    const { container } = render(<Feats items={[archetypeFeat, classFeat]} />);

    const archetypeSection = container.querySelector('[data-feat-category="archetype"]');
    expect(archetypeSection, 'archetype section exists').toBeTruthy();
    expect(archetypeSection?.textContent).toContain('Crafter Dedication');
    expect(archetypeSection?.textContent).not.toContain('Power Attack');

    const classSection = container.querySelector('[data-feat-category="class"]');
    expect(classSection?.textContent).toContain('Power Attack');
    expect(classSection?.textContent).not.toContain('Crafter Dedication');
  });
});

// ─── resolveFeatCategory predicate ─────────────────────────────────────

function makeFeat({ category, traits, name }: { category: string; traits: string[]; name?: string }): FeatItem {
  return {
    id: name ?? category,
    name: name ?? category,
    type: 'feat',
    img: '',
    system: {
      slug: null,
      level: { value: 1 },
      category,
      traits: { value: traits, rarity: 'common' },
      description: { value: '' },
    },
  };
}

describe('resolveFeatCategory', () => {
  it('routes a pure class feat to "class"', () => {
    expect(resolveFeatCategory(makeFeat({ category: 'class', traits: ['fighter'] }))).toBe('class');
  });

  it('routes an archetype feat (category: class, trait: archetype) to "archetype"', () => {
    expect(resolveFeatCategory(makeFeat({ category: 'class', traits: ['archetype', 'dedication'] }))).toBe('archetype');
  });

  it('routes an ancestry feat to "ancestry"', () => {
    expect(resolveFeatCategory(makeFeat({ category: 'ancestry', traits: ['human'] }))).toBe('ancestry');
  });

  it('routes a general feat to "general"', () => {
    expect(resolveFeatCategory(makeFeat({ category: 'general', traits: ['general'] }))).toBe('general');
  });

  it('routes a skill feat to "skill"', () => {
    expect(resolveFeatCategory(makeFeat({ category: 'skill', traits: ['skill', 'acrobatics'] }))).toBe('skill');
  });
});
