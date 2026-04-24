import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { PreparedCharacter } from '../../api/types';
import { SheetHeader } from './SheetHeader';

const character = amiri as unknown as PreparedCharacter;

describe('SheetHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders name, level, class, background, and ancestry', () => {
    const { container } = render(<SheetHeader character={character} />);
    expect(container.textContent).toContain('Amiri');
    const identity = container.querySelector('[data-section="identity"]');
    expect(identity, 'identity line').toBeTruthy();
    // Level 1 · Barbarian · Hunter · Human
    expect(identity?.textContent).toContain('Level 1');
    expect(identity?.textContent).toContain('Barbarian');
    expect(identity?.textContent).toContain('Hunter');
    expect(identity?.textContent).toContain('Human');
  });

  it('omits background when no background item is present', () => {
    const withoutBg: PreparedCharacter = {
      ...character,
      items: character.items.filter((i) => i.type !== 'background'),
    };
    const { container } = render(<SheetHeader character={withoutBg} />);
    expect(container.querySelector('[data-section="identity"]')?.textContent).not.toContain('Hunter');
  });

  it('renders rarity badge when non-common (Amiri is unique)', () => {
    const { container } = render(<SheetHeader character={character} />);
    const badge = container.querySelector('[data-badge="rarity"]');
    expect(badge, 'rarity badge').toBeTruthy();
    expect(badge?.textContent).toBe('Unique');
  });

  it('renders alliance badge for party members', () => {
    const { container } = render(<SheetHeader character={character} />);
    const badge = container.querySelector('[data-badge="alliance"]');
    expect(badge, 'alliance badge').toBeTruthy();
    expect(badge?.textContent).toBe('Party');
  });

  it('omits rarity badge when rarity is common', () => {
    const common: PreparedCharacter = {
      ...character,
      system: {
        ...character.system,
        traits: { ...character.system.traits, rarity: 'common' },
      },
    };
    const { container } = render(<SheetHeader character={common} />);
    expect(container.querySelector('[data-badge="rarity"]')).toBeNull();
  });

  it('omits alliance badge when alliance is null', () => {
    const neutral: PreparedCharacter = {
      ...character,
      system: {
        ...character.system,
        details: { ...character.system.details, alliance: null },
      },
    };
    const { container } = render(<SheetHeader character={neutral} />);
    expect(container.querySelector('[data-badge="alliance"]')).toBeNull();
  });
});
