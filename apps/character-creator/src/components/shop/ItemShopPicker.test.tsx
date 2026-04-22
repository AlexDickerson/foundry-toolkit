import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { api } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch } from '../../api/types';
import { ItemShopPicker } from './ItemShopPicker';

// Build a synthetic match stream large enough to trigger multiple
// pages at the ItemShopPicker's PAGE_SIZE (60).
function makeMatches(n: number): CompendiumMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    packId: 'pf2e.equipment-srd',
    packLabel: 'Equipment',
    documentId: `item-${i.toString().padStart(4, '0')}`,
    uuid: `Compendium.pf2e.equipment-srd.Item.item-${i.toString().padStart(4, '0')}`,
    name: `Item ${i.toString().padStart(4, '0')}`,
    type: 'equipment',
    img: '/icons/placeholder.svg',
    level: 0,
    // Embedded price — exercises the cache-hit path (no doc prefetch).
    price: { value: { gp: (i % 10) + 1 } },
  }));
}

describe('ItemShopPicker — pagination', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: makeMatches(150) });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  // The actual page size is derived at runtime via ResizeObserver
  // against the grid's measured height. jsdom doesn't back that with
  // real layout, so the component stays on its FALLBACK_PAGE_SIZE
  // (24) in tests. Tests below read the page indicator rather than
  // hard-coding the size, so they survive tweaks to either constant.
  const countTiles = (container: HTMLElement): number =>
    container.querySelectorAll('[data-item-uuid]').length;
  const readPageCount = (container: HTMLElement): number => {
    const text = container.querySelector('[data-role="page-indicator"]')?.textContent ?? '';
    const match = /\d+ \/ (\d+)/.exec(text);
    return match?.[1] ? Number(match[1]) : 1;
  };
  const readCurrentPage = (container: HTMLElement): number => {
    const text = container.querySelector('[data-role="page-indicator"]')?.textContent ?? '';
    const match = /(\d+) \/ \d+/.exec(text);
    return match?.[1] ? Number(match[1]) : 1;
  };

  it('caps the rendered tiles to one page', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-role="page-indicator"]')).toBeTruthy();
    });
    const pageSize = countTiles(container);
    expect(pageSize).toBeGreaterThan(0);
    expect(pageSize).toBeLessThan(150);
    // A 150-match fixture should always produce at least 2 pages.
    expect(readPageCount(container)).toBeGreaterThanOrEqual(2);
    // First page lands on item-0000.
    expect(container.querySelector('[data-item-uuid$=".item-0000"]')).toBeTruthy();
  });

  it('Next / Prev advance and rewind by exactly one page', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-role="page-indicator"]')).toBeTruthy();
    });
    const pageSize = countTiles(container);
    expect(readCurrentPage(container)).toBe(1);

    fireEvent.click(container.querySelector('[data-testid="pagination-next"]') as HTMLElement);
    await waitFor(() => {
      expect(readCurrentPage(container)).toBe(2);
    });
    // Page 2 starts at item index = pageSize.
    const page2First = `.item-${pageSize.toString().padStart(4, '0')}`;
    expect(container.querySelector(`[data-item-uuid$="${page2First}"]`)).toBeTruthy();
    expect(container.querySelector('[data-item-uuid$=".item-0000"]')).toBeFalsy();

    fireEvent.click(container.querySelector('[data-testid="pagination-prev"]') as HTMLElement);
    await waitFor(() => {
      expect(readCurrentPage(container)).toBe(1);
    });
    expect(container.querySelector('[data-item-uuid$=".item-0000"]')).toBeTruthy();
  });

  it('disables Prev on page 1 and Next on the last page', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="pagination-prev"]')).toBeTruthy();
    });
    expect((container.querySelector('[data-testid="pagination-prev"]') as HTMLButtonElement).disabled).toBe(true);
    const lastPage = readPageCount(container);
    // Walk Next until we reach the last page. Each click advances by
    // exactly one page (no stale-closure compounding because React
    // flushes between fireEvent invocations under RTL).
    for (let i = 1; i < lastPage; i++) {
      fireEvent.click(container.querySelector('[data-testid="pagination-next"]') as HTMLElement);
    }
    await waitFor(() => {
      expect(readCurrentPage(container)).toBe(lastPage);
    });
    expect(
      (container.querySelector('[data-testid="pagination-next"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    // Last page holds 150 % pageSize items (or pageSize if 150 divides evenly).
    const pageSize = 150 / lastPage; // conservative — only exact when 150 divides
    const expectedLastTiles = 150 % Math.floor(pageSize) === 0 ? Math.floor(pageSize) : 150 % Math.floor(pageSize);
    // `expectedLastTiles` is a loose guess; just assert the page is non-empty and ≤ pageSize.
    expect(countTiles(container)).toBeGreaterThan(0);
    expect(countTiles(container)).toBeLessThanOrEqual(Math.ceil(pageSize));
    void expectedLastTiles;
  });

  it('resets to page 0 when the search query changes', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="pagination-next"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="pagination-next"]') as HTMLElement);
    await waitFor(() => {
      expect(readCurrentPage(container)).toBe(2);
    });

    // Re-set the mock with a distinct id prefix so we can confirm the
    // NEW search result has landed (vs. just rewinding within the
    // old 150-item set, which also has an "item-0000"). Small enough
    // to fit on one page regardless of the dynamic page size.
    const filteredMatches: CompendiumMatch[] = Array.from({ length: 5 }, (_, i) => ({
      packId: 'pf2e.equipment-srd',
      packLabel: 'Equipment',
      documentId: `sword-${i.toString()}`,
      uuid: `Compendium.pf2e.equipment-srd.Item.sword-${i.toString()}`,
      name: `Sword ${i.toString()}`,
      type: 'weapon',
      img: '',
      level: 0,
      price: { value: { gp: 4 } },
    }));
    searchSpy.mockResolvedValue({ matches: filteredMatches });
    const input = container.querySelector('[data-testid="shop-search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sword' } });
    await waitFor(() => {
      expect(container.querySelector('[data-item-uuid$=".sword-0"]')).toBeTruthy();
    });
    // Few-enough matches → single page, pagination controls collapse.
    expect(container.querySelector('[data-testid="pagination-next"]')).toBeFalsy();
  });

  it('omits pagination controls when there is only one page', async () => {
    searchSpy.mockResolvedValue({ matches: makeMatches(12) });
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-item-uuid]').length).toBe(12);
    });
    expect(container.querySelector('[data-testid="pagination-prev"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="pagination-next"]')).toBeFalsy();
  });
});

