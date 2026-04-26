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
 * and applies HP changes to every encounter that has a matching combatant
 * (matched by `foundryActorId`). Mounted at the CombatTab level so non-active
 * encounters stay in sync as well — switching encounters never shows stale HP.
 *
 * Skips no-op saves where local HP already matches the incoming value, so
 * the round-trip from a manual edit pushed to Foundry doesn't loop back into
 * a pointless DB write.
 */
export function useFoundryHpSync(encounters: Encounter[], saveEncounter: (next: Encounter) => Promise<void>): void {
  const encountersRef = useRef(encounters);
  useEffect(() => {
    encountersRef.current = encounters;
  });

  useEffect(() => {
    return api.onActorUpdated((update) => {
      if (!update.changedPaths.some(isHpPath)) return;
      const hpValues = extractHp(update.system);
      if (!hpValues) {
        console.warn(`useFoundryHpSync: ${update.actorId} HP path changed but extraction failed`);
        return;
      }

      for (const enc of encountersRef.current) {
        const target = enc.combatants.find((c) => c.foundryActorId === update.actorId);
        if (!target) continue;
        if (target.hp === hpValues.hp && target.maxHp === hpValues.maxHp) continue;

        console.info(
          `useFoundryHpSync: applying HP ${hpValues.hp}/${hpValues.maxHp} to ${target.displayName} (${update.actorId}) in "${enc.name}"`,
        );
        void saveEncounter({
          ...enc,
          combatants: enc.combatants.map((c) =>
            c.id === target.id ? { ...c, hp: hpValues.hp, maxHp: hpValues.maxHp } : c,
          ),
        });
      }
    });
  }, [saveEncounter]);
}
