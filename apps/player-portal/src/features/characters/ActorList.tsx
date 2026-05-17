import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/features/characters/api';
import type { ActorSummary } from '@/features/characters/types';
import { isPlayerCharacter } from '@/features/characters/lib/actor-utils';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; suggestion?: string }
  | { kind: 'ready'; actors: ActorSummary[] };

interface Props {
  onSelect?: (actor: ActorSummary) => void;
  onEdit?: (actor: ActorSummary) => void;
}

export function ActorList({ onSelect, onEdit }: Props = {}): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .getActors()
      .then((actors): void => {
        if (!cancelled) setState({ kind: 'ready', actors });
      })
      .catch((err: unknown): void => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const suggestion = err instanceof ApiRequestError ? err.suggestion : undefined;
        setState(suggestion !== undefined ? { kind: 'error', message, suggestion } : { kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-pf-text-muted">Loading actors…</p>;
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <p className="font-medium text-red-900">Couldn&apos;t load actors</p>
        <p className="mt-1 text-red-800">{state.message}</p>
        {state.suggestion !== undefined && <p className="mt-2 text-red-700">{state.suggestion}</p>}
      </div>
    );
  }

  // The bridge already filters to characters only; this is a defensive
  // second layer in case a stale bridge or mock returns mixed actor types.
  const characters = state.actors.filter(isPlayerCharacter);

  if (characters.length === 0) {
    return <p className="text-sm text-pf-text-muted">No player characters in the world yet.</p>;
  }

  const groups = groupByParty(characters);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.partyId ?? '__unaffiliated__'} data-party-id={group.partyId ?? 'unaffiliated'}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-pf-text-muted">
            {group.partyName ?? 'Unaffiliated'}
          </h2>
          <ul className="divide-y divide-pf-border rounded border border-pf-border">
            {group.actors.map((actor) => (
              <ActorRow key={actor.id} actor={actor} onSelect={onSelect} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface PartyGroup {
  partyId: string | null;
  partyName: string | null;
  actors: ActorSummary[];
}

// Bucket characters by party. Stable order: parties alphabetically by name,
// then unaffiliated last. Actors within a group keep their server-provided order.
function groupByParty(actors: ActorSummary[]): PartyGroup[] {
  const byId = new Map<string, PartyGroup>();
  const unaffiliated: ActorSummary[] = [];
  for (const actor of actors) {
    const party = actor.party;
    if (party === undefined || party === null) {
      unaffiliated.push(actor);
      continue;
    }
    let group = byId.get(party.id);
    if (group === undefined) {
      group = { partyId: party.id, partyName: party.name, actors: [] };
      byId.set(party.id, group);
    }
    group.actors.push(actor);
  }
  const partyGroups = [...byId.values()].sort((a, b) =>
    (a.partyName ?? '').localeCompare(b.partyName ?? ''),
  );
  if (unaffiliated.length > 0) {
    partyGroups.push({ partyId: null, partyName: null, actors: unaffiliated });
  }
  return partyGroups;
}

function ActorRow({
  actor,
  onSelect,
  onEdit,
}: {
  actor: ActorSummary;
  onSelect: ((actor: ActorSummary) => void) | undefined;
  onEdit: ((actor: ActorSummary) => void) | undefined;
}): React.ReactElement {
  const isInProgress = actor.flags?.['foundry-toolkit']?.['creatorInProgress'] === true;
  const clickable = onSelect !== undefined;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        disabled={!clickable}
        onClick={
          clickable
            ? (): void => {
                onSelect(actor);
              }
            : undefined
        }
        className={[
          'flex-1 truncate text-left font-medium',
          clickable ? 'cursor-pointer hover:text-pf-primary' : '',
        ].join(' ')}
      >
        {actor.name}
      </button>
      {onEdit !== undefined && (
        <button
          type="button"
          onClick={(): void => {
            onEdit(actor);
          }}
          data-testid={isInProgress ? 'continue-button' : 'edit-button'}
          className={[
            'shrink-0 rounded border px-2 py-1 text-xs font-medium transition-colors',
            isInProgress
              ? 'border-pf-primary bg-pf-primary text-white hover:bg-pf-primary-dark'
              : 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg-dark',
          ].join(' ')}
        >
          {isInProgress ? 'Continue' : 'Edit'}
        </button>
      )}
      {clickable && onEdit === undefined && <span className="text-pf-text-muted">→</span>}
    </li>
  );
}