describe('ItemShopPicker — price filter', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const mixed: CompendiumMatch[] = [
      {
        packId: 'pf2e.equipment-srd',
        packLabel: 'Equipment',
        documentId: 'free',
        uuid: 'Compendium.pf2e.equipment-srd.Item.free',
        name: 'Free Thing',
        type: 'equipment',
        img: '',
        level: 0,
        price: { value: {} }, // 0 cp — should be filtered
      },
      {
        packId: 'pf2e.equipment-srd',
        packLabel: 'Equipment',
        documentId: 'paid',
        uuid: 'Compendium.pf2e.equipment-srd.Item.paid',
        name: 'Paid Thing',
        type: 'equipment',
        img: '',
        level: 0,
        price: { value: { gp: 2 } }, // non-zero — should be visible
      },
      {
        packId: 'pf2e.equipment-srd',
        packLabel: 'Equipment',
        documentId: 'unknown',
        uuid: 'Compendium.pf2e.equipment-srd.Item.unknown',
        name: 'Unknown Price Thing',
        type: 'equipment',
        img: '',
        level: 0,
        // price omitted entirely — should remain visible (uncached pack case)
      },
    ];
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: mixed });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    cleanup();
  });

  it('hides items whose embedded price is 0 cp', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-item-uuid]').length).toBe(2);
    });
    expect(container.querySelector('[data-item-uuid$=".free"]')).toBeFalsy();
    expect(container.querySelector('[data-item-uuid$=".paid"]')).toBeTruthy();
    expect(container.querySelector('[data-item-uuid$=".unknown"]')).toBeTruthy();
  });
});

