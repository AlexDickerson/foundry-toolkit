import { useState } from 'react';

export interface ExpandableCardHandle {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Controlled open/closed state for an expandable card. Drive a
 *  <details open={card.isOpen}> with onClick={(e) => { e.preventDefault(); card.toggle(); }}
 *  on the <summary>. The actions tab and any other expandable row can adopt this same hook. */
export function useExpandableCard(initialOpen = false): ExpandableCardHandle {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return {
    isOpen,
    open: (): void => { setIsOpen(true); },
    close: (): void => { setIsOpen(false); },
    toggle: (): void => { setIsOpen((prev) => !prev); },
  };
}
