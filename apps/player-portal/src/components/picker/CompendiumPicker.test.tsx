import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { CompendiumPicker } from './CompendiumPicker';

type Item = { id: string; label: string };

const items: Item[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

const renderList = (xs: Item[]): React.ReactElement => (
  <ul>
    {xs.map((x) => (
      <li key={x.id} data-item-id={x.id}>
        {x.label}
      </li>
    ))}
  </ul>
);

afterEach(cleanup);

describe('CompendiumPicker — loading / error / empty states', () => {
  it('shows Searching… when isLoading=true and items is empty', () => {
    const { container } = render(
      <CompendiumPicker isLoading items={[]} renderList={renderList} />,
    );
    expect(container.textContent).toContain('Searching');
    expect(container.querySelector('[data-item-id]')).toBeFalsy();
  });

  it('does not show the loading message when items are present even if isLoading=true', () => {
    const { container } = render(
      <CompendiumPicker isLoading items={items} renderList={renderList} />,
    );
    expect(container.textContent).not.toContain('Searching');
    expect(container.querySelectorAll('[data-item-id]').length).toBe(3);
  });

  it('shows the error message when error is set', () => {
    const { container } = render(
      <CompendiumPicker error="boom" items={[]} renderList={renderList} />,
    );
    expect(container.textContent).toContain('Search failed');
    expect(container.textContent).toContain('boom');
  });

  it('shows the default empty message when not loading, no error, items empty', () => {
    const { container } = render(
      <CompendiumPicker items={[]} renderList={renderList} />,
    );
    expect(container.textContent).toMatch(/no matches/i);
  });

  it('shows a custom emptyMessage', () => {
    const { container } = render(
      <CompendiumPicker items={[]} emptyMessage="Nothing here." renderList={renderList} />,
    );
    expect(container.textContent).toContain('Nothing here.');
  });
});

describe('CompendiumPicker — list rendering', () => {
  it('calls renderList with items when items is non-empty', () => {
    const spy = vi.fn(renderList);
    const { container } = render(
      <CompendiumPicker items={items} renderList={spy} />,
    );
    expect(spy).toHaveBeenCalledWith(items);
    expect(container.querySelectorAll('[data-item-id]').length).toBe(3);
  });

  it('does not call renderList when items is empty', () => {
    const spy = vi.fn(renderList);
    render(<CompendiumPicker items={[]} renderList={spy} />);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('CompendiumPicker — load-more button', () => {
  it('shows the Load more button when hasMore=true', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        hasMore
        isLoadingMore={false}
        onLoadMore={vi.fn()}
        remainingCount={10}
        loadMoreTestId="load-more"
      />,
    );
    expect(container.querySelector('[data-testid="load-more"]')).toBeTruthy();
    expect(container.textContent).toContain('10 remaining');
  });

  it('shows "Load more" without count when remainingCount is not provided', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        hasMore
        loadMoreTestId="load-more"
      />,
    );
    const btn = container.querySelector('[data-testid="load-more"]') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Load more');
  });

  it('calls onLoadMore when button is clicked', () => {
    const onLoadMore = vi.fn();
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        hasMore
        onLoadMore={onLoadMore}
        loadMoreTestId="load-more"
      />,
    );
    fireEvent.click(container.querySelector('[data-testid="load-more"]') as HTMLElement);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows Loading… when isLoadingMore=true', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        isLoadingMore
        loadMoreTestId="load-more"
      />,
    );
    const btn = container.querySelector('[data-testid="load-more"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent?.trim()).toBe('Loading…');
  });

  it('does not show the button when hasMore=false and isLoadingMore=false', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        hasMore={false}
        isLoadingMore={false}
        loadMoreTestId="load-more"
      />,
    );
    expect(container.querySelector('[data-testid="load-more"]')).toBeFalsy();
  });
});

describe('CompendiumPicker — split-pane layout', () => {
  it('renders without a flex wrapper when splitPane is not provided', () => {
    const { container } = render(
      <CompendiumPicker items={items} renderList={renderList} />,
    );
    // No min-h-0 flex-1 outer wrapper
    expect(container.firstElementChild?.className).not.toContain('flex min-h-0');
  });

  it('renders a flex wrapper when splitPane is provided', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        splitPane={{ detailOpen: false, detailSlot: <div>detail</div> }}
      />,
    );
    expect(container.firstElementChild?.className).toContain('flex min-h-0 flex-1');
  });

  it('does not render detailSlot when splitPane.detailOpen=false', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        splitPane={{ detailOpen: false, detailSlot: <div data-testid="detail-slot">detail</div> }}
      />,
    );
    expect(container.querySelector('[data-testid="detail-slot"]')).toBeFalsy();
  });

  it('renders detailSlot when splitPane.detailOpen=true', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        splitPane={{ detailOpen: true, detailSlot: <div data-testid="detail-slot">detail</div> }}
      />,
    );
    expect(container.querySelector('[data-testid="detail-slot"]')).toBeTruthy();
  });

  it('applies resultsTestId to the list wrapper in split-pane mode', () => {
    const { container } = render(
      <CompendiumPicker
        items={items}
        renderList={renderList}
        resultsTestId="list-area"
        splitPane={{ detailOpen: false, detailSlot: null }}
      />,
    );
    expect(container.querySelector('[data-testid="list-area"]')).toBeTruthy();
  });
});
