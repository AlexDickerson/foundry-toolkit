// Decorative reference-art gallery shown inside the ancestry / class detail
// panel. One image at a time with prev/next buttons when more than one is
// available. Source URL is credited to the user as a "view on Archives of
// Nethys" link below the image.

import { useState } from 'react';
import type { CharacterArt } from '../../data/character-art';

interface Props {
  art: CharacterArt;
  /** Display name shown to the user — used for the alt text. */
  subjectName: string;
}

export function CharacterArtGallery({ art, subjectName }: Props): React.ReactElement | null {
  const [index, setIndex] = useState(0);

  if (art.images.length === 0) return null;

  // Defensive clamp in case art changed under us (e.g., switching between
  // ancestries with different image counts).
  const safeIndex = Math.min(index, art.images.length - 1);
  const current = art.images[safeIndex]!;
  const hasMultiple = art.images.length > 1;

  function step(delta: number): void {
    setIndex((i) => {
      const next = i + delta;
      if (next < 0) return art.images.length - 1;
      if (next >= art.images.length) return 0;
      return next;
    });
  }

  return (
    <figure className="space-y-1.5" data-testid="character-art-gallery">
      <div className="relative">
        <img
          src={current}
          alt={`${subjectName} reference art`}
          loading="lazy"
          className="mx-auto max-h-[45vh] w-full object-contain rounded border border-pf-border bg-pf-bg-dark"
        />
        {hasMultiple && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between p-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="pointer-events-auto rounded-full bg-pf-bg/80 px-2 py-1 text-pf-text shadow hover:bg-pf-bg hover:text-pf-primary"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="pointer-events-auto rounded-full bg-pf-bg/80 px-2 py-1 text-pf-text shadow hover:bg-pf-bg hover:text-pf-primary"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between text-[10px] uppercase tracking-widest text-pf-alt-dark">
        {hasMultiple ? (
          <span data-testid="character-art-position">
            {(safeIndex + 1).toString()} / {art.images.length.toString()}
          </span>
        ) : (
          <span />
        )}
        <a href={art.url} target="_blank" rel="noopener noreferrer" className="hover:text-pf-primary">
          Source: Archives of Nethys ↗
        </a>
      </figcaption>
    </figure>
  );
}
