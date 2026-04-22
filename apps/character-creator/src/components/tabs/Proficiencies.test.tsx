import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { CharacterSystem } from '../../api/types';
import { Proficiencies } from './Proficiencies';

// Amiri is a level-1 human barbarian. Expected values from the live
// /prepared payload (see src/fixtures/amiri-prepared.json). Keep these
// baseline — not exhaustive — so the test remains stable as fields are
// added. Each skill row + class DC row contains the label both as the
// visible name and inside the ModifierTooltip heading, so we always scope
// queries by data-statistic / data-slug rather than globally.

const EXPECTED_SKILLS: Record<string, { value: number; rank: number }> = {
  acrobatics: { value: 5, rank: 1 },
  athletics: { value: 7, rank: 1 },
  arcana: { value: 0, rank: 0 },
  intimidation: { value: 4, rank: 1 },
  survival: { value: 3, rank: 1 },
  stealth: { value: 2, rank: 0 },
  'tanning-lore': { value: 3, rank: 1 },
};

const system = (amiri as unknown as { system: CharacterSystem }).system;

describe('Proficiencies', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every core skill and its value + rank', () => {
    const { container } = render(<Proficiencies system={system} />);
    for (const [slug, { value, rank }] of Object.entries(EXPECTED_SKILLS)) {
      const row = container.querySelector(`[data-statistic="${slug}"]`);
      expect(row, `row for ${slug}`).toBeTruthy();
      const expected = value >= 0 ? `+${value.toString()}` : value.toString();
      expect(within(row as HTMLElement).getAllByText(expected).length).toBeGreaterThan(0);
      const chip = row?.querySelector('[data-rank]');
      expect(chip?.getAttribute('data-rank')).toBe(String(rank));
    }
  });

  it('renders the lore skill (Tanning Lore, from Hunter background) as a named row', () => {
    const { container } = render(<Proficiencies system={system} />);
    const row = container.querySelector('[data-statistic="tanning-lore"]');
    expect(row, 'tanning-lore row').toBeTruthy();
    expect(within(row as HTMLElement).getAllByText('Tanning Lore').length).toBeGreaterThan(0);
  });

  it('renders martial attack proficiencies', () => {
    const { container } = render(<Proficiencies system={system} />);
    for (const slug of ['simple', 'martial', 'advanced', 'unarmed']) {
      const row = container.querySelector(`[data-slug="${slug}"]`);
      expect(row, `attack row for ${slug}`).toBeTruthy();
    }
  });

  it('renders martial defense proficiencies', () => {
    const { container } = render(<Proficiencies system={system} />);
    for (const slug of ['unarmored', 'light', 'medium', 'heavy']) {
      const row = container.querySelector(`[data-slug="${slug}"]`);
      expect(row, `defense row for ${slug}`).toBeTruthy();
    }
  });

  it('renders the class DC — Barbarian at DC 17', () => {
    const { container } = render(<Proficiencies system={system} />);
    // The ClassDC row has no data-slug attribute yet; query by unique content.
    const dcRows = Array.from(container.querySelectorAll('li')).filter((li) => li.textContent?.includes('17'));
    expect(dcRows.length).toBeGreaterThan(0);
    const barbRow = dcRows.find((li) => li.textContent?.includes('Barbarian'));
    expect(barbRow, 'Barbarian DC row').toBeTruthy();
  });

  it('omits spellcasting when rank is 0', () => {
    const { container } = render(<Proficiencies system={system} />);
    // Amiri has spellcasting rank 0; the Spells header key shouldn't render.
    const headers = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headers.some((h) => h?.includes('Spells'))).toBe(false);
  });
});
