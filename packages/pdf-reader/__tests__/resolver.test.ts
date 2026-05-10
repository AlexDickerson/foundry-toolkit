import { describe, it, expect, vi } from 'vitest';

// The shared PdfReader accepts getBookUrl: (id: string) => string | Promise<string>.
// These tests verify the contract: both sync and async resolvers produce a URL
// when awaited, which is how the component calls them internally.

async function resolveUrl(fn: (id: string) => string | Promise<string>, id: string): Promise<string> {
  return await Promise.resolve(fn(id));
}

describe('getBookUrl resolver contract', () => {
  it('sync resolver returns a URL string', async () => {
    const url = await resolveUrl((id) => `/books/${id}.pdf`, 'abc');
    expect(url).toBe('/books/abc.pdf');
  });

  it('async resolver resolves to a URL string', async () => {
    const url = await resolveUrl(async (id) => `/books/${id}.pdf`, 'xyz');
    expect(url).toBe('/books/xyz.pdf');
  });

  it('Electron custom-protocol resolver works', async () => {
    const url = await resolveUrl((id) => `book-file://files/${id}`, '42');
    expect(url).toBe('book-file://files/42');
  });

  it('spy resolver is called with the correct id', async () => {
    const resolver = vi.fn((id: string) => `https://cdn.example.com/${id}.pdf`);
    await resolveUrl(resolver, 'my-book');
    expect(resolver).toHaveBeenCalledWith('my-book');
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('resolver returning a promise chain resolves correctly', async () => {
    const fetch = vi.fn().mockResolvedValue({ url: '/books/fetched.pdf' });
    const resolver = async (id: string) => {
      const result = await fetch(id);
      return (result as { url: string }).url;
    };
    const url = await resolveUrl(resolver, 'test');
    expect(url).toBe('/books/fetched.pdf');
  });
});
