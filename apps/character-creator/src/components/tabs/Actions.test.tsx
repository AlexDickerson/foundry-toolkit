import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { Ability, AbilityKey, PreparedActorItem, Strike } from '../../api/types';
import { Actions } from './Actions';

// Amiri's three strikes with their expected attack modifiers (as per
// /prepared's pre-computed variants). MAP values: -5 and -10 for normal
// weapons; -4 and -8 for agile weapons like unarmed.
const EXPECTED_STRIKES = {
  'basic-unarmed': { label: 'Unarmed Attack', variants: ['+7', '+3 (MAP -4)', '-1 (MAP -8)'] },
  'bastard-sword': { label: 'Bastard Sword', variants: ['+7', '+2 (MAP -5)', '-3 (MAP -10)'] },
  javelin: { label: 'Javelin', variants: ['+5', '+0 (MAP -5)', '-5 (MAP -10)'] },
};

const actions = (amiri as unknown as { system: { actions: Strike[] } }).system.actions;
const items = (amiri as unknown as { items: PreparedActorItem[] }).items;
const abilities = (amiri as unknown as { system: { abilities: Record<AbilityKey, Ability> } }).system.abilities;

describe('Actions tab — strikes', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a card per visible strike', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    for (const slug of Object.keys(EXPECTED_STRIKES)) {
      const card = container.querySelector(`[data-strike-slug="${slug}"]`);
      expect(card, `strike card for ${slug}`).toBeTruthy();
    }
  });

  it('renders each strike label', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    for (const [slug, { label }] of Object.entries(EXPECTED_STRIKES)) {
      const card = container.querySelector(`[data-strike-slug="${slug}"]`);
      expect(within(card as HTMLElement).getByText(label)).toBeTruthy();
    }
  });

  it("renders each strike's three attack variants with MAP labels", () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    for (const [slug, { variants }] of Object.entries(EXPECTED_STRIKES)) {
      const card = container.querySelector(`[data-strike-slug="${slug}"]`);
      for (const label of variants) {
        expect(within(card as HTMLElement).getByText(label), `${slug} variant ${label}`).toBeTruthy();
      }
    }
  });

  it('shows weapon traits on the Bastard Sword card', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const card = container.querySelector('[data-strike-slug="bastard-sword"]');
    expect(card?.textContent).toContain('Two-Hand d12');
  });

  it("shows Amiri's javelin quantity (4)", () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const card = container.querySelector('[data-strike-slug="javelin"]');
    expect(card?.textContent).toContain('×4');
  });

  // Amiri: STR +4, trained weapons, no runes, no bonus damage.
  //   Unarmed (melee):       1d4+4 bludgeoning
  //   Bastard Sword (melee): 1d8+4 slashing
  //   Javelin (ranged+thrown): 1d6+4 piercing
  it('folds STR into melee strike damage when abilities are provided', () => {
    const { container } = render(<Actions actions={actions} items={items} abilities={abilities} />);
    const unarmed = container.querySelector('[data-strike-slug="basic-unarmed"] [data-role="strike-damage"]');
    const bastard = container.querySelector('[data-strike-slug="bastard-sword"] [data-role="strike-damage"]');
    expect(unarmed?.textContent).toBe('1d4+4 bludgeoning');
    expect(bastard?.textContent).toBe('1d8+4 slashing');
  });

  it('adds STR to a thrown ranged weapon (javelin)', () => {
    const { container } = render(<Actions actions={actions} items={items} abilities={abilities} />);
    const javelin = container.querySelector('[data-strike-slug="javelin"] [data-role="strike-damage"]');
    expect(javelin?.textContent).toBe('1d6+4 piercing');
  });

  it('falls back to base-die damage when abilities are not provided', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const bastard = container.querySelector('[data-strike-slug="bastard-sword"] [data-role="strike-damage"]');
    expect(bastard?.textContent).toBe('1d8 slashing');
  });

  it('applies the striking rune by adding dice', () => {
    const buffed: Strike[] = actions.map((s) => {
      if (s.slug !== 'bastard-sword') return s;
      return {
        ...s,
        item: {
          ...s.item,
          system: {
            ...s.item.system,
            runes: { potency: 0, striking: 1, property: [] },
          },
        },
      };
    });
    const { container } = render(<Actions actions={buffed} items={items} abilities={abilities} />);
    const bastard = container.querySelector('[data-strike-slug="bastard-sword"] [data-role="strike-damage"]');
    expect(bastard?.textContent).toBe('2d8+4 slashing');
  });
});

describe('Actions tab — action items', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the Actions section with Rage and Demoralize (both 1-action)', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const section = container.querySelector('[data-action-section="action"]');
    expect(section, 'Actions section').toBeTruthy();
    expect(section?.textContent).toContain('Rage');
    expect(section?.textContent).toContain('Demoralize');
    // Both are 1-action so the cost badge reads "1A".
    const cards = section?.querySelectorAll('[data-action-kind="action"]');
    for (const card of Array.from(cards ?? [])) {
      expect(card.textContent).toContain('1A');
    }
  });

  it('renders the Free Actions section with Quick-Tempered', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const section = container.querySelector('[data-action-section="free"]');
    expect(section, 'Free Actions section').toBeTruthy();
    expect(section?.textContent).toContain('Quick-Tempered');
    expect(section?.textContent).toContain('F');
  });

  it('omits the Reactions section when Amiri has no reactions', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const section = container.querySelector('[data-action-section="reaction"]');
    expect(section).toBeNull();
  });

  it('renders empty-state when no strikes and no action items', () => {
    const { container } = render(<Actions actions={[]} items={[]} />);
    expect(container.textContent).toContain('No actions available');
  });

  it('collapses action cards by default and expands on click', () => {
    const { container } = render(<Actions actions={actions} items={items} />);
    const section = container.querySelector('[data-action-section="action"]') as HTMLElement;
    const rage = within(section)
      .getAllByText(/Rage/i)[0]
      ?.closest('[data-action-id]') as HTMLElement | null;
    expect(rage, 'Rage card').toBeTruthy();
    expect(rage?.getAttribute('data-expanded')).toBe('false');
    expect(rage?.querySelector('[data-role="action-description"]')).toBeNull();

    const toggle = rage?.querySelector('[data-testid="action-card-toggle"]') as HTMLElement;
    fireEvent.click(toggle);

    expect(rage?.getAttribute('data-expanded')).toBe('true');
    const body = rage?.querySelector('[data-role="action-description"]');
    expect(body, 'description body').toBeTruthy();
    // Rage's description starts with "You tap into your inner fury".
    expect(body?.textContent).toContain('inner fury');
  });
});
