import type {
  ActorConditionKey,
  ActorResourceKey,
  AddItemFromCompendiumBody,
  AdjustActorConditionResponse,
  AdjustActorResourceResponse,
  CreateActorBody,
  Pf2eRollMode,
  Pf2eStatisticSlug,
  RollActorStatisticResponse,
  UpdateActorBody,
  UpdateActorItemBody,
  UploadAssetBody,
} from '@foundry-toolkit/shared/rpc';
import type { UploadAssetResult } from '@foundry-toolkit/shared/foundry-api';

import type {
  ActorItemRef,
  ActorRef,
  ActorSummary,
  ApiError,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
  PreparedActor,
} from './types';

// Dev: Vite proxies /api → :8765. Prod: served same-origin or via a reverse
// proxy that preserves /api. Either way, paths are relative.
const BASE = '/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly suggestion: string | undefined;

  constructor(status: number, error: string, suggestion?: string) {
    super(error);
    this.name = 'ApiRequestError';
    this.status = status;
    this.suggestion = suggestion;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export interface LongRestResponse {
  ok: boolean;
  messageCount: number;
}

export type ActorType = 'character' | 'npc' | 'hazard' | 'loot' | 'party' | 'vehicle' | 'familiar';

export interface RunActorScriptOptions {
  actorId: string;
  /** If set, throws before running `body` when the actor's type doesn't match. */
  requireType?: ActorType;
  /** JS body that runs inside an async IIFE with `actor` in scope. Must
   *  `return` a JSON-serializable value — Foundry Documents need
   *  `.toObject(false)` first. */
  body: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = {
    method,
    headers:
      opts.body !== undefined
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let body: ApiError = { error: `HTTP ${res.status.toString()}` };
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // Response wasn't JSON — fall through with the status-only error.
    }
    throw new ApiRequestError(res.status, body.error, body.suggestion);
  }
  return (await res.json()) as T;
}

function buildCompendiumQuery(opts: CompendiumSearchOptions): string {
  const params = new URLSearchParams();
  if (opts.q !== undefined && opts.q.length > 0) params.set('q', opts.q);
  if (opts.packIds !== undefined && opts.packIds.length > 0) params.set('packId', opts.packIds.join(','));
  if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
  if (opts.traits !== undefined && opts.traits.length > 0) params.set('traits', opts.traits.join(','));
  if (opts.anyTraits !== undefined && opts.anyTraits.length > 0) params.set('anyTraits', opts.anyTraits.join(','));
  if (opts.sources !== undefined && opts.sources.length > 0) params.set('sources', opts.sources.join(','));
  if (opts.ancestrySlug !== undefined && opts.ancestrySlug.length > 0) params.set('ancestrySlug', opts.ancestrySlug);
  if (opts.maxLevel !== undefined) params.set('maxLevel', opts.maxLevel.toString());
  if (opts.limit !== undefined) params.set('limit', opts.limit.toString());
  return params.toString();
}

