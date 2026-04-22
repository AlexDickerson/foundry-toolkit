// OpenAPI 3.0 spec generator for the `/api/*` REST surface.
//
// The actual Zod schemas for request validation live in
// `@foundry-toolkit/shared/rpc` and are imported here via `./schemas.js`.
// This file holds a single declarative table of route metadata and walks
// it to emit an OpenAPI 3.0.3 document.
//
// Drift protection: the route metadata must be kept in sync with the
// handlers in `./routes/*.ts`. The `/api/openapi.json` endpoint's test
// asserts every hard-coded path in the spec matches the shape of the
// routes the app actually registers; adding a handler without an entry
// here will produce a spec the test flags.

import { z, toJSONSchema } from 'zod/v4';
import type { $ZodType } from 'zod/v4/core';
import { ALLOW_EVAL } from '../config.js';
import { ASSET_PREFIXES } from './routes/assets.js';
import {
  actorIdParam,
  actorItemIdParams,
  actorTraceParams,
  addItemFromCompendiumBody,
  bridgeIdParam,
  compendiumSearchQuery,
  createActorBody,
  eventChannelParam,
  evalBody,
  getCompendiumDocumentQuery,
  listCompendiumPacksQuery,
  listCompendiumSourcesQuery,
  resolvePromptBody,
  updateActorBody,
  updateActorItemBody,
} from './schemas.js';

// ─── Response envelope schemas ─────────────────────────────────────────
//
// Written as plain JSON Schema rather than Zod because they describe
// hand-rolled response shapes (not server-side validated inputs). The
// error envelope is emitted by `setErrorHandler` in app.ts; success
// shapes mirror the TypeScript interfaces in
// `@foundry-toolkit/shared/foundry-api` — referenced by name in
// `description` so consumers can cross-check.

type JsonSchema = Record<string, unknown>;

const errorResponseSchema: JsonSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    suggestion: { type: 'string' },
  },
};

// Common 4xx/5xx responses reused across routes.
const ERR_400 = { description: 'Invalid request parameters', schema: errorResponseSchema };
const ERR_404 = { description: 'Not found', schema: errorResponseSchema };
const ERR_503 = { description: 'Foundry module not connected', schema: errorResponseSchema };
const ERR_504 = { description: 'Upstream Foundry timeout', schema: errorResponseSchema };
const ERR_500 = { description: 'Internal server error', schema: errorResponseSchema };

// Success response helpers — describe the TS interface name in the
// `description` and keep the schema permissive. Keeping these loose lets
// the spec land without re-declaring every interface as a Zod schema;
// tightening them is a follow-up.
const jsonObject = (typeName: string): JsonSchema => ({
  type: 'object',
  description: `See TypeScript interface \`${typeName}\` in @foundry-toolkit/shared/foundry-api`,
  additionalProperties: true,
});

const jsonArrayOf = (typeName: string): JsonSchema => ({
  type: 'array',
  items: jsonObject(typeName),
});

// ─── Zod → OpenAPI JSON Schema helper ──────────────────────────────────

function zodToOpenApi(schema: $ZodType): JsonSchema {
  return toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' });
}

// Pull the object fields out of a Zod `z.object({...})` into individual
// OpenAPI parameter entries. Used for path params and query strings.
interface OpenApiParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

function parametersFromZodObject(
  objectSchema: z.ZodObject,
  location: 'path' | 'query',
): OpenApiParameter[] {
  const jsonSchema = zodToOpenApi(objectSchema) as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  const required = new Set(jsonSchema.required ?? []);
  const params: OpenApiParameter[] = [];
  for (const [name, propSchema] of Object.entries(jsonSchema.properties ?? {})) {
    params.push({
      name,
      in: location,
      required: location === 'path' ? true : required.has(name),
      schema: propSchema,
    });
  }
  return params;
}

// ─── Route metadata ────────────────────────────────────────────────────

interface ResponseSpec {
  description: string;
  schema?: JsonSchema;
  contentType?: string;
}

interface RouteDef {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  pathParams?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodObject;
  responses: Record<string, ResponseSpec>;
}

