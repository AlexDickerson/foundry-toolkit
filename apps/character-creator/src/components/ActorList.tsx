import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { ActorSummary } from '../api/types';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; suggestion?: string }
  | { kind: 'ready'; actors: ActorSummary[] };

interface Props {
  onSelect?: (actor: ActorSummary) => void;
}

export function ActorList({ onSelect }: Props = {}): React.ReactElement {
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
    return <p className="text-sm text-neutral-500">Loading actors…</p>;
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

  if (state.actors.length === 0) {
    return <p className="text-sm text-neutral-500">No actors in the world yet.</p>;
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
      {state.actors.map((actor) => {
        const isCharacter = actor.type === 'character';
        const clickable = isCharacter && onSelect !== undefined;
        return (
          <li
            key={actor.id}
            className={[
              'flex items-center gap-3 px-4 py-3',
              clickable ? 'cursor-pointer hover:bg-neutral-50' : '',
            ].join(' ')}
            onClick={
              clickable
                ? (): void => {
                    onSelect(actor);
                  }
                : undefined
            }
          >
            <span className="flex-1 truncate font-medium">{actor.name}</span>
            <span className="text-xs uppercase tracking-wide text-neutral-500">{actor.type}</span>
            {clickable && <span className="text-neutral-400">→</span>}
          </li>
        );
      })}
    </ul>
  );
}
