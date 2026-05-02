import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { CompendiumPicker } from './CompendiumPicker';

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
    traits: [],
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
    traits: [],
  },
];

describe('CompendiumPicker', () => {
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

  // ── Dialog shell ──────────────────────────────────────────────────────

  it('renders the title', () => {
    const { getByText } = render(
      <CompendiumPicker title="Add Formula" packIds={[]} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(getByText('Add Formula')).toBeTruthy();
  });

  it('calls onClose when × is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <CompendiumPicker title="t" packIds={[]} onPick={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText('Close picker'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<CompendiumPicker title="t" packIds={[]} onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked but not when dialog is clicked', async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        onPick={vi.fn()}
        onClose={onClose}
        testId="my-picker"
        resultsTestId="my-picker-results"
      />,
    );
    await waitFor(() => expect(getByTestId('my-picker-results')).toBeTruthy());
    fireEvent.click(getByTestId('my-picker-results'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(getByTestId('my-picker'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders filterControls below the search input', () => {
    const { getByTestId } = render(
      <CompendiumPicker
        title="t"
        packIds={[]}
        filterControls={<div data-testid="filter-row">filters here</div>}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getByTestId('filter-row')).toBeTruthy();
  });

  // ── Search config ─────────────────────────────────────────────────────

  it('fires searchCompendium on open with packIds and documentType', async () => {
    render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        documentType="Item"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.packIds).toEqual(['pf2e.equipment-srd']);
    expect(call?.documentType).toBe('Item');
    expect(call?.q).toBe('');
  });

  it('passes traits to searchCompendium', async () => {
    render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.spells-srd']}
        traits={['arcane']}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    expect(searchSpy.mock.calls[0]?.[0]?.traits).toEqual(['arcane']);
  });

  it('re-searches when sources prop changes', async () => {
    const { rerender } = render(
      <CompendiumPicker title="t" packIds={['p']} sources={[]} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    rerender(
      <CompendiumPicker title="t" packIds={['p']} sources={['Core Rulebook']} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    expect(searchSpy.mock.calls[1]?.[0]?.sources).toEqual(['Core Rulebook']);
  });

  it('notifies onQueryChange with the debounced query', async () => {
    const onQueryChange = vi.fn();
    const { getByRole } = render(
      <CompendiumPicker
        title="t"
        packIds={[]}
        onQueryChange={onQueryChange}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(getByRole('searchbox'), { target: { value: 'fire' } });
    await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith('fire'));
  });

  // ── Item rendering ────────────────────────────────────────────────────

  it('shows items with the default row (img + name + Lv badge)', async () => {
    const { getByText, getAllByText } = render(
      <CompendiumPicker title="t" packIds={['pf2e.equipment-srd']} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(getByText('Alchemist Fire')).toBeTruthy();
      expect(getByText('Healing Potion')).toBeTruthy();
      // Both items are level 1 so there are two Lv badges.
      expect(getAllByText('Lv 1').length).toBe(2);
    });
  });

  it('opens a detail panel on row click and calls onPick on Pick button', async () => {
    const onPick = vi.fn();
    const docPromise = new Promise<{ document: { name: string; system: object } }>(() => {
      // Detail panel fetches the full document; never resolve so the
      // panel stays in its loading state — Pick button is still clickable.
    });
    vi.spyOn(api, 'getCompendiumDocument').mockReturnValue(docPromise as never);
    const { getByText, getByTestId } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        onPick={onPick}
        onClose={vi.fn()}
        testId="t-picker"
      />,
    );
    await waitFor(() => expect(getByText('Alchemist Fire')).toBeTruthy());
    // Click the row — should NOT immediately pick.
    fireEvent.click(getByText('Alchemist Fire'));
    expect(onPick).not.toHaveBeenCalled();
    // Detail panel is now visible.
    expect(getByTestId('t-picker-detail')).toBeTruthy();
    // Pick button confirms.
    fireEvent.click(getByTestId('t-picker-pick'));
    expect(onPick).toHaveBeenCalledWith(sampleMatches[0]);
  });

  it('shows the emptyMessage when no results', async () => {
    searchSpy.mockResolvedValue({ matches: [], total: 0 });
    const { getByText } = render(
      <CompendiumPicker
        title="t"
        packIds={[]}
        emptyMessage="No spells found."
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(getByText('No spells found.')).toBeTruthy());
  });

  it('shows "Search failed" when the search throws', async () => {
    searchSpy.mockRejectedValue(new Error('network error'));
    render(<CompendiumPicker title="t" packIds={['p']} onPick={vi.fn()} onClose={vi.fn()} />);
    // Portal renders into document.body; use document.body for assertions.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/search failed/i);
    });
  });

  // ── Client-side filter + sort ─────────────────────────────────────────

  it('filterItem hides excluded items', async () => {
    const { queryByText, getByText } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        filterItem={(m) => m.name !== 'Alchemist Fire'}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(getByText('Healing Potion')).toBeTruthy());
    expect(queryByText('Alchemist Fire')).toBeNull();
  });

  it('allFilteredMessage shown when filterItem removes all server results', async () => {
    const allUuids = new Set(sampleMatches.map((m) => m.uuid));
    const { getByText } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        filterItem={(m) => !allUuids.has(m.uuid)}
        allFilteredMessage="Every match is already in the book."
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(getByText('Every match is already in the book.')).toBeTruthy());
  });

  it('sortItems orders the visible list', async () => {
    const { getAllByRole } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        sortItems={(items) => [...items].sort((a, b) => b.name.localeCompare(a.name))}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      const buttons = getAllByRole('button').filter((b) => b.hasAttribute('data-pick-uuid'));
      expect(buttons[0]?.textContent).toContain('Healing Potion');
      expect(buttons[1]?.textContent).toContain('Alchemist Fire');
    });
  });

  it('uses a custom renderList when provided', async () => {
    const { getByTestId } = render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        renderList={(items) => (
          <ul data-testid="custom-list">
            {items.map((m) => <li key={m.uuid}>{m.name}</li>)}
          </ul>
        )}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(getByTestId('custom-list')).toBeTruthy());
  });

  // ── Pagination ────────────────────────────────────────────────────────

  it('shows "Load more" when total exceeds loaded count', async () => {
    searchSpy.mockResolvedValue({ matches: sampleMatches, total: 10 });
    render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        onPick={vi.fn()}
        onClose={vi.fn()}
        loadMoreTestId="load-more"
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-testid="load-more"]')).toBeTruthy();
    });
  });

  it('does not show "Load more" when all results are loaded', async () => {
    render(
      <CompendiumPicker
        title="t"
        packIds={['pf2e.equipment-srd']}
        onPick={vi.fn()}
        onClose={vi.fn()}
        loadMoreTestId="load-more"
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-testid="load-more"]')).toBeFalsy();
    });
  });
});
