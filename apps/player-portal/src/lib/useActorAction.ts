import { useState } from 'react';
import { ApiRequestError } from '../api/client';

export type ActorActionState = 'idle' | 'pending' | { error: string };

// Any async function — trigger's signature mirrors it so callers can
// pass per-click args like a Strike's MAP variant index.
type AsyncFn = (...args: never[]) => Promise<unknown>;

interface UseActorActionOptions<TRun extends AsyncFn> {
  run: TRun;
  confirm?: string;
  onSuccess?: (result: Awaited<ReturnType<TRun>>) => void;
}

// Generic state machine for "click button → maybe confirm → fire request →
// show pending → surface success or error" actions against a character
// actor. Used by Long Rest, Strike + Use on the Actions tab, and any
// future gameplay buttons that follow the same shell.
export function useActorAction<TRun extends AsyncFn>(opts: UseActorActionOptions<TRun>): {
  state: ActorActionState;
  trigger: (...args: Parameters<TRun>) => Promise<void>;
} {
  const [state, setState] = useState<ActorActionState>('idle');

  const trigger = async (...args: Parameters<TRun>): Promise<void> => {
    if (state === 'pending') return;
    if (opts.confirm !== undefined && !window.confirm(opts.confirm)) return;
    setState('pending');
    try {
      const result = (await opts.run(...args)) as Awaited<ReturnType<TRun>>;
      setState('idle');
      opts.onSuccess?.(result);
    } catch (err) {
      setState({ error: formatError(err) });
    }
  };

  return { state, trigger };
}

function formatError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.suggestion !== undefined ? `${err.message} — ${err.suggestion}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
