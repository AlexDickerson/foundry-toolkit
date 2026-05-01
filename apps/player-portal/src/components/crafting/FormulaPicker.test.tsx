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

  it('shows "type to search" prompt when query is empty', () => {
    const { getByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(getByText('Type to search the equipment compendium.')).toBeTruthy();
  });

  it('passes physical item packs and documentType to searchCompendium', async () => {
    const { getByPlaceholderText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/search equipment/i), { target: { value: 'fire' } });
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.documentType).toBe('Item');
    expect(call?.packIds).toEqual(['pf2e.equipment-srd', 'pf2e.adventure-specific-items']);
    expect(call?.q).toBe('fire');
  });

  it('renders matched items after search', async () => {
    const { getByPlaceholderText, getByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/search equipment/i), { target: { value: 'al' } });
    await waitFor(() => {
      expect(getByText('Alchemist Fire')).toBeTruthy();
      expect(getByText('Healing Potion')).toBeTruthy();
    });
  });

  it('filters out alreadyKnown items from results', async () => {
    const knownUuid = 'Compendium.pf2e.equipment-srd.Item.item-a';
    const { getByPlaceholderText, queryByText, getByText } = render(
      <FormulaPicker alreadyKnown={new Set([knownUuid])} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/search equipment/i), { target: { value: 'al' } });
    await waitFor(() => {
      expect(getByText('Healing Potion')).toBeTruthy();
    });
    expect(queryByText('Alchemist Fire')).toBeNull();
  });

  it('shows "every match is already in the book" when all results filtered', async () => {
    const knownUuids = new Set(sampleMatches.map((m) => m.uuid));
    const { getByPlaceholderText, getByText } = render(
      <FormulaPicker alreadyKnown={knownUuids} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/search equipment/i), { target: { value: 'al' } });
    await waitFor(() => {
      expect(getByText('Every match is already in the book.')).toBeTruthy();
    });
  });

  it('calls onPick with the selected match', async () => {
    const onPick = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <FormulaPicker alreadyKnown={new Set()} onPick={onPick} onClose={vi.fn()} />,
    );
    fireEvent.change(getByPlaceholderText(/search equipment/i), { target: { value: 'al' } });
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
