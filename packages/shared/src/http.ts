// Shared HTTP primitives for the foundry-mcp REST surface (`/api/*`).
//
// Both consumers — `apps/dm-tool/electron/compendium/client.ts` (Electron
// main process, talks directly to a configurable foundry-mcp base URL)
// and `apps/player-portal/src/api/client.ts` (browser, talks via the
// `/api/mcp/*` reverse proxy) — used to ship near-identical copies of:
//
//   - an `ApiRequestError` class that carries `{status, error, suggestion}`
//   - a `requestJson<T>` fetch helper that unwraps the JSON envelope
//   - a `buildCompendiumQuery` URL-search-params builder
//
// They live here so the wire contract has one source of truth. Consumers
// re-export under their existing local names (e.g. dm-tool keeps the
// `CompendiumRequestError` alias) so callsites don't have to churn.

import type { ApiError, CompendiumSearchOptions } from './foundry-api.js';

/** Error thrown by `requestJson` on non-ok responses. Carries the parsed
 *  `error` message plus the optional `suggestion` the foundry-mcp REST
 *  surface returns on 4xx/5xx envelopes. */
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

/** Fetch + JSON unwrap with error-envelope handling. Throws
 *  `ApiRequestError` on non-ok responses; threads through the parsed
 *  `{error, suggestion}` payload when present, and falls back to a
 *  status-only message when the response body isn't JSON.
 *
 *  Caller passes the full URL — base-URL handling stays in the
 *  consumer. Sets `Accept: application/json` always; sets
 *  `Content-Type: application/json` automatically when a body is
 *  present and the caller hasn't already specified one. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
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

/** Build the query-string portion of a `/api/compendium/search` URL
 *  (and friends — the same opts shape drives `/sources` too). Both
 *  dm-tool and player-portal hit the same endpoint, so the param
 *  construction stays here. */
export function buildCompendiumQuery(opts: CompendiumSearchOptions): string {
  const params = new URLSearchParams();
  if (opts.q !== undefined && opts.q.length > 0) params.set('q', opts.q);
  if (opts.packIds !== undefined && opts.packIds.length > 0) params.set('packId', opts.packIds.join(','));
  if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
  if (opts.traits !== undefined && opts.traits.length > 0) params.set('traits', opts.traits.join(','));
  if (opts.anyTraits !== undefined && opts.anyTraits.length > 0) params.set('anyTraits', opts.anyTraits.join(','));
  if (opts.sources !== undefined && opts.sources.length > 0) params.set('sources', opts.sources.join(','));
  if (opts.ancestrySlug !== undefined && opts.ancestrySlug.length > 0) params.set('ancestrySlug', opts.ancestrySlug);
  if (opts.minLevel !== undefined) params.set('minLevel', opts.minLevel.toString());
  if (opts.maxLevel !== undefined) params.set('maxLevel', opts.maxLevel.toString());
  if (opts.rarities !== undefined && opts.rarities.length > 0) params.set('rarities', opts.rarities.join(','));
  if (opts.sizes !== undefined && opts.sizes.length > 0) params.set('sizes', opts.sizes.join(','));
  if (opts.creatureTypes !== undefined && opts.creatureTypes.length > 0)
    params.set('creatureTypes', opts.creatureTypes.join(','));
  if (opts.usageCategories !== undefined && opts.usageCategories.length > 0)
    params.set('usageCategories', opts.usageCategories.join(','));
  if (opts.isMagical !== undefined) params.set('isMagical', opts.isMagical.toString());
  if (opts.hpMin !== undefined) params.set('hpMin', opts.hpMin.toString());
  if (opts.hpMax !== undefined) params.set('hpMax', opts.hpMax.toString());
  if (opts.acMin !== undefined) params.set('acMin', opts.acMin.toString());
  if (opts.acMax !== undefined) params.set('acMax', opts.acMax.toString());
  if (opts.fortMin !== undefined) params.set('fortMin', opts.fortMin.toString());
  if (opts.fortMax !== undefined) params.set('fortMax', opts.fortMax.toString());
  if (opts.refMin !== undefined) params.set('refMin', opts.refMin.toString());
  if (opts.refMax !== undefined) params.set('refMax', opts.refMax.toString());
  if (opts.willMin !== undefined) params.set('willMin', opts.willMin.toString());
  if (opts.willMax !== undefined) params.set('willMax', opts.willMax.toString());
  if (opts.limit !== undefined) params.set('limit', opts.limit.toString());
  if (opts.offset !== undefined) params.set('offset', opts.offset.toString());
  return params.toString();
}
