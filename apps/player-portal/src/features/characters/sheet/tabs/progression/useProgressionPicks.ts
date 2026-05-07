import { useEffect, useRef, useState } from 'react';
import { api } from '@/features/characters/api';
import type { PreparedActorItem, ProficiencyRank } from '@/features/characters/types';
import {
  buildProgressionPicksFlags,
  parsePersistedPick,
  type Pick,
} from './picks';
import {
  featSlotLocationFor,
  parseFeatLocation,
  parseSlotKey,
  slotKey,
  type SlotKey,
  type SlotType,
} from './slot';

interface Options {
  actorId: string;
  items: PreparedActorItem[];
  characterLevel: number;
  /** Deserialised from `actor.flags['player-portal']['progression-picks']`. */
  persistedPicks?: Record<string, unknown>;
  /** Called after each successful Foundry write so the parent can refetch
   *  `/prepared` and re-render with the new state. */
  onActorChanged: () => void;
}

interface UseProgressionPicksReturn {
  picks: Map<SlotKey, Pick>;
  /** Commit a pick to the slot. Optimistically updates local state; for
   *  current/past levels writes to Foundry immediately and rolls back on
   *  failure. For future levels stores the plan in the actor flag only —
   *  the hydration effect auto-applies the system write when the
   *  character reaches the level. */
  commitPick: (level: number, slot: SlotType, pick: Pick) => void;
  /** Reverse a pick: removes from local state, deletes the actor item
   *  (for feats), reverts the system write (for skill increases /
   *  ability boosts) — or just trims the flag for not-yet-applied
   *  future picks. */
  clearPick: (level: number, slot: SlotType) => void;
}

/**
 * Owns the progression-tab pick map plus all the orchestration around it:
 * hydrating from existing feat items + the actor flag, auto-applying
 * deferred writes when the character levels up, and the per-pick-kind
 * optimistic-update / Foundry-write / rollback dance for every commit
 * and clear.
 */
