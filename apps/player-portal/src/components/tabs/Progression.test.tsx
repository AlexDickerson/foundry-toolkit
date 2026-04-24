import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, within, waitFor, fireEvent } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import { api } from '../../api/client';
import type { CompendiumMatch, PreparedActorItem, PreparedCharacter } from '../../api/types';
import { fromPreparedCharacter } from '../../prereqs';
import { Progression } from './Progression';

const rawItems = (amiri as unknown as { items: PreparedActorItem[] }).items;
const items = rawItems;
const ctx = fromPreparedCharacter(amiri as unknown as PreparedCharacter);

// Strip `system.location` off feat items so Progression's hydration
// doesn't pre-fill L1 slot chips. Picker-flow tests drive the slot
// chip interactions manually; hydration has its own coverage below.
function itemsWithoutFeatLocations(): PreparedActorItem[] {
  return rawItems.map((item) => {
    if (item.type !== 'feat') return item;
    const sys = item.system as { location?: unknown };
    if (typeof sys.location !== 'string') return item;
    const { location: _, ...rest } = sys;
    return { ...item, system: rest as PreparedActorItem['system'] };
  });
}

const picker_match: CompendiumMatch = {
  packId: 'pf2e.feats-srd',
  packLabel: 'Class Feats',
  documentId: 'sudden',
  uuid: 'Compendium.pf2e.feats-srd.Item.sudden',
  name: 'Sudden Charge',
  type: 'feat',
  img: 'icons/sudden.webp',
  level: 1,
  traits: ['barbarian', 'fighter'],
};

