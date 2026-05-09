// Decorative reference-art gallery shown inside the ancestry / class detail
// panel. One image at a time with prev/next buttons when more than one is
// available. Click the image to view it full-size in a lightbox overlay.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterArt } from '../../data/character-art';

interface Props {
  art: CharacterArt;
  /** Display name shown to the user — used for the alt text. */
  subjectName: string;
}

export function CharacterArtGallery({ art, subjectName }: Props): React.ReactElement | null {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (art.images.length === 0) return null;

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
    <>
      <figure className="flex h-full flex-col space-y-1.5" data-testid="character-art-gallery">
        <div className="relative min-h-0 flex-1">
          <img
            src={current}
            alt={`${subjectName} reference art`}
            loading="lazy"
            onClick={() => setLightboxOpen(true)}
            className="h-full w-full cursor-zoom-in rounded border border-pf-border bg-pf-bg-dark object-contain"
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

      {lightboxOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${subjectName} reference art – full size`}
            className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <img
              src={current}
              alt={`${subjectName} reference art`}
              className="max-h-full max-w-full rounded shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
