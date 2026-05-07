import { useCallback, useEffect, useRef, useState } from 'react';

import type { PartyForMember, PartyMember, PartyRef } from '@foundry-toolkit/shared/rpc';
import { api } from '@/features/characters/api';
import { useEventChannel } from './useEventChannel';

interface UsePartyResult {
  party: PartyRef | null;
  members: PartyMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** SSE payload shape from the 'actors' channel. */
interface ActorUpdateEvent {
  actorId: string;
  changedPaths?: string[];
}

// Debounce delay for actor-update events. Heavy combat generates one
// updateActor hook per tick; 150ms trailing coalesces bursts without
// meaningfully delaying the UI update that follows.
const DEBOUNCE_MS = 150;

/**
 * Fetches the party for the given character actor and keeps it live via the
 * `actors` SSE channel.  Returns the party ref, member list, and loading/error
 * state.  Refetches are debounced at 150ms to absorb combat-tick storms.
 *
 * The hook does NOT render anything — UI is in PRs 2 and 3.
 */
export function useParty(actorId: string): UsePartyResult {
  const [party, setParty] = useState<PartyRef | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the resolved party id so actor-update events for the party itself
  // trigger a refetch even before the first render completes.
  const partyIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback((): void => {
    api
      .getPartyForMember(actorId)
      .then((data: PartyForMember) => {
        setParty(data.party);
        setMembers(data.members);
        partyIdRef.current = data.party?.id ?? null;
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [actorId]);

  // Initial fetch on mount and whenever actorId changes.
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Cleanup any pending debounce timer on unmount.
  useEffect(() => {
    return (): void => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // 150ms trailing debounce around doFetch.
  const scheduleRefetch = useCallback((): void => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(doFetch, DEBOUNCE_MS);
  }, [doFetch]);

  // Live updates: refetch when the party actor or any current member updates.
  // useEventChannel updates its handler ref on every render, so the closure
  // always sees the latest `members` state without causing re-subscription.
  useEventChannel<ActorUpdateEvent>('actors', (event) => {
    const isPartyActor = partyIdRef.current !== null && event.actorId === partyIdRef.current;
    const isMember = members.some((m) => m.id === event.actorId);
    if (isPartyActor || isMember) {
      scheduleRefetch();
    }
  });

  return { party, members, isLoading, error, refetch: doFetch };
}
