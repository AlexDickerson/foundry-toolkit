import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CharacterArtGallery } from './CharacterArtGallery';
import type { CharacterArt } from './character-art';

const single: CharacterArt = {
  id: 64,
  url: 'https://2e.aonprd.com/Ancestries.aspx?ID=64',
  images: ['https://2e.aonprd.com/Images/Ancestries/Human01.png'],
  count: 1,
};

const multi: CharacterArt = {
  id: 65,
  url: 'https://2e.aonprd.com/Ancestries.aspx?ID=65',
  images: [
    'https://2e.aonprd.com/Images/Ancestries/Leshy01.png',
    'https://2e.aonprd.com/Images/Ancestries/Leshy02.png',
    'https://2e.aonprd.com/Images/Ancestries/Leshy03.png',
  ],
  count: 3,
};

describe('CharacterArtGallery', () => {
  afterEach(cleanup);

  it('renders a single image with no nav buttons or position indicator', () => {
    render(<CharacterArtGallery art={single} subjectName="Human" />);
    const img = screen.getByAltText('Human reference art') as HTMLImageElement;
    expect(img.src).toBe(single.images[0]);
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByLabelText('Previous image')).toBeNull();
    expect(screen.queryByTestId('character-art-position')).toBeNull();
  });

  it('renders multi-image art with nav buttons and a 1-indexed position', () => {
    render(<CharacterArtGallery art={multi} subjectName="Leshy" />);
    expect(screen.getByLabelText('Next image')).toBeTruthy();
    expect(screen.getByLabelText('Previous image')).toBeTruthy();
    expect(screen.getByTestId('character-art-position').textContent).toBe('1 / 3');
  });

  it('cycles forward and wraps to the first image after the last', () => {
    render(<CharacterArtGallery art={multi} subjectName="Leshy" />);
    const next = screen.getByLabelText('Next image');
    const img = (): HTMLImageElement => screen.getByAltText('Leshy reference art') as HTMLImageElement;

    expect(img().src).toBe(multi.images[0]);
    fireEvent.click(next);
    expect(img().src).toBe(multi.images[1]);
    fireEvent.click(next);
    expect(img().src).toBe(multi.images[2]);
    fireEvent.click(next);
    expect(img().src).toBe(multi.images[0]); // wrap
    expect(screen.getByTestId('character-art-position').textContent).toBe('1 / 3');
  });

  it('cycles backward from the first image to the last', () => {
    render(<CharacterArtGallery art={multi} subjectName="Leshy" />);
    const prev = screen.getByLabelText('Previous image');
    const img = (): HTMLImageElement => screen.getByAltText('Leshy reference art') as HTMLImageElement;

    fireEvent.click(prev);
    expect(img().src).toBe(multi.images[2]);
    expect(screen.getByTestId('character-art-position').textContent).toBe('3 / 3');
  });

  it('links back to the AoN reference page', () => {
    render(<CharacterArtGallery art={single} subjectName="Human" />);
    const link = screen.getByRole('link', { name: /Source: Archives of Nethys/ });
    expect(link.getAttribute('href')).toBe(single.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
