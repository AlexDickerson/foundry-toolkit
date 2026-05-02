import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { FormulaPicker } from './FormulaPicker';

const sampleMatches: CompendiumMatch[] = [
  {
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: 'item-a',
    uuid: 'Compendium.pf2e.equipment-srd.Item.item-a',
    name: 'Alchemist Fire',
    type: 'consumable',
    img: 'icons/fire.webp',
    level: 1,
    traits: ['alchemical', 'bomb'],
  },
  {
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: 'item-b',
    uuid: 'Compendium.pf2e.equipment-srd.Item.item-b',
    name: 'Healing Potion',
    type: 'consumable',
    img: 'icons/potion.webp',
    level: 1,
    traits: ['consumable', 'healing'],
  },
];

describe('FormulaPicker', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({
      matches: sampleMatches,
      total: sampleMatches.length,
    });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  it('fires a search immediately on open (no query required)', async () => {
    render(<FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.q).toBe('');
    expect(call?.documentType).toBe('Item');
    expect(call?.packIds).toEqual(['pf2e.equipment-srd', 'pf2e.adventure-specific-items']);
  });

  it('renders items immediately on open', async () => {
    const { getByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Alchemist Fire')).toBeTruthy();
      expect(getByText('Healing Potion')).toBeTruthy();
    });
  });

  it('narrows results when user types', async () => {
    searchSpy.mockResolvedValue({ matches: [sampleMatches[0]!], total: 1 });
    const { getByPlaceholderText, getByText, queryByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/filter by name/i), { target: { value: 'fire' } });
    await waitFor(() => {
      expect(getByText('Alchemist Fire')).toBeTruthy();
    });
    expect(queryByText('Healing Potion')).toBeNull();
  });

  it('filters out alreadyKnown items from results', async () => {
    const knownUuid = 'Compendium.pf2e.equipment-srd.Item.item-a';
    const { queryByText, getByText } = render(
      <FormulaPicker alreadyKnown={new Set([knownUuid])} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Healing Potion')).toBeTruthy();
    });
    expect(queryByText('Alchemist Fire')).toBeNull();
  });

  it('shows "every match is already in the book" when all results filtered', async () => {
    const knownUuids = new Set(sampleMatches.map((m) => m.uuid));
    const { getByText } = render(
      <FormulaPicker alreadyKnown={knownUuids} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Every match is already in the book.')).toBeTruthy();
    });
  });

  it('calls onPick with the selected match', async () => {
    const onPick = vi.fn();
    const { getByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={onPick} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Alchemist Fire')).toBeTruthy();
    });
    fireEvent.click(getByText('Alchemist Fire'));
    expect(onPick).toHaveBeenCalledWith(sampleMatches[0]);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});