describe('ItemShopPicker — detail overlay', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;
  let docSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const match: CompendiumMatch = {
      packId: 'pf2e.equipment-srd',
      packLabel: 'Equipment',
      documentId: 'bastard-sword',
      uuid: 'Compendium.pf2e.equipment-srd.Item.bastard-sword',
      name: 'Bastard Sword',
      type: 'weapon',
      img: '',
      level: 0,
      traits: ['two-hand-d12'],
      price: { value: { gp: 4 } },
    };
    const doc: CompendiumDocument = {
      id: 'bastard-sword',
      uuid: match.uuid,
      name: match.name,
      type: match.type,
      img: match.img,
      system: {
        description: { value: '<p>A broad-bladed sword with a long grip.</p>' },
        traits: { value: ['two-hand-d12'] },
        price: { value: { gp: 4 } },
      },
    };
    searchSpy = vi.spyOn(api, 'searchCompendium').mockResolvedValue({ matches: [match] });
    docSpy = vi.spyOn(api, 'getCompendiumDocument').mockResolvedValue({ document: doc });
  });

  afterEach(() => {
    searchSpy.mockRestore();
    docSpy.mockRestore();
    cleanup();
  });

  it('opens the detail overlay when a tile is clicked', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-tile"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeFalsy();

    fireEvent.click(container.querySelector('[data-testid="shop-tile"]') as HTMLElement);
    const detail = container.querySelector('[data-testid="shop-item-detail"]');
    expect(detail).toBeTruthy();
    await waitFor(() => {
      expect(detail?.textContent).toContain('broad-bladed sword');
    });
  });

  it('closes the detail overlay via the × button', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-tile"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="shop-tile"]') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-detail-close"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="shop-detail-close"]') as HTMLElement);
    expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeFalsy();
  });

  it('closes the detail overlay on Escape', async () => {
    const { container } = render(<ItemShopPicker items={[]} onBuy={vi.fn()} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-tile"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="shop-tile"]') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeTruthy();
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeFalsy();
  });

  it('clicking the tile Buy button does NOT open the detail overlay', async () => {
    const wealthyItems = [
      {
        id: 'gp',
        name: 'Gold Pieces',
        type: 'treasure',
        img: '',
        system: {
          slug: 'gold-pieces',
          level: { value: 0 },
          quantity: 100,
          bulk: { value: 0 },
          equipped: { carryType: 'worn' as const },
          containerId: null,
          traits: { value: [], rarity: 'common' },
          category: 'coin',
          price: { value: { gp: 1 } },
        },
      },
    ] as unknown as Parameters<typeof ItemShopPicker>[0]['items'];
    const onBuy = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ItemShopPicker items={wealthyItems} onBuy={onBuy} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-buy"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="shop-buy"]') as HTMLElement);
    expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeFalsy();
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it('Buy from the detail overlay calls onBuy and dismisses the overlay', async () => {
    const onBuy = vi.fn().mockResolvedValue(undefined);
    // Give the actor a pile of coins so the Buy button in the detail
    // isn't disabled (the sword costs 4 gp).
    const wealthyItems = [
      {
        id: 'gp',
        name: 'Gold Pieces',
        type: 'treasure',
        img: '',
        system: {
          slug: 'gold-pieces',
          level: { value: 0 },
          quantity: 100,
          bulk: { value: 0 },
          equipped: { carryType: 'worn' as const },
          containerId: null,
          traits: { value: [], rarity: 'common' },
          category: 'coin',
          price: { value: { gp: 1 } },
        },
      },
    ] as unknown as Parameters<typeof ItemShopPicker>[0]['items'];
    const { container } = render(<ItemShopPicker items={wealthyItems} onBuy={onBuy} pending={new Set()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-tile"]')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('[data-testid="shop-tile"]') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-detail-buy"]')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="shop-detail-buy"]') as HTMLElement);
    });
    expect(onBuy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="shop-item-detail"]')).toBeFalsy();
    });
  });
});
