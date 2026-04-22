import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { PreparedActorItem } from '../../api/types';
import { Inventory } from './Inventory';

const items = (amiri as unknown as { items: PreparedActorItem[] }).items;

// Amiri's backpack id — referenced by all 9 items stowed inside.
const BACKPACK_ID = 'l25ZlJJVpWamk5Ye';

// Grid is the default view; tests that care about container nesting
// (backpack-with-contents) run in list view, so they flip the toggle
// first. This helper finds the List button and clicks it.
function selectListView(container: HTMLElement): void {
  const listBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'List');
  if (!listBtn) throw new Error('List toggle button not found');
  fireEvent.click(listBtn);
}

describe('Inventory tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows coin totals (5 sp + 6 gp)', () => {
    const { container } = render(<Inventory items={items} />);
    const coins = container.querySelector('[data-section="coins"]');
    expect(coins, 'coin strip').toBeTruthy();
    expect(coins?.textContent).toContain('6');
    expect(coins?.textContent).toContain('gp');
    expect(coins?.textContent).toContain('5');
    expect(coins?.textContent).toContain('sp');
  });

  it('renders the major top-level items', () => {
    const { container } = render(<Inventory items={items} />);
    const names = Array.from(container.querySelectorAll('[data-item-id]')).map((el) => el.textContent ?? '');
    const joined = names.join(' | ');
    expect(joined).toContain('Hide Armor');
    expect(joined).toContain('Bastard Sword');
    expect(joined).toContain('Javelin');
    expect(joined).toContain('Healing Potion');
    expect(joined).toContain('Backpack');
  });

  it('marks the Hide Armor as equipped and the Backpack as worn', () => {
    const { container } = render(<Inventory items={items} />);
    const armor = Array.from(container.querySelectorAll('[data-item-type="armor"]')).find((el) =>
      el.textContent?.includes('Hide Armor'),
    );
    expect(armor?.textContent).toContain('Equipped');

    const backpack = Array.from(container.querySelectorAll('[data-item-type="backpack"]')).find((el) =>
      el.textContent?.includes('Backpack'),
    );
    expect(backpack?.textContent).toContain('Worn');
  });

  it('shows the Javelin quantity (×4) and Healing Potion (×2)', () => {
    const { container } = render(<Inventory items={items} />);
    // Quantities render as "×N" suffix next to the name
    const javelin = Array.from(container.querySelectorAll('[data-item-type="weapon"]')).find((el) =>
      el.textContent?.includes('Javelin'),
    );
    expect(javelin?.textContent).toContain('×4');

    const potion = Array.from(container.querySelectorAll('[data-item-type="consumable"]')).find((el) =>
      el.textContent?.includes('Healing Potion'),
    );
    expect(potion?.textContent).toContain('×2');
  });

  it('expands the Backpack to show its nine stowed items', () => {
    const { container } = render(<Inventory items={items} />);
    selectListView(container);
    const contents = container.querySelector(`[data-container-contents="${BACKPACK_ID}"]`);
    expect(contents, 'backpack contents panel').toBeTruthy();
    const childNames = Array.from((contents as HTMLElement).querySelectorAll('[data-item-id]')).map(
      (el) => el.textContent ?? '',
    );
    const joined = childNames.join(' | ');
    for (const expected of [
      'Rope',
      'Waterskin',
      'Chalk',
      'Flint and Steel',
      'Rations',
      'Torch',
      'Bedroll',
      'Soap',
      'Grappling Hook',
    ]) {
      expect(joined, `${expected} in backpack`).toContain(expected);
    }
  });

  it('nests stowed items under their container, not at the top level', () => {
    const { container } = render(<Inventory items={items} />);
    selectListView(container);
    // Top-level list items are direct children of the section's primary
    // <ul>. Check via item-id so we don't confuse ourselves with nested
    // textContent (Backpack's <li> contains its children's text too).
    const topIds = Array.from(container.querySelectorAll('section > ul > [data-item-id]')).map((el) =>
      el.getAttribute('data-item-id'),
    );
    expect(topIds).toContain(BACKPACK_ID);

    // Any item with a containerId must NOT appear at the top level.
    const stowedIds = items
      .filter(
        (i): i is PreparedActorItem & { system: { containerId: string } } =>
          typeof (i.system as { containerId?: unknown }).containerId === 'string',
      )
      .map((i) => i.id);
    for (const sid of stowedIds) {
      expect(topIds, `stowed item ${sid} should not be at top level`).not.toContain(sid);
    }
  });

  it('renders empty-state when no physical items exist', () => {
    const { container } = render(<Inventory items={[]} />);
    expect(container.textContent).toContain('No items yet');
  });
});
