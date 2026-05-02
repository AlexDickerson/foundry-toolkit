import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { api } from '../../api/client';
import type { CompendiumMatch, CompendiumSearchOptions } from '../../api/types';
import { CompendiumPicker } from '../picker';
import { useCreatorPickerProps } from './useCreatorPickerProps';

// Test wrapper that exercises the same surface CharacterCreator uses:
// useCreatorPickerProps + CompendiumPicker with no characterContext.
function FeatPicker({
  title,
  filters,
  onPick,
  onClose,
}: {
  title: string;
  filters: Pick<
    CompendiumSearchOptions,
    'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'maxLevel' | 'ancestrySlug'
  >;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}): React.ReactElement {
  const props = useCreatorPickerProps(filters, undefined, onPick);
  return (
    <CompendiumPicker
      title={title}
      {...props}
      onClose={onClose}
      testId="feat-picker"
      resultsTestId="feat-picker-results"
      loadMoreTestId="feat-picker-load-more"
    />
  );
}

const sampleMatches: CompendiumMatch[] = [
  {
    packId: 'pf2e.feats-srd',
    packLabel: 'Class Feats',
    documentId: 'a',
    uuid: 'Compendium.pf2e.feats-srd.Item.a',
    name: 'Sudden Charge',
    type: 'feat',
    img: 'icons/sudden.webp',
    level: 1,
    traits: ['barbarian', 'fighter'],
  },
  {
    packId: 'pf2e.feats-srd',
    packLabel: 'Class Feats',
    documentId: 'b',
    uuid: 'Compendium.pf2e.feats-srd.Item.b',
    name: 'Raging Intimidation',
    type: 'feat',
    img: 'icons/raging.webp',
    level: 1,
    traits: ['barbarian'],
  },
];

