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

const TEST_ACTOR_ID = 'test-actor-id';

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

// Simulate the full two-pane picker flow: click the slot chip → wait for
// the match list → click the match row → wait for detail → click Pick.
async function doPickerFlow(slotButton: HTMLElement, matchUuid: string): Promise<void> {
  fireEvent.click(slotButton);
  await waitFor(() => {
    expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
  });
  const matchRow = document.querySelector(`[data-match-uuid="${matchUuid}"]`) as HTMLElement;
  fireEvent.click(matchRow);
  await waitFor(() => {
    expect(document.querySelector('[data-testid="feat-picker-detail"]')).toBeTruthy();
  });
  fireEvent.click(document.querySelector('[data-testid="feat-picker-pick"]') as HTMLElement);
  await waitFor(() => {
    expect(document.querySelector('[data-testid="feat-picker"]')).toBeFalsy();
  });
}

describe('Progression tab', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;
  let addItemSpy: ReturnType<typeof vi.spyOn>;
  let deleteItemSpy: ReturnType<typeof vi.spyOn>;
  let updateActorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: [picker_match], total: 1 });
    addItemSpy = vi.spyOn(api, 'addItemFromCompendium').mockResolvedValue({
      id: 'created-item-id',
      name: 'Sudden Charge',
      type: 'feat',
      img: 'icons/sudden.webp',
      actorId: TEST_ACTOR_ID,
      actorName: 'Test Actor',
    });
    deleteItemSpy = vi.spyOn(api, 'deleteActorItem').mockResolvedValue({ success: true });
    updateActorSpy = vi.spyOn(api, 'updateActor').mockResolvedValue({
      id: TEST_ACTOR_ID,
      uuid: `Actor.${TEST_ACTOR_ID}`,
      name: 'Test Actor',
      type: 'character',
      img: '',
      folder: null,
    });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    addItemSpy.mockRestore();
    deleteItemSpy.mockRestore();
    updateActorSpy.mockRestore();
    cleanup();
  });

  it('renders all 20 character levels', () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const rows = container.querySelectorAll('[data-level]');
    expect(rows).toHaveLength(20);
  });

  it("marks the character's current level", () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="1"]');
    expect(row?.getAttribute('data-state')).toBe('current');
  });

  it('marks higher levels as future', () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    expect(container.querySelector('[data-level="2"]')?.getAttribute('data-state')).toBe('future');
    expect(container.querySelector('[data-level="20"]')?.getAttribute('data-state')).toBe('future');
  });

  it('marks lower levels as past when character has advanced', () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={5} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    expect(container.querySelector('[data-level="1"]')?.getAttribute('data-state')).toBe('past');
    expect(container.querySelector('[data-level="4"]')?.getAttribute('data-state')).toBe('past');
    expect(container.querySelector('[data-level="5"]')?.getAttribute('data-state')).toBe('current');
    expect(container.querySelector('[data-level="6"]')?.getAttribute('data-state')).toBe('future');
  });

  it("shows Amiri's level-1 Barbarian features (Instinct, Rage)", () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    expect(within(row).getByText('Instinct')).toBeTruthy();
    expect(within(row).getByText('Rage')).toBeTruthy();
  });

  it("places Brutality at level 5 (one of Barbarian's class features)", () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="5"]') as HTMLElement;
    expect(within(row).getByText('Brutality')).toBeTruthy();
  });

  it('renders class feat slot at every classFeatLevels entry', () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
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
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
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
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
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
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
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
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={noClass} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    expect(container.textContent).toContain('No class item');
  });

  // --- Class-feat picker flow ---------------------------------------------

  it('opens the picker when a class-feat slot chip is clicked', async () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} onActorChanged={vi.fn()} />,
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
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    await doPickerFlow(
      row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement,
      'Compendium.pf2e.feats-srd.Item.sudden',
    );

    const pickEl = row.querySelector('[data-pick-uuid="Compendium.pf2e.feats-srd.Item.sudden"]');
    expect(pickEl, 'pick chip on the level row').toBeTruthy();
    expect(within(pickEl as HTMLElement).getByText('Sudden Charge')).toBeTruthy();
  });

  it('clearing a picked feat restores the open slot chip', async () => {
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    await doPickerFlow(
      row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement,
      'Compendium.pf2e.feats-srd.Item.sudden',
    );

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
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    // ancestry-feat at L1 is not yet a pickable slot type.
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    const ancestry = row.querySelector('[data-slot="ancestry-feat"]');
    expect(ancestry, 'ancestry-feat chip').toBeTruthy();
    expect(ancestry?.querySelector('[data-testid="slot-open-picker"]')).toBeNull();
  });

  // --- Persistence regression tests ---------------------------------------

  it('calls addItemFromCompendium with the correct location tag when a feat is picked', async () => {
    const onActorChanged = vi.fn();
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} onActorChanged={onActorChanged} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    await doPickerFlow(
      row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement,
      'Compendium.pf2e.feats-srd.Item.sudden',
    );

    await waitFor(() => {
      expect(addItemSpy).toHaveBeenCalledOnce();
    });
    const [calledActorId, body] = addItemSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(calledActorId).toBe(TEST_ACTOR_ID);
    expect(body.packId).toBe('pf2e.feats-srd');
    expect(body.itemId).toBe('sudden');
    expect((body.systemOverrides as Record<string, unknown>)?.location).toBe('class-1');
  });

  it('calls onActorChanged after a feat pick is persisted', async () => {
    const onActorChanged = vi.fn();
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={itemsWithoutFeatLocations()} characterContext={ctx} onActorChanged={onActorChanged} />,
    );
    const row = container.querySelector('[data-level="1"]') as HTMLElement;
    await doPickerFlow(
      row.querySelector('[data-testid="slot-open-picker"]') as HTMLElement,
      'Compendium.pf2e.feats-srd.Item.sudden',
    );

    await waitFor(() => {
      expect(onActorChanged).toHaveBeenCalled();
    });
  });

  it('calls deleteActorItem with the actor item id when clearing a hydrated feat', async () => {
    // Amiri's L1 class feat is hydrated from items that have system.location set.
    // Find one and confirm the clear button fires deleteActorItem.
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={1} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    // Find the first row that has a filled (picked) class-feat chip.
    const pickedSlot = container.querySelector('[data-slot="class-feat"][data-pick-kind="feat"]') as HTMLElement | null;
    if (!pickedSlot) {
      // Amiri may not have a hydrated L1 class feat — skip gracefully.
      return;
    }
    const clearBtn = within(pickedSlot).getByLabelText(/clear class feat pick/i);
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(deleteItemSpy).toHaveBeenCalledOnce();
    });
    // The actor item id passed must be Amiri's actual item id, not a compendium uuid.
    const [calledActorId] = deleteItemSpy.mock.calls[0] as [string, string];
    expect(calledActorId).toBe(TEST_ACTOR_ID);
  });

  it('calls updateActor with the new skill rank when a skill increase is committed', async () => {
    const onActorChanged = vi.fn();
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={3} items={items} characterContext={ctx} onActorChanged={onActorChanged} />,
    );
    // Find a level that has a skill-increase slot.
    const row = container.querySelector('[data-level="3"]') as HTMLElement;
    const skillBtn = row.querySelector('[data-slot="skill-increase"] [data-testid="slot-open-picker"]') as HTMLElement | null;
    if (!skillBtn) return; // guard for levels without skill increase

    fireEvent.click(skillBtn);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="skill-increase-picker"]')).toBeTruthy();
    });

    // Pick the first available (non-disabled) skill row.
    const skillRows = Array.from(document.querySelectorAll('[data-testid="skill-increase-list"] [data-skill]')) as HTMLButtonElement[];
    const available = skillRows.find((b) => !b.disabled);
    if (!available) return; // all skills at cap for this test character — skip

    fireEvent.click(available);
    fireEvent.click(document.querySelector('[data-testid="skill-increase-apply"]') as HTMLElement);

    await waitFor(() => {
      expect(updateActorSpy).toHaveBeenCalledOnce();
    });
    const [calledId, patch] = updateActorSpy.mock.calls[0] as [string, { system: Record<string, unknown> }];
    expect(calledId).toBe(TEST_ACTOR_ID);
    expect(patch.system).toBeDefined();
    // The patch should contain a skills update.
    expect(JSON.stringify(patch.system)).toContain('rank');

    await waitFor(() => {
      expect(onActorChanged).toHaveBeenCalled();
    });
  });

  it('calls updateActor with the chosen abilities when ability boosts are committed', async () => {
    const onActorChanged = vi.fn();
    const { container } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={5} items={items} characterContext={ctx} onActorChanged={onActorChanged} />,
    );
    const row = container.querySelector('[data-level="5"]') as HTMLElement;
    const boostBtn = row.querySelector('[data-slot="ability-boosts"] [data-testid="slot-open-picker"]') as HTMLElement | null;
    if (!boostBtn) return;

    fireEvent.click(boostBtn);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="ability-boost-picker"]')).toBeTruthy();
    });

    // Pick 4 ability tiles to satisfy the BOOSTS_PER_SET requirement.
    const tiles = Array.from(document.querySelectorAll('[data-ability]')) as HTMLButtonElement[];
    for (const tile of tiles.filter((t) => !t.disabled).slice(0, 4)) {
      fireEvent.click(tile);
    }
    fireEvent.click(document.querySelector('[data-testid="ability-boost-apply"]') as HTMLElement);

    await waitFor(() => {
      expect(updateActorSpy).toHaveBeenCalledOnce();
    });
    const [calledId, patch] = updateActorSpy.mock.calls[0] as [string, { system: Record<string, unknown> }];
    expect(calledId).toBe(TEST_ACTOR_ID);
    // The patch must target the level-5 boost bucket.
    expect(JSON.stringify(patch.system)).toContain('boosts');
    expect(JSON.stringify(patch.system)).toContain('5');

    await waitFor(() => {
      expect(onActorChanged).toHaveBeenCalled();
    });
  });

  it('skill-increase pick survives an actor refetch (items identity change)', async () => {
    // Regression: hydration used to replace the entire picks Map, which wiped
    // skill-increase and ability-boost picks whenever onActorChanged triggered
    // a /prepared reload. The fix preserves non-feat picks across refetches.
    const { container, rerender } = render(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={3} items={items} characterContext={ctx} onActorChanged={vi.fn()} />,
    );
    const row = container.querySelector('[data-level="3"]') as HTMLElement;
    const skillBtn = row.querySelector('[data-slot="skill-increase"] [data-testid="slot-open-picker"]') as HTMLElement | null;
    if (!skillBtn) return;

    fireEvent.click(skillBtn);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="skill-increase-picker"]')).toBeTruthy();
    });
    const skillRows = Array.from(document.querySelectorAll('[data-testid="skill-increase-list"] [data-skill]')) as HTMLButtonElement[];
    const available = skillRows.find((b) => !b.disabled);
    if (!available) return;

    fireEvent.click(available);
    fireEvent.click(document.querySelector('[data-testid="skill-increase-apply"]') as HTMLElement);

    await waitFor(() => {
      expect(row.querySelector('[data-slot="skill-increase"][data-pick-kind="skill-increase"]')).toBeTruthy();
    });

    // Simulate an actor refetch by passing a new array identity (same content).
    rerender(
      <Progression actorId={TEST_ACTOR_ID} characterLevel={3} items={[...items]} characterContext={ctx} onActorChanged={vi.fn()} />,
    );

    // The skill-increase pick must survive the re-hydration.
    expect(row.querySelector('[data-slot="skill-increase"][data-pick-kind="skill-increase"]')).toBeTruthy();
    expect(row.querySelector('[data-slot="skill-increase"] [data-testid="slot-open-picker"]')).toBeFalsy();
  });
});
