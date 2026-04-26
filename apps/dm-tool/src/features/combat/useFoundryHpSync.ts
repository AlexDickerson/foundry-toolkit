import { useEffect, useRef } from 'react';
import type { Encounter } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';

/** Returns true for any dot-notation path that indicates an HP change. */
export function isHpPath(path: string): boolean {
  return path === 'system.attributes.hp' || path.startsWith('system.attributes.hp.');
}

function extractHp(system: Record<string, unknown>): { hp: number; maxHp: number } | null {
  const attrs = system['attributes'] as Record<string, unknown> | undefined;
  const hpBlock = attrs?.['hp'] as Record<string, unknown> | undefined;
  const hp = hpBlock?.['value'];
  const maxHp = hpBlock?.['max'];
  if (typeof hp !== 'number' || typeof maxHp !== 'number') return null;
  return { hp, maxHp };
}

/**
 * Subscribes to live actor updates from Foundry via the `actors` SSE channel
 * and applies HP changes to the encounter state. Filters for HP-related paths;
 * non-HP actor updates are ignored here. Only combatants with a
 * `foundryActorId` (PCs added from the party picker) are updated.
 */
export function useFoundryHpSync(encounter: Encounter, onChange: (next: Encounter) => Promise<void>): void {
  const encounterRef = useRef(encounter);
  useEffect(() => {
    encounterRef.current = encounter;
  });

  useEffect(() => {
    return api.onActorUpdated((update) => {
      if (!update.changedPaths.some(isHpPath)) return;
      const hpValues = extractHp(update.system);
      if (!hpValues) return;

      const current = encounterRef.current;
      const target = current.combatants.find((c) => c.foundryActorId === update.actorId);
      if (!target) return;

      void onChange({
        ...current,
        combatants: current.combatants.map((c) =>
          c.id === target.id ? { ...c, hp: hpValues.hp, maxHp: hpValues.maxHp } : c,
        ),
      });
    });
  }, [onChange]);
}
