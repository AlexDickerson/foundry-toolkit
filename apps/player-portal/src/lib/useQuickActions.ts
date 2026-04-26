import { useState, useCallback } from 'react';

const MAX_QUICK_ACTIONS = 5;

export function useQuickActions(actorId: string): [string[], (ids: string[]) => void] {
  const key = `qt:${actorId}`;

  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const setAndPersist = useCallback(
    (next: string[]) => {
      const clamped = next.slice(0, MAX_QUICK_ACTIONS);
      setIds(clamped);
      try {
        localStorage.setItem(key, JSON.stringify(clamped));
      } catch {
        // localStorage unavailable — state still updates in memory
      }
    },
    [key],
  );

  return [ids, setAndPersist];
}
