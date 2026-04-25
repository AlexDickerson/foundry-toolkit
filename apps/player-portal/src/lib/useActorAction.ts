import { useState } from 'react';
import { ApiRequestError } from '../api/client';

export type ActorActionState = 'idle' | 'pending' | { error: string };

/**
 * Pending confirmation gate returned by `useActorAction` when the `confirm`
 * option is set. Callers render a `ConfirmDialog` keyed off this value
 * instead of relying on `window.confirm()`.
 */
export interface ConfirmingState {
  message: string;
  accept: () => void;
  cancel: () => void;
}

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
//
// When `confirm` is set the hook enters a `confirming` state rather than
// calling `window.confirm()`. Callers should render a `ConfirmDialog` while
// `confirming` is non-null — see `LongRestButton` for the pattern.
export function useActorAction<TRun extends AsyncFn>(opts: UseActorActionOptions<TRun>): {
  state: ActorActionState;
  trigger: (...args: Parameters<TRun>) => void;
  confirming: ConfirmingState | null;
} {
  const [state, setState] = useState<ActorActionState>('idle');
  const [confirming, setConfirming] = useState<ConfirmingState | null>(null);

  const trigger = (...args: Parameters<TRun>): void => {
    if (state === 'pending') return;

    const run = async (): Promise<void> => {
      setState('pending');
      try {
        const result = (await opts.run(...(args as never[]))) as Awaited<ReturnType<TRun>>;
        setState('idle');
        opts.onSuccess?.(result);
      } catch (err) {
        setState({ error: formatError(err) });
      }
    };

    if (opts.confirm !== undefined) {
      setConfirming({
        message: opts.confirm,
        accept: () => {
          setConfirming(null);
          void run();
        },
        cancel: () => {
          setConfirming(null);
        },
      });
      return;
    }

    void run();
  };

  return { state, trigger, confirming };
}

function formatError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.suggestion !== undefined ? `${err.message} — ${err.suggestion}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
