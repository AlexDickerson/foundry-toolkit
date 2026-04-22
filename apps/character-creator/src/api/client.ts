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
  createActor: (body: {
    name: string;
    type: string;
    folder?: string;
    img?: string;
    system?: Record<string, unknown>;
  }): Promise<ActorRef> => request<ActorRef>('/actors', { method: 'POST', body }),
  updateActor: (
    id: string,
    patch: { name?: string; img?: string; folder?: string; system?: Record<string, unknown> },
  ): Promise<ActorRef> => request<ActorRef>(`/actors/${id}`, { method: 'PATCH', body: patch }),
  addItemFromCompendium: (
    id: string,
    body: {
      packId: string;
      itemId: string;
      name?: string;
      quantity?: number;
      systemOverrides?: Record<string, unknown>;
    },
  ): Promise<ActorItemRef> => request<ActorItemRef>(`/actors/${id}/items/from-compendium`, { method: 'POST', body }),
  deleteActorItem: (id: string, itemId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/actors/${id}/items/${itemId}`, { method: 'DELETE' }),
  updateActorItem: (
    id: string,
    itemId: string,
    patch: { name?: string; img?: string; system?: Record<string, unknown> },
  ): Promise<ActorItemRef> => request<ActorItemRef>(`/actors/${id}/items/${itemId}`, { method: 'PATCH', body: patch }),
  resolvePrompt: (bridgeId: string, value: unknown): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/prompts/${bridgeId}/resolve`, { method: 'POST', body: { value } }),
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