describe('Progression tab', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: [picker_match] });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  it('renders all 20 character levels', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    const rows = container.querySelectorAll('[data-level]');
    expect(rows).toHaveLength(20);
  });

  it("marks the character's current level", () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    const row = container.querySelector('[data-level="1"]');
    expect(row?.getAttribute('data-state')).toBe('current');
  });

  it('marks higher levels as future', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    expect(container.querySelector('[data-level="2"]')?.getAttribute('data-state')).toBe('future');
    expect(container.querySelector('[data-level="20"]')?.getAttribute('data-state')).toBe('future');
  });

  it('marks lower levels as past when character has advanced', () => {
    const { container } = render(<Progression characterLevel={5} items={items} characterContext={ctx} />);
    expect(container.querySelector('[data-level="1"]')?.getAttribute('data-state')).toBe('past');
    expect(container.querySelector('[data-level="4"]')?.getAttribute('data-state')).toBe('past');
    expect(container.querySelector('[data-level="5"]')?.getAttribute('data-state')).toBe('current');
    expect(container.querySelector('[data-level="6"]')?.getAttribute('data-state')).toBe('future');
  });

  it("shows Amiri's level-1 Barbarian features (Instinct, Rage)", () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    expect(within(row).getByText('Instinct')).toBeTruthy();
    expect(within(row).getByText('Rage')).toBeTruthy();
  });

  it("places Brutality at level 5 (one of Barbarian's class features)", () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    const row = container.querySelector('[data-level="5"]') as HTMLElement;
    expect(within(row).getByText('Brutality')).toBeTruthy();
  });

  it('renders class feat slot at every classFeatLevels entry', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    // Barbarian classFeatLevels: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    for (const level of [1, 2, 4, 6, 8]) {
      const row = container.querySelector(`[data-level="${level.toString()}"]`);
      const slot = row?.querySelector('[data-slot="class-feat"]');
      expect(slot, `class feat slot at level ${level.toString()}`).toBeTruthy();
    }
    // Level 3 is NOT in classFeatLevels for Barbarian.
    const level3 = container.querySelector('[data-level="3"]');
    expect(level3?.querySelector('[data-slot="class-feat"]')).toBeNull();
  });

  it('renders ancestry feat slot at the core rulebook levels', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    // ancestryFeatLevels: [1, 5, 9, 13, 17]
    for (const level of [1, 5, 9, 13, 17]) {
      const row = container.querySelector(`[data-level="${level.toString()}"]`);
      expect(
        row?.querySelector('[data-slot="ancestry-feat"]'),
        `ancestry slot at level ${level.toString()}`,
      ).toBeTruthy();
    }
    expect(container.querySelector('[data-level="2"]')?.querySelector('[data-slot="ancestry-feat"]')).toBeNull();
  });

  it('renders ability-boosts slot at levels 5, 10, 15, 20', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    for (const level of [5, 10, 15, 20]) {
      const row = container.querySelector(`[data-level="${level.toString()}"]`);
      expect(
        row?.querySelector('[data-slot="ability-boosts"]'),
        `ability boosts at level ${level.toString()}`,
      ).toBeTruthy();
    }
    expect(container.querySelector('[data-level="4"]')?.querySelector('[data-slot="ability-boosts"]')).toBeNull();
  });

  it('renders skill increase slot starting at level 3', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    for (const level of [3, 5, 7, 9]) {
      const row = container.querySelector(`[data-level="${level.toString()}"]`);
      expect(
        row?.querySelector('[data-slot="skill-increase"]'),
        `skill increase at level ${level.toString()}`,
      ).toBeTruthy();
    }
    for (const level of [1, 2, 4]) {
      expect(
        container.querySelector(`[data-level="${level.toString()}"]`)?.querySelector('[data-slot="skill-increase"]'),
      ).toBeNull();
    }
  });

  it('falls back to a friendly message when no class item is present', () => {
    const noClass = items.filter((i) => i.type !== 'class');
    const { container } = render(<Progression characterLevel={1} items={noClass} characterContext={ctx} />);
    expect(container.textContent).toContain('No class item');
  });

  // --- Class-feat picker flow ---------------------------------------------

  it('opens the picker when a class-feat slot chip is clicked', async () => {
    const { container } = render(
      <Progression characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    const trigger = row.querySelector('[data-slot="class-feat"] [data-testid="slot-open-picker"]') as HTMLElement;
    expect(trigger, 'class-feat chip button').toBeTruthy();

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker"]')).toBeTruthy();
    });

    // Picker should ask the API for barbarian feats at level ≤ 1 from the feats-srd pack.
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.traits).toEqual(['barbarian']);
    expect(call?.maxLevel).toBe(1);
    expect(call?.packIds).toEqual(['pf2e.feats-srd']);
  });

  it('commits the picked match into the level row and closes the picker', async () => {
    const { container } = render(
      <Progression characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    fireEvent.click(row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    // Two-pane flow: click the row to open detail, then confirm via Pick.
    const matchRow = document.querySelector('[data-match-uuid="Compendium.pf2e.feats-srd.Item.sudden"]') as HTMLElement;
    fireEvent.click(matchRow);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker-detail"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[data-testid="feat-picker-pick"]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker"]')).toBeFalsy();
    });

    const pickEl = row.querySelector('[data-pick-uuid="Compendium.pf2e.feats-srd.Item.sudden"]');
    expect(pickEl, 'pick chip on the level row').toBeTruthy();
    expect(within(pickEl as HTMLElement).getByText('Sudden Charge')).toBeTruthy();
  });

  it('clearing a picked feat restores the open slot chip', async () => {
    const { container } = render(
      <Progression characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    fireEvent.click(row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[data-match-uuid="Compendium.pf2e.feats-srd.Item.sudden"]') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker-detail"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[data-testid="feat-picker-pick"]') as HTMLElement);

    await waitFor(() => {
      expect(row.querySelector('[data-pick-uuid]')).toBeTruthy();
    });

    const clearBtn = within(row.querySelector('[data-slot="class-feat"]') as HTMLElement).getByLabelText(
      /clear class feat pick/i,
    );
    fireEvent.click(clearBtn);

    expect(row.querySelector('[data-pick-uuid]')).toBeFalsy();
    expect(row.querySelector('[data-testid="slot-open-picker"]')).toBeTruthy();
  });

  it('leaves non-clickable slot chips rendered as static labels', () => {
    const { container } = render(<Progression characterLevel={1} items={items} characterContext={ctx} />);
    // ancestry-feat at L1 is not yet a pickable slot type.
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    const ancestry = row.querySelector('[data-slot="ancestry-feat"]');
    expect(ancestry, 'ancestry-feat chip').toBeTruthy();
    expect(ancestry?.querySelector('[data-testid="slot-open-picker"]')).toBeNull();
  });
});
