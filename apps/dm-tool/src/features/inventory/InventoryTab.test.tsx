/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyInventoryItem } from '@foundry-toolkit/shared/types';

vi.mock('@/lib/api', () => ({
  api: {
    inventoryList: vi.fn(),
    inventoryDelete: vi.fn(),
  },
}));

// Import after mock so the module picks up the vi.fn() stubs.
const { api } = await import('@/lib/api');
const { InventoryTab } = await import('./InventoryTab');

function makeItem(id: string, name: string): PartyInventoryItem {
  return {
    id,
    name,
    qty: 1,
    category: 'other',
    bulk: undefined,
    valueCp: undefined,
    aonUrl: undefined,
    note: undefined,
    carriedBy: undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const ITEM_A = makeItem('item-1', 'Healing Potion');
const ITEM_B = makeItem('item-2', 'Silk Rope');

describe('InventoryTab — remove item', () => {
  beforeEach(() => {
    vi.mocked(api.inventoryList).mockResolvedValue([ITEM_A, ITEM_B]);
    vi.mocked(api.inventoryDelete).mockResolvedValue(undefined);
  });

  it('removes the item from the visible list without remounting after the delete button is clicked', async () => {
    render(<InventoryTab />);

    // Wait for the initial load to populate the table.
    await screen.findByText('Healing Potion');
    expect(screen.getByText('Silk Rope')).toBeTruthy();

    // Click the delete button for the first item.
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete item' });
    fireEvent.click(deleteButtons[0]);

    // The removed item must disappear from the DOM without the component remounting
    // (i.e., without a second inventoryList call — pure local-state update).
    await waitFor(() => {
      expect(screen.queryByText('Healing Potion')).toBeNull();
    });

    // The other item must remain.
    expect(screen.getByText('Silk Rope')).toBeTruthy();

    // inventoryList must have been called exactly once (initial load only —
    // the remove path must NOT trigger a full refetch round-trip).
    expect(vi.mocked(api.inventoryList)).toHaveBeenCalledTimes(1);
  });

  it('calls inventoryDelete with the correct item id', async () => {
    render(<InventoryTab />);

    await screen.findByText('Healing Potion');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' })[0]);

    await waitFor(() => {
      expect(vi.mocked(api.inventoryDelete)).toHaveBeenCalledWith('item-1');
    });
  });
});