function routes(): RouteDef[] {
  const common4xx5xx = {
    '503': ERR_503,
    '504': ERR_504,
    '500': ERR_500,
  };

  const defs: RouteDef[] = [
    // ── Actors ────────────────────────────────────────────────────────
    {
      method: 'get',
      path: '/api/actors',
      tags: ['Actors'],
      summary: 'List actors',
      description: "Returns every actor in the GM's live Foundry world, minimally shaped.",
      responses: {
        '200': { description: 'Actors returned', schema: jsonArrayOf('ActorSummary') },
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/actors/{id}',
      tags: ['Actors'],
      summary: 'Get actor by id',
      pathParams: actorIdParam,
      responses: {
        '200': { description: 'Actor returned', schema: jsonObject('ActorRef') },
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/actors/{id}/prepared',
      tags: ['Actors'],
      summary: 'Get a prepared (system-derived) actor by id',
      description:
        'Returns the actor after Foundry has applied derived-data preparation (bonuses, feats, class-specific fields, etc.). Heavier than the plain GET /api/actors/{id} response.',
      pathParams: actorIdParam,
      responses: {
        '200': { description: 'Prepared actor returned', schema: jsonObject('PreparedActor') },
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/actors/{id}/trace/{slug}',
      tags: ['Actors'],
      summary: 'Get statistic trace for an actor',
      description: "Returns the PF2e statistic trace (modifier breakdown) for a given slug, e.g. 'perception' or 'athletics'.",
      pathParams: actorTraceParams,
      responses: {
        '200': { description: 'Trace returned', schema: jsonObject('StatisticTrace') },
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/actors/{id}/items',
      tags: ['Actors'],
      summary: 'List items on an actor',
      pathParams: actorIdParam,
      responses: {
        '200': { description: 'Items returned', schema: jsonArrayOf('PreparedActorItem') },
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'post',
      path: '/api/actors',
      tags: ['Actors'],
      summary: 'Create an actor',
      description:
        'Creates a blank or partially-populated actor. The character-creator wizard uses this on entry and patches the actor piecemeal as the user fills in each step.',
      body: createActorBody,
      responses: {
        '200': { description: 'Actor created', schema: jsonObject('ActorRef') },
        '400': ERR_400,
        ...common4xx5xx,
      },
    },
    {
      method: 'patch',
      path: '/api/actors/{id}',
      tags: ['Actors'],
      summary: 'Update an actor (partial merge)',
      pathParams: actorIdParam,
      body: updateActorBody,
      responses: {
        '200': { description: 'Actor updated', schema: jsonObject('ActorRef') },
        '400': ERR_400,
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'post',
      path: '/api/actors/{id}/items/from-compendium',
      tags: ['Actors'],
      summary: 'Add a compendium item to an actor',
      pathParams: actorIdParam,
      body: addItemFromCompendiumBody,
      responses: {
        '200': { description: 'Item added', schema: jsonObject('ActorItemRef') },
        '400': ERR_400,
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'delete',
      path: '/api/actors/{id}/items/{itemId}',
      tags: ['Actors'],
      summary: 'Remove an item from an actor',
      pathParams: actorItemIdParams,
      responses: {
        '200': { description: 'Item removed', schema: { type: 'object' } as JsonSchema },
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'patch',
      path: '/api/actors/{id}/items/{itemId}',
      tags: ['Actors'],
      summary: 'Update an embedded item on an actor (partial merge)',
      pathParams: actorItemIdParams,
      body: updateActorItemBody,
      responses: {
        '200': { description: 'Item updated', schema: jsonObject('ActorItemRef') },
        '400': ERR_400,
        '404': ERR_404,
        ...common4xx5xx,
      },
    },

    // ── Compendium ────────────────────────────────────────────────────
    {
      method: 'get',
      path: '/api/compendium/search',
      tags: ['Compendium'],
      summary: 'Search compendium documents',
      description:
        "Serves from the in-memory cache when every requested pack is warm; otherwise falls through to Foundry. Returns an empty array when no filter fields are provided, as a guardrail against returning the entire compendium.",
      query: compendiumSearchQuery,
      responses: {
        '200': { description: 'Matches returned', schema: jsonArrayOf('CompendiumMatch') },
        '400': ERR_400,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/compendium/packs',
      tags: ['Compendium'],
      summary: 'List compendium packs',
      query: listCompendiumPacksQuery,
      responses: {
        '200': { description: 'Packs returned', schema: jsonArrayOf('CompendiumPack') },
        '400': ERR_400,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/compendium/document',
      tags: ['Compendium'],
      summary: 'Get a single compendium document by uuid',
      query: getCompendiumDocumentQuery,
      responses: {
        '200': {
          description: 'Document returned',
          schema: {
            type: 'object',
            required: ['document'],
            properties: { document: jsonObject('CompendiumDocument') },
          },
        },
        '400': ERR_400,
        '404': ERR_404,
        ...common4xx5xx,
      },
    },
    {
      method: 'get',
      path: '/api/compendium/sources',
      tags: ['Compendium'],
      summary: 'List compendium source books with counts',
      query: listCompendiumSourcesQuery,
      responses: {
        '200': { description: 'Sources returned', schema: jsonArrayOf('CompendiumSource') },
        '400': ERR_400,
        ...common4xx5xx,
      },
    },

    // ── Events (SSE) ──────────────────────────────────────────────────
    {
      method: 'get',
      path: '/api/events/{channel}/stream',
      tags: ['Events'],
      summary: 'Subscribe to a live event channel (SSE)',
      description:
        "Server-Sent Events stream. Each `data:` line is a JSON payload specific to the channel (e.g. a chat message, a combat update). The server opens the Foundry-side hook listener on the first subscriber and closes it when the last disconnects. 20s heartbeats keep proxies from dropping idle streams.",
      pathParams: eventChannelParam,
      responses: {
        '200': { description: 'Stream opened', contentType: 'text/event-stream' },
        '400': ERR_400,
      },
    },

    // ── Prompts (SSE + resolve) ───────────────────────────────────────
    {
      method: 'get',
      path: '/api/prompts/stream',
      tags: ['Prompts'],
      summary: 'Subscribe to pending module-initiated prompts (SSE)',
      description:
        "Streams `{kind: 'added'|'removed', event: {bridgeId, type, payload}}` objects. On connect, the current queue is flushed as `added` events so late subscribers see in-flight prompts.",
      responses: {
        '200': { description: 'Stream opened', contentType: 'text/event-stream' },
      },
    },
    {
      method: 'post',
      path: '/api/prompts/{id}/resolve',
      tags: ['Prompts'],
      summary: 'Resolve a pending prompt',
      description: "Sends the caller's chosen value back through the bridge to the Foundry module's ChoiceSet dialog.",
      pathParams: bridgeIdParam,
      body: resolvePromptBody,
      responses: {
        '200': {
          description: 'Prompt resolved',
          schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
        },
        '400': ERR_400,
        '404': { description: 'Prompt not found or already resolved', schema: errorResponseSchema },
      },
    },

    // ── Debug ─────────────────────────────────────────────────────────
    {
      method: 'get',
      path: '/api/_debug/asset-cache',
      tags: ['Debug'],
      summary: 'Asset cache counters',
      description: 'Intentionally open — no secrets, just cache size/hit-rate numbers for ops visibility.',
      responses: {
        '200': {
          description: 'Counters',
          schema: {
            type: 'object',
            properties: {
              entries: { type: 'integer' },
              bytes: { type: 'integer' },
              capBytes: { type: 'integer' },
              hits: { type: 'integer' },
              misses: { type: 'integer' },
              hitRate: { type: 'number' },
              evictions: { type: 'integer' },
            },
          },
        },
      },
    },

    // ── Health ────────────────────────────────────────────────────────
    {
      method: 'get',
      path: '/healthz',
      tags: ['Health'],
      summary: 'Liveness probe',
      description: "Returns the literal string 'ok' (text/plain). Used by container orchestrators.",
      responses: {
        '200': { description: 'Service is alive', contentType: 'text/plain' },
      },
    },

    // ── Asset proxy ───────────────────────────────────────────────────
    //
    // One entry per allowed prefix. The handler is shared; path shape is
    // a wildcard the OpenAPI path template can't express precisely, so
    // each is documented as `/{prefix}/{path}` where `{path}` is a catch-
    // all `string`.
    ...ASSET_PREFIXES.map<RouteDef>((prefix) => ({
      method: 'get',
      path: `${prefix}/{path}`,
      tags: ['Assets'],
      summary: `Proxy a Foundry asset under ${prefix}/`,
      description:
        "Fetches the asset through the WebSocket bridge and caches the bytes. Responses are raw binary with the upstream content-type. 404s are negative-cached briefly; 5xx are not cached.",
      pathParams: z.object({ path: z.string().min(1).describe('Remainder of the asset path') }),
      responses: {
        '200': { description: 'Asset bytes', contentType: '*/*' },
        '404': { description: 'Asset not found', contentType: 'text/plain' },
        '502': { description: 'Bad response from bridge', contentType: 'text/plain' },
        '503': { description: 'Foundry module not connected', contentType: 'text/plain' },
        '504': { description: 'Upstream timeout', contentType: 'text/plain' },
      },
    })),
  ];

  // Eval is registered only when ALLOW_EVAL=1. Include in the spec only
  // when actually exposed so the doc matches the live server.
  if (ALLOW_EVAL) {
    defs.push({
      method: 'post',
      path: '/api/eval',
      tags: ['Dev'],
      summary: 'Execute arbitrary JS in the Foundry page (dev only)',
      description: 'Gated by the `ALLOW_EVAL` env flag. Not registered when the flag is off.',
      body: evalBody,
      responses: {
        '200': { description: 'Script return value', schema: { type: 'object' } as JsonSchema },
        '400': ERR_400,
        ...common4xx5xx,
      },
    });
  }

  return defs;
}

// ─── Spec assembly ─────────────────────────────────────────────────────

export interface OpenApiOptions {
  serverUrl?: string;
  version?: string;
}

export function buildOpenApiSpec(opts: OpenApiOptions = {}): Record<string, unknown> {
  const { serverUrl = 'http://localhost:8765', version = '1.0.0' } = opts;

  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes()) {
    const pathParams: OpenApiParameter[] = route.pathParams
      ? parametersFromZodObject(route.pathParams, 'path')
      : [];
    const queryParams: OpenApiParameter[] = route.query
      ? parametersFromZodObject(route.query, 'query')
      : [];

    const operation: Record<string, unknown> = {
      tags: route.tags,
      summary: route.summary,
      operationId: operationIdFor(route.method, route.path),
      parameters: [...pathParams, ...queryParams],
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([code, res]) => [
          code,
          {
            description: res.description,
            ...(res.schema || res.contentType
              ? {
                  content: {
                    [res.contentType ?? 'application/json']: res.schema ? { schema: res.schema } : {},
                  },
                }
              : {}),
          },
        ]),
      ),
    };

    if (route.description) operation['description'] = route.description;

    if (route.body) {
      operation['requestBody'] = {
        required: true,
        content: {
          'application/json': { schema: zodToOpenApi(route.body) },
        },
      };
    }

    if (!paths[route.path]) paths[route.path] = {};
    paths[route.path]![route.method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'foundry-mcp REST API',
      version,
      description:
        "REST surface of the foundry-mcp server. Bridges MCP clients and the character-creator SPA to a live Foundry VTT instance over the WebSocket module. All responses are JSON unless the route's response description says otherwise (SSE streams and asset proxies return raw bytes).",
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Actors', description: 'Actor CRUD backing the character-creator wizard.' },
      { name: 'Compendium', description: 'Searchable compendium data (cached when warm).' },
      { name: 'Events', description: 'SSE streams for live Foundry events.' },
      { name: 'Prompts', description: 'Module-initiated prompts (e.g. ChoiceSet dialogs).' },
      { name: 'Assets', description: 'Foundry asset proxy — icons, system files, modules.' },
      { name: 'Debug', description: 'Ops visibility — cache counters, health.' },
      { name: 'Health', description: 'Container health probes.' },
      { name: 'Dev', description: 'Dev-only endpoints gated by env flags.' },
    ],
    paths,
  };
}

function operationIdFor(method: string, path: string): string {
  const cleaned = path
    .replace(/^\//, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${method}_${cleaned}`;
}
