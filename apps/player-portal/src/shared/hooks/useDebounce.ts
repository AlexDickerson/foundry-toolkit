import { useEffect, useState } from 'react';

// Returns a version of `value` that only updates after `delay` ms have
// passed without a new change. Used by search boxes to throttle the
// network trip per keystroke.
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return (): void => {
      clearTimeout(id);
    };
  }, [value, delayMs]);
  return debounced;
}
