// Layer 1 — typed PF2e client.
//
// Hand-curated wrappers over the generic Foundry dispatcher (Layer 0).  Each
// method builds a DispatchRequest — the right class, document id, dot-path
// method, and args — and calls `dispatch`, which routes to
// game[collection].get(id)[method](...args) inside the Foundry module.
//
// The types below are intentionally inlined (no import from shared) so that
// this package stays zero-dep. They are structurally compatible with
// DispatchRequest / DispatchResponse from @foundry-toolkit/shared/rpc, so
// consumers that import both see no type mismatches.

// ─── Wire types (inlined) ───────────────────────────────────────────────────

/**
 * Request shape sent to the generic Foundry dispatcher.
 * Structurally identical to DispatchRequest in @foundry-toolkit/shared/rpc.
 */
export interface DispatchRequest {
  class: string;
  id: string;
  method: string;
  args: unknown[];
}

/**
 * Response envelope returned by the dispatcher on success.
 * Structurally identical to DispatchResponse in @foundry-toolkit/shared/rpc.
 */
export interface DispatchResponse {
  result: unknown;
}

// ─── DispatchFn ─────────────────────────────────────────────────────────────

/**
 * Function that executes a dispatch request over the bridge.
 *
 * In player-portal, pass `api.dispatch`.
 * In tests, pass a vi.fn() / jest.fn() spy.
 */
export type DispatchFn = (req: DispatchRequest) => Promise<DispatchResponse>;

// ─── Client factory ─────────────────────────────────────────────────────────

/**
 * Create a typed PF2e client — Layer 1 wrappers over the generic dispatcher.
 *
 * Each method translates a semantic PF2e operation into a DispatchRequest
 * and calls `dispatch`.  The dispatch function is injected so consumers can
 * provide real transport (player-portal) or a mock (tests) without changing
 * the wrapper logic.
 *
 * @param dispatch - function that sends a DispatchRequest and returns the result.
 *
 * @example
 * // In player-portal:
 * const pf2e = createPf2eClient(api.dispatch);
 * await pf2e.character(actorId).rollSave('fortitude');
 *
 * @example
 * // In tests:
 * const mockDispatch = vi.fn().mockResolvedValue({ result: null });
 * const pf2e = createPf2eClient(mockDispatch);
 */
export function createPf2eClient(dispatch: DispatchFn) {
  return {
    /**
     * Wrappers bound to a CharacterPF2e actor by id.
     *
     * @param actorId - Foundry document id of the CharacterPF2e actor.
     */
    character(actorId: string) {
      return {
        /**
         * Roll a saving throw via the dispatcher.
         *
         * Dispatches: `actor.saves[type].roll(opts)`
         *
         * @param type - 'fortitude' | 'reflex' | 'will'
         * @param opts - PF2e CheckRollContext options, e.g. `{ skipDialog, rollMode }`.
         *   Passed through to Foundry's roll method verbatim.
         */
        rollSave(type: 'fortitude' | 'reflex' | 'will', opts: Record<string, unknown> = {}): Promise<DispatchResponse> {
          return dispatch({
            class: 'CharacterPF2e',
            id: actorId,
            method: `saves.${type}.roll`,
            args: [opts],
          });
        },

        /**
         * Apply damage to the actor via the dispatcher.
         *
         * Dispatches: `actor.applyDamage(amount, opts)`
         *
         * @param amount - positive integer damage amount (pre-resistance / DR).
         * @param opts   - PF2e ApplyDamageParams (multiplier, damageType, …).
         */
        applyDamage(amount: number, opts: Record<string, unknown> = {}): Promise<DispatchResponse> {
          return dispatch({
            class: 'CharacterPF2e',
            id: actorId,
            method: 'applyDamage',
            args: [amount, opts],
          });
        },
      };
    },

    /**
     * Wrappers bound to a Strike action on a CharacterPF2e actor.
     *
     * @param actorId    - Foundry document id of the actor.
     * @param strikeSlug - slug of the weapon / strike action
     *   (matched against action.item.slug in actor.system.actions).
     */
    weapon(actorId: string, strikeSlug: string) {
      return {
        /**
         * Roll damage for a named strike via the dispatcher.
         *
         * Dispatches: `actor.system.actions[@slug:<strikeSlug>].rollDamage(opts)`
         *
         * The `[@slug:X]` notation is the dispatcher's array-lookup convention:
         * it finds the first element in actor.system.actions where
         * item.slug === strikeSlug (also checks .slug / .item.name).
         *
         * @param opts - PF2e DamageRollParams, e.g. `{ critical: true }`.
         *
         * Known limitation (spike): if the strikeSlug contains characters that
         * conflict with the `[@slug:X]` parser (e.g. `]`) the lookup will fail.
         * Follow-up: sanitize or encode the slug in the dispatcher resolver.
         */
        rollDamage(opts: Record<string, unknown> = {}): Promise<DispatchResponse> {
          return dispatch({
            class: 'CharacterPF2e',
            id: actorId,
            method: `system.actions[@slug:${strikeSlug}].rollDamage`,
            args: [opts],
          });
        },
      };
    },
  };
}
