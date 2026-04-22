import { useState } from 'react';
import { ApiRequestError } from '../api/client';

export type ActorActionState = 'idle' | 'pending' | { error: string };

interface UseActorActionOptions<T> {
  run: () => Promise<T>;
  confirm?: string;
  onSuccess?: (result: T) => void;
}

// Generic state machine for "click button → maybe confirm → fire request →
// show pending → surface success or error" actions against a character
// actor. Used by the Character tab's Long Rest button and any future
// gameplay buttons that follow the same shell.
export function useActorAction<T>(opts: UseActorActionOptions<T>): {
  state: ActorActionState;
  trigger: () => Promise<void>;
} {
  const [state, setState] = useState<ActorActionState>('idle');

  const trigger = async (): Promise<void> => {
    if (state === 'pending') return;
    if (opts.confirm !== undefined && !window.confirm(opts.confirm)) return;
    setState('pending');
    try {
      const result = await opts.run();
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