export function useProgressionPicks({
  actorId,
  items,
  characterLevel,
  persistedPicks,
  onActorChanged,
}: Options): UseProgressionPicksReturn {
  const [picks, setPicks] = useState<Map<SlotKey, Pick>>(new Map());
  // Tracks the previous characterLevel so the hydration effect can detect
  // level-ups and auto-apply picks that just became reachable.
  const prevCharacterLevelRef = useRef(characterLevel);

  useEffect(() => {
    const hydrated = new Map<SlotKey, Pick>();
    // Feat picks are always re-derived from items[].system.location —
    // pf2e tags feats added via "Add to Slot" with `<category>-<level>`,
    // and the character creator wizard sets the same string when it
    // piecemeal-adds L1 feats.
    for (const item of items) {
      if (item.type !== 'feat') continue;
      const rawLocation = (item.system as { location?: unknown } | null)?.location;
      if (typeof rawLocation !== 'string' || rawLocation.length === 0) continue;
      const parsed = parseFeatLocation(rawLocation);
      if (parsed === null) continue;
      hydrated.set(slotKey(parsed.level, parsed.slot), {
        kind: 'feat',
        actorItemId: item.id,
        match: {
          packId: '',
          packLabel: '',
          documentId: item.id,
          // Use the actor-local item id as a stand-in uuid: the
          // PreparedActor payload drops `flags.core.sourceId` so we
          // don't know the compendium origin. Hover previews won't
          // resolve, but the chip shows name + img correctly.
          uuid: item.id,
          name: item.name,
          type: item.type,
          img: item.img,
        },
      });
    }
    // Non-feat picks come from the actor flag — Foundry doesn't encode
    // skill increases or ability boosts per-slot in the prepared payload.
    if (persistedPicks !== undefined) {
      for (const [key, raw] of Object.entries(persistedPicks)) {
        if (hydrated.has(key)) continue; // feat from items takes precedence
        const pick = parsePersistedPick(raw);
        if (pick !== null) hydrated.set(key, pick);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks((prev) => {
      const next = new Map(hydrated);
      // In-memory fallback: preserve any non-feat picks not yet reflected
      // in flags (the optimistic window between commitPick and
      // onActorChanged completing its /prepared reload).
      for (const [key, pick] of prev) {
        if (pick.kind !== 'feat' && !next.has(key)) next.set(key, pick);
      }
      return next;
    });
    // Auto-apply: when the character levels up, fire the deferred system
    // writes for any non-feat picks that just became reachable (they were
    // stored in flags while the level was still future).
    const prevLevel = prevCharacterLevelRef.current;
    prevCharacterLevelRef.current = characterLevel;
    if (characterLevel > prevLevel) {
      for (const [key, pick] of hydrated) {
        if (pick.kind === 'feat') continue;
        const parsed = parseSlotKey(key);
        if (!parsed) continue;
        const { level } = parsed;
        if (level <= prevLevel || level > characterLevel) continue;
        if (pick.kind === 'skill-increase') {
          void api
            .updateActor(actorId, {
              system: { skills: { [pick.skill]: { rank: pick.newRank } } },
              flags: buildProgressionPicksFlags(hydrated),
            })
            .then(() => {
              onActorChanged();
            })
            .catch((err: unknown) => {
              console.warn('Failed to auto-apply skill increase', err);
            });
        } else if (pick.kind === 'ability-boosts') {
          void api
            .updateActor(actorId, {
              system: { build: { attributes: { boosts: { [level]: pick.abilities } } } },
              flags: buildProgressionPicksFlags(hydrated),
            })
            .then(() => {
              onActorChanged();
            })
            .catch((err: unknown) => {
              console.warn('Failed to auto-apply ability boosts', err);
            });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items / persistedPicks / characterLevel arrive together via the actor refetch; onActorChanged + actorId are stable references for a given mount.
  }, [items, persistedPicks, characterLevel]);

  const commitPick = (level: number, slot: SlotType, pick: Pick): void => {
    const key = slotKey(level, slot);
    const existingPick = picks.get(key);

    // Compute post-pick state synchronously so flag serialisation reflects
    // the new pick without waiting for React to flush the setState.
    const newPicksForFlag = new Map(picks);
    newPicksForFlag.set(key, pick);

    setPicks((prev) => {
      const next = new Map(prev);
      next.set(key, pick);
      return next;
    });

    const isFutureLevel = level > characterLevel;
    const rollback = (): void => {
      setPicks((prev) => {
        const next = new Map(prev);
        if (existingPick !== undefined) next.set(key, existingPick);
        else next.delete(key);
        return next;
      });
    };

    if (pick.kind === 'feat') {
      if (isFutureLevel) {
        // Future feats are planning-only: keep in local state, no API call.
        // They'll be applied via addItemFromCompendium when the user
        // reaches this level and explicitly picks in the now-current slot.
        return;
      }
      const location = featSlotLocationFor(slot, level);
      void api
        .addItemFromCompendium(actorId, {
          packId: pick.match.packId,
          itemId: pick.match.documentId,
          ...(location !== null ? { systemOverrides: { location } } : {}),
        })
        .then((ref) => {
          // Attach the actor-local item id so subsequent clears can delete it.
          setPicks((prev) => {
            const current = prev.get(key);
            if (!current || current.kind !== 'feat') return prev;
            const next = new Map(prev);
            next.set(key, { ...current, actorItemId: ref.id });
            return next;
          });
          // Remove whichever item was filling this slot before, if any.
          if (existingPick?.kind === 'feat' && existingPick.actorItemId !== undefined) {
            void api.deleteActorItem(actorId, existingPick.actorItemId).catch((err: unknown) => {
              console.warn('Failed to clean up replaced feat item', err);
            });
          }
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist feat pick', err);
          rollback();
        });
    } else if (pick.kind === 'skill-increase') {
      if (isFutureLevel) {
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to save planned skill increase', err);
            rollback();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { skills: { [pick.skill]: { rank: pick.newRank } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist skill increase', err);
          rollback();
        });
    } else if (pick.kind === 'ability-boosts') {
      if (isFutureLevel) {
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to save planned ability boosts', err);
            rollback();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { build: { attributes: { boosts: { [level]: pick.abilities } } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist ability boosts', err);
          rollback();
        });
    }
  };

  const clearPick = (level: number, slot: SlotType): void => {
    const key = slotKey(level, slot);
    const existingPick = picks.get(key);

    const newPicksForFlag = new Map(picks);
    newPicksForFlag.delete(key);

    setPicks((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

    if (existingPick === undefined) return;

    const isFutureLevel = level > characterLevel;
    const undoClear = (): void => {
      setPicks((prev) => {
        const next = new Map(prev);
        next.set(key, existingPick);
        return next;
      });
    };

    if (existingPick.kind === 'feat') {
      if (isFutureLevel) {
        // Future feat was never added to the actor — nothing to undo in Foundry.
        return;
      }
      if (existingPick.actorItemId === undefined) return;
      void api
        .deleteActorItem(actorId, existingPick.actorItemId)
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to delete feat item', err);
          undoClear();
        });
    } else if (existingPick.kind === 'skill-increase') {
      if (isFutureLevel) {
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to remove planned skill increase from flags', err);
            undoClear();
          });
        return;
      }
      const prevRank = (existingPick.newRank - 1) as ProficiencyRank;
      void api
        .updateActor(actorId, {
          system: { skills: { [existingPick.skill]: { rank: prevRank } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to revert skill increase', err);
          undoClear();
        });
    } else if (existingPick.kind === 'ability-boosts') {
      if (isFutureLevel) {
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to remove planned ability boosts from flags', err);
            undoClear();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { build: { attributes: { boosts: { [level]: [] } } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to clear ability boosts', err);
          undoClear();
        });
    }
  };

  return { picks, commitPick, clearPick };
}
