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

// ─── InvokeActionFn ─────────────────────────────────────────────────────────

/**
 * Function that calls POST /api/actors/:id/actions/:action with a params bag.
 *
 * In player-portal, pass `api.invokeActorAction`.
 * In tests, pass a vi.fn() / jest.fn() spy.
 */
export type InvokeActionFn = (actorId: string, action: string, params?: Record<string, unknown>) => Promise<unknown>;

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
export function createPf2eClient(dispatch: DispatchFn, invokeAction?: InvokeActionFn) {
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
         * Roll a skill check via the dispatcher.
         *
         * Dispatches: `actor.skills[slug].roll(opts)`
         *
         * Works for both core skills (acrobatics, arcana, …) and lore skills
         * (custom slugs like "tanning-lore") — any slug present on the actor.
         *
         * @param slug - PF2e skill slug, e.g. 'acrobatics' or 'tanning-lore'.
         * @param opts - PF2e CheckRollContext options, e.g. `{ skipDialog, rollMode }`.
         *   Passed through to Foundry's roll method verbatim.
         */
        rollSkill(slug: string, opts: Record<string, unknown> = {}): Promise<DispatchResponse> {
          return dispatch({
            class: 'CharacterPF2e',
            id: actorId,
            method: `skills.${slug}.roll`,
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

    /**
     * Wrappers bound to a spellcasting entry on a CharacterPF2e actor.
     *
     * Uses the `invokeActorAction` transport (POST /api/actors/:id/actions/
     * cast-spell) rather than the generic dispatcher, because spellcasting
     * entries are embedded actor items and cannot be reached via the
     * dispatcher's collection lookup path.
     *
     * Requires `invokeAction` to be passed to `createPf2eClient`.
     *
     * @param actorId  - Foundry document id of the CharacterPF2e actor.
     * @param entryId  - Foundry item id of the SpellcastingEntryPF2e item.
     */
    spellEntry(actorId: string, entryId: string) {
      return {
        /**
         * Cast a spell from this spellcasting entry.
         *
         * Calls: `POST /api/actors/:actorId/actions/cast-spell`
         *   params: `{ entryId, spellId, rank }`
         *
         * @param spellId - Foundry item id of the spell on the actor.
         * @param rank    - Rank to cast at (0 = cantrip, 1–10 = spell rank).
         */
        cast(spellId: string, rank: number): Promise<unknown> {
          if (!invokeAction) {
            throw new Error('pf2eClient.spellEntry.cast: invokeAction function not provided to createPf2eClient');
          }
          return invokeAction(actorId, 'cast-spell', { entryId, spellId, rank });
        },
      };
    },
  };
}
