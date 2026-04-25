import { useEffect, useRef } from 'react';

/**
 * Attaches a global keydown listener that calls onClose when Escape is pressed,
 * but only while isOpen is true. The listener is removed when isOpen flips to false
 * or the component unmounts.
 *
 * Skips closing when the event originates from an input, textarea, or contenteditable
 * element so that Escape in a filter field doesn't accidentally close the panel.
 *
 * The callback is held in a ref so that stale-closure updates to onClose never
 * force the listener to be torn down and re-registered.
 */
export function useEscapeToClose(onClose: () => void, isOpen: boolean): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }
      onCloseRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
}
