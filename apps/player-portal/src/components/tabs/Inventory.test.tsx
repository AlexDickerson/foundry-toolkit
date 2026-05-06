import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { PreparedActorItem } from '../../api/types';
import { api } from '../../api/client';
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

// ─── Coin edit controls ───────────────────────────────────────────────────────
// Amiri's gp item id (from fixture): ABg0ouzYy9py3sCh, qty=6
// Amiri's sp item id (from fixture): fo1yVhGWohLg3sFn, qty=5

describe('Inventory tab — coin edit controls', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not show add/remove buttons when no actorId', () => {
    const { container } = render(<Inventory items={items} />);
    expect(container.querySelector('button[aria-label="Add gp"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Remove gp"]')).toBeNull();
  });

  it('shows add/remove buttons for each denomination when actorId is provided', () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    for (const denom of ['pp', 'gp', 'sp', 'cp'] as const) {
      expect(container.querySelector(`button[aria-label="Add ${denom}"]`), `Add ${denom}`).toBeTruthy();
      expect(container.querySelector(`button[aria-label="Remove ${denom}"]`), `Remove ${denom}`).toBeTruthy();
    }
  });

  it('calls api.updateActorItem to increase gp quantity when + is clicked', async () => {
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
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Add gp"]')!);
    await waitFor(() => {
      // grantCoins adds 1 gp (100 cp) to the existing 6 gp stack → qty 7
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 7 },
      });
    });
    expect(onActorChanged).toHaveBeenCalled();
  });

  it('calls api.updateActorItem to decrease gp quantity when − is clicked', async () => {
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
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Remove gp"]')!);
    await waitFor(() => {
      // spendCoins removes 1 gp (100 cp) from the 6 gp stack → qty 5
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 5 },
      });
    });
    expect(onActorChanged).toHaveBeenCalled();
  });

  it('uses the amount input value when adjusting coins', async () => {
    vi.spyOn(api, 'updateActorItem').mockResolvedValue({
      id: 'ABg0ouzYy9py3sCh',
      name: 'Gold Pieces',
      type: 'treasure',
      img: '',
      actorId: 'actor-1',
      actorName: 'Amiri',
    });
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    // Set gp amount to 3
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp amount"]')!, {
      target: { value: '3' },
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Add gp"]')!);
    await waitFor(() => {
      // 6 + 3 = 9
      expect(api.updateActorItem).toHaveBeenCalledWith('actor-1', 'ABg0ouzYy9py3sCh', {
        system: { quantity: 9 },
      });
    });
  });

  it('shows a tx-error when trying to remove more gp than the player has', async () => {
    const { container } = render(
      <Inventory items={items} actorId="actor-1" onActorChanged={vi.fn()} />,
    );
    // Amiri has 6 gp + 5 sp = 650 cp total. Attempt to remove 100 gp (10 000 cp) which exceeds her balance.
    fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="gp amount"]')!, {
      target: { value: '100' },
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Remove gp"]')!);
    await waitFor(() => {
      const err = container.querySelector('[data-role="tx-error"]');
      expect(err?.textContent).toMatch(/not enough coin/i);
    });
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
