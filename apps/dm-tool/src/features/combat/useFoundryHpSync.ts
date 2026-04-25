import { useEffect, useRef } from 'react';
import type { Encounter } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';

/**
 * Subscribes to live HP updates from Foundry via the `actors` SSE channel
 * and propagates them to the encounter state. Only combatants with a
 * `foundryActorId` (PCs added from the party picker) are updated.
 *
 * Foundry is the source of truth: when an actor's HP changes there, this
 * hook overwrites the local value — including any unsaved manual edit the
 * DM may have made in the HP input.
 */
export function useFoundryHpSync(encounter: Encounter, onChange: (next: Encounter) => Promise<void>): void {
  // Keep a ref to the latest encounter so the subscription callback always
  // sees fresh data without needing to re-subscribe on every render.
  const encounterRef = useRef(encounter);
  useEffect(() => {
    encounterRef.current = encounter;
  });

  useEffect(() => {
    return api.onActorHpUpdated((update) => {
      const current = encounterRef.current;
      const target = current.combatants.find((c) => c.foundryActorId === update.actorId);
      if (!target) return;
      void onChange({
        ...current,
        combatants: current.combatants.map((c) =>
          c.id === target.id ? { ...c, hp: update.hp, maxHp: update.maxHp } : c,
        ),
      });
    });
  }, [onChange]);
}
