import { useState, useCallback } from 'react';

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
      setIds(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // localStorage unavailable — state still updates in memory
      }
    },
    [key],
  );

  return [ids, setAndPersist];
}