export const api = {
  getActors: (): Promise<ActorSummary[]> => request<ActorSummary[]>('/actors'),
  getPreparedActor: (id: string): Promise<PreparedActor> => request<PreparedActor>(`/actors/${id}/prepared`),
  searchCompendium: (opts: CompendiumSearchOptions): Promise<{ matches: CompendiumMatch[] }> =>
    request<{ matches: CompendiumMatch[] }>(`/compendium/search?${buildCompendiumQuery(opts)}`),
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
  // Signed stepper for HP / temp HP / hero points / focus points.
  // Positive delta = heal / grant, negative = damage / spend. Server
  // clamps into [0, max] and returns `{before, after, max}` so the
  // caller can update its local view without a full /prepared refetch.
  adjustActorResource: (
    id: string,
    resource: ActorResourceKey,
    delta: number,
  ): Promise<AdjustActorResourceResponse> =>
    request<AdjustActorResourceResponse>(`/actors/${id}/resources/adjust`, {
      method: 'POST',
      body: { resource, delta },
    }),
  // Signed stepper for dying / wounded / doomed. Each |delta| unit
  // triggers one increase/decreaseCondition call on the bridge, so
  // PF2e's cascade rules fire (dying→wounded, auto-death at cap).
  adjustActorCondition: (
    id: string,
    condition: ActorConditionKey,
    delta: number,
  ): Promise<AdjustActorConditionResponse> =>
    request<AdjustActorConditionResponse>(`/actors/${id}/conditions/adjust`, {
      method: 'POST',
      body: { condition, delta },
    }),
  // Click-to-roll for any PF2e `Statistic` — Perception, Fort/Ref/Will,
  // or any skill. Chat card lands in Foundry as a side effect; the
  // response carries `{total, formula, dice, chatMessageId?}` for
  // optional SPA-side display.
  rollActorStatistic: (
    id: string,
    statistic: Pf2eStatisticSlug,
    rollMode?: Pf2eRollMode,
  ): Promise<RollActorStatisticResponse> =>
    request<RollActorStatisticResponse>(`/actors/${id}/rolls/statistic`, {
      method: 'POST',
      body: { statistic, ...(rollMode !== undefined ? { rollMode } : {}) },
    }),
  resolvePrompt: (bridgeId: string, value: unknown): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/prompts/${bridgeId}/resolve`, { method: 'POST', body: { value } }),
  uploadAsset: (body: UploadAssetBody): Promise<UploadAssetResult> =>
    request<UploadAssetResult>('/uploads', { method: 'POST', body }),
  // Runs `body` inside an async IIFE in the Foundry page with an `actor`
  // local pre-resolved from the given id. Fails with a clear message if the
  // actor doesn't exist or doesn't match `requireType`. `body` must
  // explicitly `return` — JS has no implicit last-expression return. Hits
  // /api/eval, so the server must have ALLOW_EVAL=1 for this to work at
  // all; promote a call site to a typed command when the eval gate
  // becomes a problem.
  runActorScript: <T = unknown>(opts: RunActorScriptOptions): Promise<T> => {
    const typeCheck =
      opts.requireType !== undefined
        ? `if (actor.type !== ${JSON.stringify(opts.requireType)}) throw new Error('Actor is not a ' + ${JSON.stringify(opts.requireType)});`
        : '';
    const script = `
      const actor = game.actors.get(${JSON.stringify(opts.actorId)});
      if (!actor) throw new Error('Actor not found: ' + ${JSON.stringify(opts.actorId)});
      ${typeCheck}
      ${opts.body}
    `;
    return request<T>('/eval', { method: 'POST', body: { script } });
  },
  longRest: (id: string): Promise<LongRestResponse> =>
    api.runActorScript<LongRestResponse>({
      actorId: id,
      requireType: 'character',
      body: `
        const messages = await game.pf2e.actions.restForTheNight({ actors: [actor], skipDialog: true });
        return { ok: true, messageCount: messages.length };
      `,
    }),
  // Rolls a single MAP variant of a Strike. variantIndex 0/1/2 maps to
  // first attack / second (MAP) / third (MAP2). The PF2e `StrikeData`
  // lives at `actor.system.actions[i]` and each variant exposes its
  // own `roll()` that bakes in the MAP penalty.
  rollStrike: (id: string, strikeSlug: string, variantIndex: number): Promise<{ ok: boolean }> =>
    api.runActorScript<{ ok: boolean }>({
      actorId: id,
      requireType: 'character',
      body: `
        const strike = actor.system.actions.find(s => s.slug === ${JSON.stringify(strikeSlug)});
        if (!strike) throw new Error('Strike not found: ' + ${JSON.stringify(strikeSlug)});
        const variant = strike.variants?.[${variantIndex.toString()}];
        if (!variant) throw new Error('Strike variant ${variantIndex.toString()} not available');
        await variant.roll({});
        return { ok: true };
      `,
    }),
  rollStrikeDamage: (id: string, strikeSlug: string, critical: boolean): Promise<{ ok: boolean }> =>
    api.runActorScript<{ ok: boolean }>({
      actorId: id,
      requireType: 'character',
      body: `
        const strike = actor.system.actions.find(s => s.slug === ${JSON.stringify(strikeSlug)});
        if (!strike) throw new Error('Strike not found: ' + ${JSON.stringify(strikeSlug)});
        if (${critical.toString()}) {
          if (typeof strike.critical !== 'function') throw new Error('Strike has no critical roll');
          await strike.critical({});
        } else {
          if (typeof strike.damage !== 'function') throw new Error('Strike has no damage roll');
          await strike.damage({});
        }
        return { ok: true };
      `,
    }),
  // Posts an item's action card to chat — the same behaviour as the
  // pf2e sheet's "send to chat" button on an action/reaction/free
  // action. Consumable charge consumption is left to whoever clicks
  // the roll buttons inside the posted card.
  useItem: (id: string, itemId: string): Promise<{ ok: boolean }> =>
    api.runActorScript<{ ok: boolean }>({
      actorId: id,
      requireType: 'character',
      body: `
        const item = actor.items.get(${JSON.stringify(itemId)});
        if (!item) throw new Error('Item not found: ' + ${JSON.stringify(itemId)});
        await item.toMessage();
        return { ok: true };
      `,
    }),
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
