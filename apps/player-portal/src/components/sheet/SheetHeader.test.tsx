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
    const { container } = render(<SheetHeader character={character} actorId="test-actor" onActorChanged={() => undefined} />);
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
    const { container } = render(<SheetHeader character={withoutBg} actorId="test-actor" onActorChanged={() => undefined} />);
    expect(container.querySelector('[data-section="identity"]')?.textContent).not.toContain('Hunter');
  });


  it('does not duplicate ancestry when heritage already contains it', () => {
    // Regression: "Venom-Resistant Vishkanya Vishkanya" was produced before
    // the de-duplication fix.
    const vishkanya: PreparedCharacter = {
      ...character,
      system: {
        ...character.system,
        details: {
          ...character.system.details,
          ancestry: { name: 'Vishkanya', trait: 'vishkanya' },
          heritage: { name: 'Venom-Resistant Vishkanya', trait: null },
        },
      },
    };
    const { container } = render(<SheetHeader character={vishkanya} actorId="test-actor" onActorChanged={() => undefined} />);
    const identity = container.querySelector('[data-section="identity"]');
    expect(identity?.textContent).toContain('Venom-Resistant Vishkanya');
    expect(identity?.textContent).not.toContain('Venom-Resistant Vishkanya Vishkanya');
  });

  it('renders portrait img with a leading-slash asset path', () => {
    const { container } = render(<SheetHeader character={character} actorId="test-actor" onActorChanged={() => undefined} />);
    const img = container.querySelector('[data-testid="character-portrait"]') as HTMLImageElement | null;
    expect(img, 'portrait img element').toBeTruthy();
    // Amiri fixture: "systems/pf2e/icons/iconics/portraits/amiri.webp"
    expect(img?.getAttribute('src')).toBe('/systems/pf2e/icons/iconics/portraits/amiri.webp');
  });

  it('renders portrait placeholder when img is empty', () => {
    const noImg: PreparedCharacter = { ...character, img: '' };
    const { container } = render(<SheetHeader character={noImg} actorId="test-actor" onActorChanged={() => undefined} />);
    expect(container.querySelector('[data-testid="character-portrait"]')).toBeNull();
    expect(container.querySelector('[data-testid="character-portrait-placeholder"]')).toBeTruthy();
  });
});
