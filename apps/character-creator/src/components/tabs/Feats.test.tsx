import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { PreparedActorItem } from '../../api/types';
import { Feats } from './Feats';

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
    // Every feat should show "Lv <n>" (Amiri's feats are all level 1).
    const levelLabels = container.querySelectorAll('[data-feat-slug]');
    expect(levelLabels.length).toBeGreaterThan(0);
    for (const el of Array.from(levelLabels)) {
      expect(el.textContent).toMatch(/Lv \d/);
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
  });
});
