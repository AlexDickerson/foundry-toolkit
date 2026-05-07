import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import amiri from '@/fixtures/amiri-prepared.json';
import type { PreparedActorItem } from '@/features/characters/types';
import { api } from '@/features/characters/api';
import { Inventory } from './Inventory';

const items = (amiri as unknown as { items: PreparedActorItem[] }).items;

// Amiri's backpack id — referenced by all 9 items stowed inside.
const BACKPACK_ID = 'l25ZlJJVpWamk5Ye';

// Grid is the default view; tests that care about container nesting
// (backpack-with-contents) run in list view, so they flip the toggle
// first. This helper finds the List button and clicks it.
function selectListView(container: HTMLElement): void {
  const listBtn = container.querySelector<HTMLButtonElement>('button[aria-label="List view"]');
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

  it('marks the Hide Armor as equipped and the Backpack as worn via emerald tint', () => {
    // Grid view uses colour instead of a chip — equipped/worn items get an
    // emerald border/bg on their <details> element rather than "Equipped" text.
    const { container } = render(<Inventory items={items} />);
    const armor = Array.from(container.querySelectorAll('[data-item-type="armor"]')).find((el) =>
      el.textContent?.includes('Hide Armor'),
    );
    expect(armor?.querySelector('details')?.className, 'Hide Armor equipped tint').toMatch(/item-equipped/);

    const backpack = Array.from(container.querySelectorAll('[data-item-type="backpack"]')).find((el) =>
      el.textContent?.includes('Backpack'),
    );
    expect(backpack?.querySelector('details')?.className, 'Backpack worn tint').toMatch(/item-equipped/);
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
    // Top-level list items now live inside a per-category list:
    // `[data-category] > ul > [data-item-id]`. The backpack appears
    // in the `containers` category at the top level; stowed items
    // show up as descendants of that <li>, not as siblings.
    const topIds = Array.from(container.querySelectorAll('[data-category] > ul > [data-item-id]')).map((el) =>
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

  it('groups items under category headers (weapons / armor / consumables / equipment / containers)', () => {
    const { container } = render(<Inventory items={items} />);
    const cats = Array.from(container.querySelectorAll('[data-category]')).map((el) =>
      el.getAttribute('data-category'),
    );
    // Amiri carries at least one of each of these types, so every
    // bucket should render in the grid view (the default).
    expect(cats).toEqual(expect.arrayContaining(['weapons', 'armor', 'consumables', 'equipment', 'containers']));
  });

  it('places the Bastard Sword under Weapons and Hide Armor under Armor & Shields', () => {
    const { container } = render(<Inventory items={items} />);
    const weapons = container.querySelector('[data-category="weapons"]');
    const armor = container.querySelector('[data-category="armor"]');
    expect(weapons?.textContent).toContain('Bastard Sword');
    expect(weapons?.textContent).not.toContain('Hide Armor');
    expect(armor?.textContent).toContain('Hide Armor');
    expect(armor?.textContent).not.toContain('Bastard Sword');
  });
});

describe('Inventory tab — party stash selector', () => {
  const MockEventSourceClass = vi.fn(function (this: Record<string, unknown>) {
    this.close = vi.fn();
    this.onmessage = null;
    this.onerror = null;
  });

  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSourceClass);
    vi.spyOn(api, 'getPartyStash').mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockEventSourceClass.mockClear();
  });

  it('shows Player and Party buttons in selector when partyId is provided', () => {
    const { container } = render(<Inventory items={items} partyId="party-1" />);
    const labels = Array.from(container.querySelectorAll('[role="group"] button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Player inventory');
    expect(labels).toContain('Party stash');
  });

  it('does not show Party button when no partyId', () => {
    const { container } = render(<Inventory items={items} />);
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Party stash');
  });

  it('does not show Shop button in selector when shop mode is off', () => {
    const { container } = render(<Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />);
    const labels = Array.from(container.querySelectorAll('[role="group"] button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Player inventory');
    expect(labels).not.toContain('Shop');
    expect(labels).toContain('Party stash');
  });

  it('renders PartyStash panel when Party button is clicked', async () => {
    const { container } = render(<Inventory items={items} partyId="party-1" />);
    const stashBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Party stash"]');
    expect(stashBtn, 'Party stash button').toBeTruthy();
    fireEvent.click(stashBtn!);
    await waitFor(() => {
      expect(api.getPartyStash).toHaveBeenCalledWith('party-1');
    });
    expect(container.textContent).toContain('stash is empty');
  });

  it('does not render the party stash section above the inventory controls', () => {
    render(<Inventory items={items} partyId="party-1" />);
    // PartyStash should not be mounted in inventory view (only when tab is active).
    // Verify the stash API was not called on initial render (inventory tab is default).
    expect(api.getPartyStash).not.toHaveBeenCalled();
  });

  it('shows selector with only "My Inventory" when no partyId and no shop mode', () => {
    const { container } = render(<Inventory items={items} />);
    // No selector group should be rendered at all (no shop mode, no party).
    const group = container.querySelector('[role="group"][aria-label="Shop view"]');
    expect(group).toBeNull();
  });
});

// ─── Coin edit dialog ─────────────────────────────────────────────────────────
// Amiri's gp item id (from fixture): ABg0ouzYy9py3sCh, qty=6
// Amiri's sp item id (from fixture): fo1yVhGWohLg3sFn, qty=5

describe('Inventory tab — coin edit dialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function openDialog(container: HTMLElement): void {
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="coin-edit-button"]')!);
  }

  function applyButton(container: HTMLElement): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="coin-edit-apply"]');
    if (!btn) throw new Error('Apply button not rendered');
    return btn;
  }

  it('does not show the Edit coins button when no actorId', () => {
    const { container } = render(<Inventory items={items} />);
    expect(container.querySelector('[data-testid="coin-edit-button"]')).toBeNull();
  });

  it('shows the Edit coins button when actorId is provided', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="coin-edit-button"]')).toBeTruthy();
  });

  it('opens a dialog with one delta input per denomination when Edit is clicked', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    expect(container.querySelector('[data-testid="coin-edit-dialog"]')).toBeTruthy();
    for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
      expect(container.querySelector(`input[aria-label="${denom} delta"]`), `${denom} delta input`).toBeTruthy();
    }
  });

  it('shows current per-denomination quantity in the dialog', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    // Amiri has 6 gp and 5 sp; the row text should reflect those numbers.
    const gpRow = container.querySelector('[data-coin-edit-row="gp"]');
    const spRow = container.querySelector('[data-coin-edit-row="sp"]');
    expect(gpRow?.textContent).toContain('6');
    expect(spRow?.textContent).toContain('5');
  });

  it('disables Apply when no deltas are entered', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    expect(applyButton(container).disabled).toBe(true);
  });

  it('calls api.updateActorItem to increase gp when +1 is entered and Apply is clicked', async () => {
    vi.spyOn(api, 'updateActorItem').mockResolvedValue({
      id: 'ABg0ouzYy9py3sCh',
      name: 'Gold Pieces',
      type: 'treasure',
      img: '',
      actorId: 'actor-1',
      actorName: 'Amiri',
    });
    const onActorChanged = vi.fn();
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={onActorChanged} />,
    );
    openDialog(container);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp delta"]')!, {
      target: { value: '1' },
    });
    fireEvent.click(applyButton(container));
    await waitFor(() => {
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 7 },
      });
    });
    expect(onActorChanged).toHaveBeenCalled();
  });

  it('calls api.updateActorItem to decrease gp when −1 is entered', async () => {
    vi.spyOn(api, 'updateActorItem').mockResolvedValue({
      id: 'ABg0ouzYy9py3sCh',
      name: 'Gold Pieces',
      type: 'treasure',
      img: '',
      actorId: 'actor-1',
      actorName: 'Amiri',
    });
    const onActorChanged = vi.fn();
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={onActorChanged} />,
    );
    openDialog(container);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp delta"]')!, {
      target: { value: '-1' },
    });
    fireEvent.click(applyButton(container));
    await waitFor(() => {
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 5 },
      });
    });
    expect(onActorChanged).toHaveBeenCalled();
  });

  it('applies multiple denominations in one Apply', async () => {
    vi.spyOn(api, 'updateActorItem').mockResolvedValue({
      id: 'unused',
      name: 'unused',
      type: 'treasure',
      img: '',
      actorId: 'actor-1',
      actorName: 'Amiri',
    });
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp delta"]')!, {
      target: { value: '2' },
    });
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="sp delta"]')!, {
      target: { value: '-3' },
    });
    fireEvent.click(applyButton(container));
    await waitFor(() => {
      // gp: 6 + 2 = 8
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 8 },
      });
      // sp: 5 - 3 = 2
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'fo1yVhGWohLg3sFn', {
        system: { quantity: 2 },
      });
    });
  });

  it('creates a coin item from the equipment pack when adding a denomination the player does not have', async () => {
    vi.spyOn(api, 'addItemFromCompendium').mockResolvedValue({
      id: 'new-pp',
      name: 'Platinum Pieces',
      type: 'treasure',
      img: '',
      actorId: 'actor-1',
      actorName: 'Amiri',
    });
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    // Amiri has no platinum item; entering +2 pp should add from compendium.
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="pp delta"]')!, {
      target: { value: '2' },
    });
    fireEvent.click(applyButton(container));
    await waitFor(() => {
      expect(api.addItemFromCompendium).toHaveBeenCalledWith('actor-1', {
        packId: 'pf2e.equipment-srd',
        itemId: 'platinum-pieces',
        quantity: 2,
      });
    });
  });

  it('shows an inline validation error and disables Apply when removing more than on hand', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    // Amiri has 6 gp; try to remove 10.
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp delta"]')!, {
      target: { value: '-10' },
    });
    const err = container.querySelector('[data-role="coin-edit-error"]');
    expect(err?.textContent).toMatch(/cannot remove 10 gp/i);
    expect(applyButton(container).disabled).toBe(true);
  });

  it('closes the dialog when Cancel is clicked', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    openDialog(container);
    expect(container.querySelector('[data-testid="coin-edit-dialog"]')).toBeTruthy();
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="coin-edit-cancel"]')!);
    expect(container.querySelector('[data-testid="coin-edit-dialog"]')).toBeNull();
  });
});

