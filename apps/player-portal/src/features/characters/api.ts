import type {
  ActorConditionKey,
  ActorResourceKey,
  AddItemFromCompendiumBody,
  AdjustActorConditionResponse,
  AdjustActorResourceResponse,
  CreateActorBody,
  DispatchRequest,
  DispatchResponse,
  PartyForMember,
  PartyStash,
  Pf2eRollMode,
  Pf2eStatisticSlug,
  RollActorStatisticResponse,
  UpdateActorBody,
  UpdateActorItemBody,
  UploadAssetBody,
} from '@foundry-toolkit/shared/rpc';

// Payload shape for the generic outbound-action endpoint. Each action
// slug has its own `params` shape; callers use `invokeActorAction`
// directly or one of the thin wrappers below that type-narrow per
// action.
type ActorActionParams = Record<string, unknown>;
import type { UploadAssetResult } from '@foundry-toolkit/shared/foundry-api';
import { buildCompendiumQuery, requestJson } from '@foundry-toolkit/shared/http';

import type {
  ActorItemRef,
  ActorRef,
  ActorSummary,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
  PreparedActor,
} from './types';

// Re-export the shared error so existing `instanceof ApiRequestError`
// callsites keep importing from this module.
export { ApiRequestError } from '@foundry-toolkit/shared/http';

// Dev: Vite proxies /api → :3000 (Fastify). Fastify then proxies /api/mcp →
// foundry-mcp (:8765) and handles /api/live/* in-process. Prod: one Fastify
// serves the built SPA + both namespaces same-origin.
const BASE = '/api/mcp';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

interface LongRestResponse {
  ok: boolean;
  messageCount: number;
}

function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return requestJson<T>(`${BASE}${path}`, init);
}