describe('FeatPicker', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: sampleMatches, total: sampleMatches.length });
  });
  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  it('renders the title, filter summary, and match list', async () => {
    const { getByText } = render(
      <FeatPicker
        title="Pick a Class Feat (Level 1)"
        filters={{ packIds: ['pf2e.feats-srd'], documentType: 'Item', traits: ['barbarian'], maxLevel: 1 }}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(getByText('Pick a Class Feat (Level 1)')).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    expect(getByText('Sudden Charge')).toBeTruthy();
    expect(getByText('Raging Intimidation')).toBeTruthy();
    expect(document.body.textContent).toContain('traits: barbarian');
    expect(document.body.textContent).toContain('level ≤ 1');
  });

  it('calls searchCompendium with the configured filters', async () => {
    render(
      <FeatPicker
        title="t"
        filters={{ packIds: ['pf2e.feats-srd'], documentType: 'Item', traits: ['barbarian'], maxLevel: 1 }}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalled();
    });
    const call = searchSpy.mock.calls[0]?.[0];
    expect(call?.packIds).toEqual(['pf2e.feats-srd']);
    expect(call?.documentType).toBe('Item');
    expect(call?.traits).toEqual(['barbarian']);
    expect(call?.maxLevel).toBe(1);
    // Browse mode: q starts empty.
    expect(call?.q).toBe('');
  });

  it('calls onPick with the selected match via the detail panel Pick button', async () => {
    const onPick = vi.fn();
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={onPick} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    // Two-pane flow: clicking a row opens the detail panel; picking
    // happens via the Pick button in the panel footer.
    const row = document.querySelector('[data-match-uuid="Compendium.pf2e.feats-srd.Item.a"]') as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker-detail"]')).toBeTruthy();
    });
    fireEvent.click(getByTestId('feat-picker-pick'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0].name).toBe('Sudden Charge');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked but not when the card is clicked', async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={onClose} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    // Click the card — should NOT close.
    fireEvent.click(getByTestId('feat-picker-results'));
    expect(onClose).not.toHaveBeenCalled();
    // Click the backdrop (the outer dialog).
    fireEvent.click(getByTestId('feat-picker'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty-state message when no matches come back', async () => {
    searchSpy.mockResolvedValueOnce({ matches: [], total: 0 });
    render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/no matches/i);
    });
  });

  it('shows an error banner when the search throws', async () => {
    searchSpy.mockRejectedValueOnce(new Error('boom'));
    render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/search failed/i);
    });
  });

  // --- Sort toggle --------------------------------------------------------

  it('renders an A-Z / Level sort toggle with A-Z selected by default', async () => {
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const toggle = getByTestId('feat-picker-sort');
    const alpha = toggle.querySelector('[data-sort-option="alpha"]');
    const level = toggle.querySelector('[data-sort-option="level"]');
    expect(alpha?.getAttribute('aria-checked')).toBe('true');
    expect(level?.getAttribute('aria-checked')).toBe('false');
  });

  it('sorts matches A-Z by default regardless of server order', async () => {
    // Server returns Sudden Charge first; A-Z should surface Raging Intimidation first.
    render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const names = Array.from(document.querySelectorAll('[data-match-uuid]')).map(
      (el) => el.querySelector('span')?.textContent,
    );
    expect(names).toEqual(['Raging Intimidation', 'Sudden Charge']);
  });

  it('switches to Level sort and orders ascending by level', async () => {
    searchSpy.mockResolvedValueOnce({
      matches: [
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'b',
          uuid: 'B',
          name: 'B-Feat',
          type: 'feat',
          img: '',
          level: 1,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'a',
          uuid: 'A',
          name: 'A-Feat',
          type: 'feat',
          img: '',
          level: 5,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'c',
          uuid: 'C',
          name: 'C-Feat',
          type: 'feat',
          img: '',
          level: 3,
          traits: [],
        },
      ],
      total: 3,
    });
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['x'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const levelBtn = getByTestId('feat-picker-sort').querySelector('[data-sort-option="level"]') as HTMLElement;
    fireEvent.click(levelBtn);

    const order = Array.from(document.querySelectorAll('[data-match-uuid]')).map((el) =>
      el.getAttribute('data-match-uuid'),
    );
    // Ascending by level: 1, 3, 5 → B, C, A
    expect(order).toEqual(['B', 'C', 'A']);
    // aria-checked flipped.
    expect(levelBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('reverses direction when the active sort option is clicked again', async () => {
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const toggle = getByTestId('feat-picker-sort');
    const alpha = toggle.querySelector('[data-sort-option="alpha"]') as HTMLElement;

    // First load: asc, so names A-Z.
    expect(alpha.getAttribute('data-sort-dir')).toBe('asc');
    const ascOrder = Array.from(document.querySelectorAll('[data-match-uuid]')).map(
      (el) => el.querySelector('span')?.textContent,
    );
    expect(ascOrder).toEqual(['Raging Intimidation', 'Sudden Charge']);

    // Click A-Z while already active → flips to desc.
    fireEvent.click(alpha);
    expect(alpha.getAttribute('data-sort-dir')).toBe('desc');
    expect(alpha.textContent).toMatch(/↓/);
    const descOrder = Array.from(document.querySelectorAll('[data-match-uuid]')).map(
      (el) => el.querySelector('span')?.textContent,
    );
    expect(descOrder).toEqual(['Sudden Charge', 'Raging Intimidation']);
  });

  it('reverses Level sort on re-click and orders high-to-low', async () => {
    searchSpy.mockResolvedValueOnce({
      matches: [
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'a',
          uuid: 'L1',
          name: 'Low',
          type: 'feat',
          img: '',
          level: 1,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'b',
          uuid: 'L5',
          name: 'Mid',
          type: 'feat',
          img: '',
          level: 5,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'c',
          uuid: 'L10',
          name: 'High',
          type: 'feat',
          img: '',
          level: 10,
          traits: [],
        },
      ],
      total: 3,
    });
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['x'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const level = getByTestId('feat-picker-sort').querySelector('[data-sort-option="level"]') as HTMLElement;

    // Click once → Level asc (1, 5, 10).
    fireEvent.click(level);
    expect(level.getAttribute('data-sort-dir')).toBe('asc');
    const asc = Array.from(document.querySelectorAll('[data-match-uuid]')).map((el) =>
      el.getAttribute('data-match-uuid'),
    );
    expect(asc).toEqual(['L1', 'L5', 'L10']);

    // Click again → Level desc (10, 5, 1).
    fireEvent.click(level);
    expect(level.getAttribute('data-sort-dir')).toBe('desc');
    const desc = Array.from(document.querySelectorAll('[data-match-uuid]')).map((el) =>
      el.getAttribute('data-match-uuid'),
    );
    expect(desc).toEqual(['L10', 'L5', 'L1']);
  });

  it('unlevelled entries stay at the bottom in Level desc too', async () => {
    searchSpy.mockResolvedValueOnce({
      matches: [
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'u',
          uuid: 'U',
          name: 'Unknown',
          type: 'feat',
          img: '',
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'a',
          uuid: 'A',
          name: 'Ancient',
          type: 'feat',
          img: '',
          level: 10,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'b',
          uuid: 'B',
          name: 'Basic',
          type: 'feat',
          img: '',
          level: 1,
          traits: [],
        },
      ],
      total: 3,
    });
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['x'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const level = getByTestId('feat-picker-sort').querySelector('[data-sort-option="level"]') as HTMLElement;
    fireEvent.click(level); // asc
    fireEvent.click(level); // desc
    const order = Array.from(document.querySelectorAll('[data-match-uuid]')).map((el) =>
      el.getAttribute('data-match-uuid'),
    );
    // L10 first (Ancient), L1 next (Basic), Unknown (no level) at the bottom.
    expect(order).toEqual(['A', 'B', 'U']);
  });

  it('resets direction to asc when switching between modes', async () => {
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    const toggle = getByTestId('feat-picker-sort');
    const alpha = toggle.querySelector('[data-sort-option="alpha"]') as HTMLElement;
    const level = toggle.querySelector('[data-sort-option="level"]') as HTMLElement;

    // Flip alpha to desc.
    fireEvent.click(alpha);
    expect(alpha.getAttribute('data-sort-dir')).toBe('desc');

    // Switch to Level → should start on asc, not inherit desc.
    fireEvent.click(level);
    expect(level.getAttribute('data-sort-dir')).toBe('asc');
    expect(alpha.getAttribute('data-sort-dir')).toBeNull();
  });

  it('sinks matches missing a level to the bottom of a Level sort, keeping alpha within each tier', async () => {
    searchSpy.mockResolvedValueOnce({
      matches: [
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'u',
          uuid: 'U-noLvl',
          name: 'Unspecified Feat',
          type: 'feat',
          img: '',
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'a',
          uuid: 'Alvl1',
          name: 'Alpha',
          type: 'feat',
          img: '',
          level: 1,
          traits: [],
        },
        {
          packId: 'p',
          packLabel: 'l',
          documentId: 'b',
          uuid: 'Blvl1',
          name: 'Beta',
          type: 'feat',
          img: '',
          level: 1,
          traits: [],
        },
      ],
      total: 3,
    });
    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['x'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    fireEvent.click(getByTestId('feat-picker-sort').querySelector('[data-sort-option="level"]') as HTMLElement);
    const order = Array.from(document.querySelectorAll('[data-match-uuid]')).map((el) =>
      el.getAttribute('data-match-uuid'),
    );
    // L1 alpha first (Alpha before Beta), then the unlevelled entry at the bottom.
    expect(order).toEqual(['Alvl1', 'Blvl1', 'U-noLvl']);
  });

  // --- Pagination (load more) ---------------------------------------------

  it('shows a "Load more" button when the server total exceeds the page', async () => {
    // Return 2 matches but declare total=10 → "Load more" should appear.
    searchSpy.mockResolvedValue({ matches: sampleMatches, total: 10 });
    render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="feat-picker-load-more"]')).toBeTruthy();
  });

  it('does not show "Load more" when total equals the loaded count', async () => {
    // Default mock has total === matches.length (2) → no more button.
    render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-match-uuid]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="feat-picker-load-more"]')).toBeFalsy();
  });

  it('fetches the next page and appends results when "Load more" is clicked', async () => {
    const page2Matches = [
      {
        packId: 'pf2e.feats-srd',
        packLabel: 'Class Feats',
        documentId: 'c',
        uuid: 'Compendium.pf2e.feats-srd.Item.c',
        name: 'Power Attack',
        type: 'feat',
        img: '',
        level: 2,
        traits: ['barbarian'],
      },
    ];
    // Page 0: total=3, but only 2 returned → hasMore=true
    searchSpy.mockResolvedValueOnce({ matches: sampleMatches, total: 3 });
    // Page 1: remaining 1 item
    searchSpy.mockResolvedValueOnce({ matches: page2Matches, total: 3 });

    const { getByTestId } = render(
      <FeatPicker title="t" filters={{ traits: ['barbarian'] }} onPick={vi.fn()} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="feat-picker-load-more"]')).toBeTruthy();
    });

    fireEvent.click(getByTestId('feat-picker-load-more'));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Power Attack');
    });

    // All 3 rows visible (2 original + 1 new).
    expect(document.querySelectorAll('[data-match-uuid]').length).toBe(3);
    // Second call should have offset=2.
    const secondCall = searchSpy.mock.calls[1]?.[0];
    expect(secondCall?.offset).toBe(sampleMatches.length);
  });
});