// ─── Party stash coin transfers ───────────────────────────────────────────────

const STASH_GP = {
  id: 'stash-gp-1',
  name: 'Gold Pieces',
  type: 'treasure' as const,
  img: '',
  system: { slug: 'gold-pieces', category: 'coin', quantity: 3 },
};

const STASH_PP = {
  id: 'stash-pp-1',
  name: 'Platinum Pieces',
  type: 'treasure' as const,
  img: '',
  system: { slug: 'platinum-pieces', category: 'coin', quantity: 5 },
};

describe('Inventory tab — party stash coin transfers', () => {
  const MockEventSourceClass = vi.fn(function (this: Record<string, unknown>) {
    this.close = vi.fn();
    this.onmessage = null;
    this.onerror = null;
  });

  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSourceClass);
    vi.spyOn(api, 'getPartyStash').mockResolvedValue({ items: [STASH_GP] });
    vi.spyOn(api, 'invokeActorAction').mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockEventSourceClass.mockClear();
  });

  async function openPartyStashTab(container: HTMLElement): Promise<void> {
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Party stash"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-section="party-coins"]')).toBeTruthy();
    });
  }

  it('shows the party coin section with stash balance when switching to party stash tab', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    const gpRow = container.querySelector('[data-coin-denom="gp"]');
    expect(gpRow?.textContent).toContain('3'); // 3 gp in stash
  });

  it('also shows player balance in coin row', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    const gpRow = container.querySelector('[data-coin-denom="gp"]');
    // Player (Amiri) has 6 gp — shown in the "you: N" readout
    expect(gpRow?.textContent).toContain('6');
  });

  it('calls transferItemToParty when Send gp is clicked', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Send gp to party stash"]')!);
    await waitFor(() => {
      // transferItemToParty('actor-1', playerGpItemId, 'party-1', 1)
      expect(api.invokeActorAction).toHaveBeenCalledWith('actor-1', 'transfer-to-party', {
        itemId: 'ABg0ouzYy9py3sCh',
        targetActorId: 'party-1',
        quantity: 1,
      });
    });
  });

  it('calls takeItemFromParty when Take gp is clicked', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Take gp from party stash"]')!);
    await waitFor(() => {
      // takeItemFromParty('party-1', stashGpItemId, 'actor-1', 1)
      expect(api.invokeActorAction).toHaveBeenCalledWith('party-1', 'transfer-to-party', {
        itemId: 'stash-gp-1',
        targetActorId: 'actor-1',
        quantity: 1,
      });
    });
  });

  it('uses the transfer amount input when sending', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp transfer amount"]')!, {
      target: { value: '3' },
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Send gp to party stash"]')!);
    await waitFor(() => {
      expect(api.invokeActorAction).toHaveBeenCalledWith('actor-1', 'transfer-to-party', {
        itemId: 'ABg0ouzYy9py3sCh',
        targetActorId: 'party-1',
        quantity: 3,
      });
    });
  });

  it('disables the Take button when stash has 0 of that denomination', async () => {
    // Stash has pp but player has none — pp row shows; Send is disabled (no player pp)
    // Stash has gp — row shows; both Send and Take enabled
    // Override with empty stash for this test
    vi.spyOn(api, 'getPartyStash').mockResolvedValue({ items: [] });
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Party stash"]')!);
    // gp row should appear because player has gp (even with empty stash)
    await waitFor(() => {
      expect(container.querySelector('[data-coin-denom="gp"]')).toBeTruthy();
    });
    const takeGpBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Take gp from party stash"]');
    expect(takeGpBtn?.disabled).toBe(true);
  });

  it('disables the Send button when player has none of that denomination', async () => {
    // Stash has pp; player (Amiri) has no pp
    vi.spyOn(api, 'getPartyStash').mockResolvedValue({ items: [STASH_PP] });
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Party stash"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-coin-denom="pp"]')).toBeTruthy();
    });
    const sendPpBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Send pp to party stash"]');
    expect(sendPpBtn?.disabled).toBe(true);
  });

  it('disables the Send button when the transfer amount exceeds player balance', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    // Amiri has 6 gp — set transfer amount to 100 (exceeds balance)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp transfer amount"]')!, {
      target: { value: '100' },
    });
    const sendGpBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Send gp to party stash"]');
    expect(sendGpBtn?.disabled).toBe(true);
  });

  it('disables the Take button when the transfer amount exceeds stash balance', async () => {
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    // Stash has 3 gp — set transfer amount to 10 (exceeds stash)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp transfer amount"]')!, {
      target: { value: '10' },
    });
    const takeGpBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Take gp from party stash"]');
    expect(takeGpBtn?.disabled).toBe(true);
  });

  it('shows coin-tx-error when a coin send fails', async () => {
    vi.spyOn(api, 'invokeActorAction').mockRejectedValue(new Error('Bridge error'));
    const { container } = render(
      <Inventory items={items} partyId="party-1" actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    await openPartyStashTab(container);
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Send gp to party stash"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-role="coin-tx-error"]')?.textContent).toContain('Bridge error');
    });
  });
});
