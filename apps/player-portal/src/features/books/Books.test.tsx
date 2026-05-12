/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Stub pdfjs-dist before the component imports it.
vi.mock('pdfjs-dist', () => ({
  default: {},
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/fake-worker.js' }));

// Stub the shared pdf-reader package — we only test the Books page wrapper.
vi.mock('@foundry-toolkit/pdf-reader', () => ({
  BookCatalog: ({ books, loading, emptyMessage }: { books: unknown[]; loading?: boolean; emptyMessage?: string }) => (
    <div data-testid="book-catalog">
      {loading && <span>Loading…</span>}
      {!loading && books.length === 0 && <span>{emptyMessage ?? 'No books'}</span>}
      {!loading &&
        (books as Array<{ title: string }>).map((b) => <div key={b.title}>{b.title}</div>)}
    </div>
  ),
  PdfReader: ({ title }: { title?: string }) => <div data-testid="pdf-reader">{title}</div>,
}));

// Stub the CSS import.
vi.mock('./books-theme.css', () => ({}));

vi.mock('./UploadBookModal', () => ({
  UploadBookModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="upload-book-backdrop">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const FAKE_INDEX = [
  { id: 'rulebooks/Core Rulebook', filename: 'rulebooks/Core Rulebook.pdf', title: 'Core Rulebook', sizeBytes: 1024, mtime: 0, category: 'rulebooks' },
  { id: 'adventures/Lost Mine', filename: 'adventures/Lost Mine.pdf', title: 'Lost Mine', sizeBytes: 512, mtime: 0, category: 'adventures' },
];

describe('Books page', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FAKE_INDEX,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /books/_index.json and renders a BookCatalog with the results', async () => {
    const { Books } = await import('./Books');
    render(React.createElement(Books));

    await waitFor(() => {
      expect(screen.getByTestId('book-catalog')).toBeTruthy();
      expect(screen.getByText('Core Rulebook')).toBeTruthy();
      expect(screen.getByText('Lost Mine')).toBeTruthy();
    });

    expect(global.fetch).toHaveBeenCalledWith('/books/_index.json');
  });

  it('shows error message when the index fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const { Books } = await import('./Books');
    render(React.createElement(Books));

    await waitFor(() => {
      expect(screen.getByText(/Could not load the book catalog/i)).toBeTruthy();
    });
  });

  it('shows Upload PDF button and opens modal on click', async () => {
    const { Books } = await import('./Books');
    const { unmount } = render(React.createElement(Books));

    // Wait for the Upload PDF button to appear (may be multiple across renders
    // due to module caching across tests; find a button element specifically).
    let uploadBtn: HTMLElement | null = null;
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: 'Upload PDF' });
      expect(btns.length).toBeGreaterThan(0);
      uploadBtn = btns[0] ?? null;
    });

    // Click the button to open modal
    uploadBtn!.click();

    await waitFor(() => {
      expect(screen.getByTestId('upload-book-backdrop')).toBeTruthy();
    });

    unmount();
  });
});