export const api = {
  getActors: (): Promise<ActorSummary[]> => request<ActorSummary[]>('/actors'),
  getPreparedActor: (id: string): Promise<PreparedActor> => request<PreparedActor>(`/actors/${id}/prepared`),
  searchCompendium: (opts: CompendiumSearchOptions): Promise<{ matches: CompendiumMatch[]; total: number }> =>
    request<{ matches: CompendiumMatch[]; total: number }>(`/compendium/search?${buildCompendiumQuery(opts)}`),
  listCompendiumPacks: (opts: { documentType?: string } = {}): Promise<{ packs: CompendiumPack[] }> => {
    const params = new URLSearchParams();
    if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
    const qs = params.toString();
    return request<{ packs: CompendiumPack[] }>(`/compendium/packs${qs ? `?${qs}` : ''}`);
  },
  getCompendiumDocument: (uuid: string): Promise<{ document: CompendiumDocument }> =>
    request<{ document: CompendiumDocument }>(`/compendium/document?uuid=${encodeURIComponent(uuid)}`),
  createActor: (body: CreateActorBody): Promise<ActorRef> =>
    request<ActorRef>('/actors', { method: 'POST', body }),
  updateActor: (id: string, patch: UpdateActorBody): Promise<ActorRef> =>
    request<ActorRef>(`/actors/${id}`, { method: 'PATCH', body: patch }),
  addItemFromCompendium: (id: string, body: AddItemFromCompendiumBody): Promise<ActorItemRef> =>
    request<ActorItemRef>(`/actors/${id}/items/from-compendium`, { method: 'POST', body }),
  deleteActorItem: (id: string, itemId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/actors/${id}/items/${itemId}`, { method: 'DELETE' }),
  updateActorItem: (id: string, itemId: string, patch: UpdateActorItemBody): Promise<ActorItemRef> =>
    request<ActorItemRef>(`/actors/${id}/items/${itemId}`, { method: 'PATCH', body: patch }),
  // Generic outbound-action dispatch. Every play-surface action (HP
  // steppers, condition steppers, statistic rolls, future craft /
  // rest-for-night / strike) routes through one endpoint —
  // `POST /api/mcp/actors/:id/actions/:action` — with `params` as the
  // action-specific bag. Returns whatever shape the handler returns;
  // callers type-narrow at the call site via the wrappers below.
  invokeActorAction: <T = Record<string, unknown>>(
    id: string,
    action: string,
    params?: ActorActionParams,
  ): Promise<T> =>
    request<T>(`/actors/${id}/actions/${encodeURIComponent(action)}`, {
      method: 'POST',
      body: { params },
    }),
  // Signed stepper for HP / temp HP / hero points / focus points.
  // Positive delta = heal / grant, negative = damage / spend. Server
  // clamps into [0, max] and returns `{before, after, max}` so the
  // caller can update its local view without a full /prepared refetch.
  adjustActorResource: (
    id: string,
    resource: ActorResourceKey,
    delta: number,
  ): Promise<AdjustActorResourceResponse> =>
    api.invokeActorAction<AdjustActorResourceResponse>(id, 'adjust-resource', { resource, delta }),
  // Signed stepper for dying / wounded / doomed. Each |delta| unit
  // triggers one increase/decreaseCondition call on the bridge, so
  // PF2e's cascade rules fire (dying→wounded, auto-death at cap).
  adjustActorCondition: (
    id: string,
    condition: ActorConditionKey,
    delta: number,
  ): Promise<AdjustActorConditionResponse> =>
    api.invokeActorAction<AdjustActorConditionResponse>(id, 'adjust-condition', { condition, delta }),
  // Click-to-roll for any PF2e `Statistic` — Perception, Fort/Ref/Will,
  // or any skill. Chat card lands in Foundry as a side effect; the
  // response carries `{total, formula, dice, chatMessageId?}` for
  // optional SPA-side display.
  rollActorStatistic: (
    id: string,
    statistic: Pf2eStatisticSlug,
    rollMode?: Pf2eRollMode,
  ): Promise<RollActorStatisticResponse> =>
    api.invokeActorAction<RollActorStatisticResponse>(
      id,
      'roll-statistic',
      rollMode !== undefined ? { statistic, rollMode } : { statistic },
    ),
  // Generic Foundry dispatcher — Layer 0. Sends { class, id, method, args }
  // to POST /api/dispatch and returns { result: unknown }. Normally called
  // indirectly via createPf2eClient(api.dispatch) from packages/pf2e-rules.
  dispatch: (req: DispatchRequest): Promise<DispatchResponse> =>
    request<DispatchResponse>('/dispatch', { method: 'POST', body: req }),
  resolvePrompt: (bridgeId: string, value: unknown): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/prompts/${bridgeId}/resolve`, { method: 'POST', body: { value } }),
  uploadAsset: (body: UploadAssetBody): Promise<UploadAssetResult> =>
    request<UploadAssetResult>('/uploads', { method: 'POST', body }),
  // Crafts a formula via the pf2e `Craft` activity. pf2e resolves the
  // item UUID internally, so the SPA passes the formula's compendium
  // UUID + quantity; the action fires a Crafting skill check chat
  // card and, on success, creates the item in the actor's inventory.
  // Actor state refresh comes via the `actors` event channel.
  craft: (id: string, itemUuid: string, quantity = 1): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(id, 'craft', { itemUuid, quantity }),
  // pf2e Rest for the Night — daily prep, HP heal, spell slot reset,
  // resource refresh. `messageCount` echoes how many chat messages
  // the activity produced so the SPA can display "N recovery
  // results" if it wants to.
  longRest: (id: string): Promise<LongRestResponse> =>
    api.invokeActorAction<LongRestResponse>(id, 'rest-for-the-night'),
  // Move an item (or a quantity of it) from the actor's inventory to a
  // party actor's stash. `quantity` defaults to the full stack (1 here;
  // bridge defaults to 1 when omitted).
  transferItemToParty: (actorId: string, itemId: string, partyId: string, quantity = 1): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(actorId, 'transfer-to-party', { itemId, targetActorId: partyId, quantity }),
  // Move an item from the party stash to a character's inventory.
  // Reuses the same bridge action (transfer-to-party) invoked on the
  // party actor with the character as the target.
  takeItemFromParty: (partyId: string, itemId: string, actorId: string, quantity = 1): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(partyId, 'transfer-to-party', { itemId, targetActorId: actorId, quantity }),
  // Rolls a single MAP variant of a Strike. `variantIndex` 0/1/2 maps
  // to first attack / second (−5 MAP) / third (−10 MAP). pf2e's
  // `StrikeData.variants[i].roll()` bakes in the MAP penalty.
  rollStrike: (id: string, strikeSlug: string, variantIndex: number): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(id, 'roll-strike', { strikeSlug, variantIndex }),
  // Rolls regular or critical damage for a Strike, based on the attack
  // outcome the SPA reads from the chat card.
  rollStrikeDamage: (id: string, strikeSlug: string, critical: boolean): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(id, 'roll-strike-damage', { strikeSlug, critical }),
  // Posts an owned item's action card to chat — mirrors the pf2e
  // sheet's "send to chat" button on an action / reaction / free
  // action. Consumable charge consumption is left to whoever clicks
  // the roll buttons inside the posted card. Distinct from the typed
  // `use-item` command, which runs the full activation pipeline.
  useItem: (id: string, itemId: string): Promise<{ ok: boolean; itemId: string; itemName: string }> =>
    api.invokeActorAction<{ ok: boolean; itemId: string; itemName: string }>(id, 'post-item-to-chat', { itemId }),
  // Casts a spell via the spellcasting entry. Consumes the appropriate
  // slot (spontaneous: decrements value; prepared: marks expended) and
  // creates the chat card. `rank` is the rank to cast at — pass the
  // spell's effective rank for standard casts, a higher rank to
  // heighten. Actor state refresh comes via the `actors` event channel.
  castSpell: (id: string, entryId: string, spellId: string, rank: number): Promise<{ ok: boolean }> =>
    api.invokeActorAction<{ ok: boolean }>(id, 'cast-spell', { entryId, spellId, rank }),
  // Formula book management. Add/remove dedupe on the bridge, so the
  // SPA can fire-and-forget; the `added`/`removed` flag in the
  // response tells callers whether a write actually happened.
  addFormula: (id: string, uuid: string): Promise<{ ok: boolean; added: boolean; uuid: string; formulaCount: number }> =>
    api.invokeActorAction<{ ok: boolean; added: boolean; uuid: string; formulaCount: number }>(id, 'add-formula', {
      uuid,
    }),
  // Given a character actor id, returns the party it belongs to plus rich
  // stat data for every party member. Used by useParty to power the Display
  // rail and the Stash section. Optional partyName provides the fallback when
  // the PF2e runtime doesn't expose actor.parties on the character actor.
  getPartyForMember: (actorId: string, partyName?: string): Promise<PartyForMember> => {
    const qs = partyName ? `?party=${encodeURIComponent(partyName)}` : '';
    return request<PartyForMember>(`/actors/${encodeURIComponent(actorId)}/party${qs}`);
  },
  // Returns all items on a Party actor in ItemSummary shape. Read-only.
  getPartyStash: (partyId: string): Promise<PartyStash> =>
    request<PartyStash>(`/actors/${encodeURIComponent(partyId)}/party-stash`),
  removeFormula: (
    id: string,
    uuid: string,
  ): Promise<{ ok: boolean; removed: boolean; uuid: string; formulaCount: number }> =>
    api.invokeActorAction<{ ok: boolean; removed: boolean; uuid: string; formulaCount: number }>(id, 'remove-formula', {
      uuid,
    }),
  // Adds a spell from a compendium UUID to a specific spellcasting entry
  // on the actor. Sets system.location.value so the PF2e system assigns
  // the spell to the correct entry (arcane/divine/etc.). Actor state
  // refresh comes via the `actors` event channel.
  addSpell: (actorId: string, uuid: string, entryId: string): Promise<ActorItemRef> => {
    const parsed = parseCompendiumUuid(uuid);
    if (parsed === null) return Promise.reject(new Error(`Cannot parse compendium UUID: ${uuid}`));
    return api.addItemFromCompendium(actorId, {
      packId: parsed.packId,
      itemId: parsed.itemId,
      systemOverrides: { location: { value: entryId } },
    });
  },
  listCompendiumSources: (
    opts: {
      documentType?: string;
      packIds?: string[];
      q?: string;
      traits?: string[];
      maxLevel?: number;
    } = {},
  ): Promise<{ sources: CompendiumSource[] }> => {
    const params = new URLSearchParams();
    if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
    if (opts.packIds !== undefined && opts.packIds.length > 0) params.set('packId', opts.packIds.join(','));
    if (opts.q !== undefined && opts.q.length > 0) params.set('q', opts.q);
    if (opts.traits !== undefined && opts.traits.length > 0) params.set('traits', opts.traits.join(','));
    if (opts.maxLevel !== undefined) params.set('maxLevel', opts.maxLevel.toString());
    const qs = params.toString();
    return request<{ sources: CompendiumSource[] }>(`/compendium/sources${qs ? `?${qs}` : ''}`);
  },
};

// Splits a Foundry compendium UUID into packId + itemId.
// Format: Compendium.<scope>.<name>.Item.<id>
// e.g. "Compendium.pf2e.spells-srd.Item.XyzAbc123" → { packId: "pf2e.spells-srd", itemId: "XyzAbc123" }
function parseCompendiumUuid(uuid: string): { packId: string; itemId: string } | null {
  const m = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(uuid);
  if (!m) return null;
  return { packId: m[1]!, itemId: m[2]! };
}
