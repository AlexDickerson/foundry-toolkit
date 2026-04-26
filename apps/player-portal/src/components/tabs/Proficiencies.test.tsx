import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { CharacterSystem } from '../../api/types';
import { Proficiencies } from './Proficiencies';

// Amiri is a level-1 human barbarian. Skills now live on the Character tab;
// Proficiencies only renders Attacks, Defenses, Spellcasting, Class DCs.

const system = (amiri as unknown as { system: CharacterSystem }).system;

describe('Proficiencies', () => {
  afterEach(() => {
    cleanup();
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
