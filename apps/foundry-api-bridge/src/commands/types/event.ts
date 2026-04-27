/** Event channel subscription and generic dispatcher command params and results. */

// Event channel subscription updates. Server pushes one of these
// whenever a channel transitions 0↔1 SSE subscribers; the module
// registers or tears down the matching Hooks.on listeners.
export interface SetEventSubscriptionParams {
  channel: string;
  active: boolean;
}

export interface SetEventSubscriptionResult {
  channel: string;
  active: boolean;
}

// Generic Foundry dispatcher. One command type handles any document class +
// method combination; the bridge resolves the collection, traverses the
// dot-path, unmarshals DocRef args, and marshals Document results.
export interface DispatchParams {
  /** Foundry / PF2e class name, e.g. 'CharacterPF2e', 'Actor', 'Item'. */
  class: string;
  /** Foundry document id. */
  id: string;
  /** Dot-path method: 'applyDamage', 'saves.fortitude.roll',
   *  'system.actions[@slug:longsword].rollDamage'. */
  method: string;
  /** Positional args.  DocRef objects ({__doc, id}) resolved to live docs. */
  args?: unknown[];
}

export interface DispatchResult {
  /** JSON-serializable return value. Documents are serialized via .toObject().
   *  void / undefined becomes null. */
  result: unknown;
}
