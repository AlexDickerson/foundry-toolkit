import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { SpellPicker } from './SpellPicker';

const sampleSpells: CompendiumMatch[] = [
  {
    packId: 'pf2e.spells-srd',
    packLabel: 'Spells',
    documentId: 'spell-a',
    uuid: 'Compendium.pf2e.spells-srd.Item.spell-a',
    name: 'Fireball',
    type: 'spell',
    img: 'icons/fireball.webp',
    level: 3,
    traits: ['arcane', 'primal', 'fire', 'evocation'],
  },
  {
    packId: 'pf2e.spells-srd',
    packLabel: 'Spells',
    documentId: 'spell-b',
    uuid: 'Compendium.pf2e.spells-srd.Item.spell-b',
    name: 'Detect Magic',
    type: 'spell',
    img: 'icons/detect.webp',
    level: 1,
    traits: ['arcane', 'divination', 'cantrip'],
  },
];

describe('SpellPicker', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({
      matches: sampleSpells,
      total: sampleSpells.length,
    });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  it('passes tradition as traits filter to searchCompendium', async () => {
    render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.traits).toEqual(['arcane']);
    expect(call?.packIds).toEqual(['pf2e.spells-srd']);
    expect(call?.documentType).toBe('Item');
  });

  it('omits traits filter when tradition is null', async () => {
    render(
      <SpellPicker entryName="Special Spellcasting" tradition={null} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.traits).toBeUndefined();
  });

  it('renders spell items with rank and tradition tags', async () => {
    const { getByText } = render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Fireball')).toBeTruthy();
      expect(getByText('Detect Magic')).toBeTruthy();
    });
    expect(getByText('Rank 3')).toBeTruthy();
    expect(getByText('Rank 1')).toBeTruthy();
  });

  it('calls onPick with the selected spell', async () => {
    const onPick = vi.fn();
    const { getByText } = render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={onPick} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Fireball')).toBeTruthy();
    });
    fireEvent.click(getByText('Fireball'));
    expect(onPick).toHaveBeenCalledWith(sampleSpells[0]);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty message when no results', async () => {
    searchSpy.mockResolvedValue({ matches: [], total: 0 });
    const { getByText } = render(
      <SpellPicker entryName="Arcane Spellcasting" tradition="arcane" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('No spells found. Try a different search term.')).toBeTruthy();
    });
  });

  it('shows the tradition label in the header', () => {
    const { getByText } = render(
      <SpellPicker entryName="Divine Spellcasting" tradition="divine" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(getByText('divine')).toBeTruthy();
  });
});
