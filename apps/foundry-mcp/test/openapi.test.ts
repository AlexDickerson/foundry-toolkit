import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildOpenApiSpec } from '../src/http/openapi.js';
import { registerOpenApiRoutes } from '../src/http/routes/openapi.js';

interface Spec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  tags: { name: string; description?: string }[];
  paths: Record<string, Record<string, Operation>>;
}

interface Operation {
  tags?: string[];
  summary?: string;
  operationId?: string;
  parameters?: { name: string; in: 'path' | 'query'; required?: boolean }[];
  requestBody?: { content: Record<string, unknown> };
  responses: Record<string, { description: string; content?: Record<string, unknown> }>;
}

describe('OpenAPI spec', () => {
  const spec = buildOpenApiSpec() as unknown as Spec;

  it('declares OpenAPI 3.0.3 with non-empty info and servers', () => {
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.info.title.length > 0);
    assert.ok(spec.info.version.length > 0);
    assert.ok(spec.servers.length >= 1);
  });

  it('includes expected top-level tags', () => {
    const names = spec.tags.map((t) => t.name);
    for (const t of ['Actors', 'Compendium', 'Events', 'Prompts', 'Assets', 'Health']) {
      assert.ok(names.includes(t), `missing tag ${t}`);
    }
  });

  it('has paths for every major surface', () => {
    const paths = Object.keys(spec.paths);
    for (const p of [
      '/api/actors',
      '/api/actors/{id}',
      '/api/actors/{id}/prepared',
      '/api/actors/{id}/trace/{slug}',
      '/api/actors/{id}/items',
      '/api/actors/{id}/items/{itemId}',
      '/api/actors/{id}/items/from-compendium',
      '/api/compendium/search',
      '/api/compendium/packs',
      '/api/compendium/document',
      '/api/compendium/sources',
      '/api/events/{channel}/stream',
      '/api/prompts/stream',
      '/api/prompts/{id}/resolve',
      '/api/_debug/asset-cache',
      '/healthz',
      '/icons/{path}',
      '/systems/{path}',
      '/modules/{path}',
      '/worlds/{path}',
      '/ui/{path}',
    ]) {
      assert.ok(paths.includes(p), `missing path ${p}`);
    }
  });

  it('every operation has tags, summary, operationId, and a 2xx or SSE response', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const loc = `${method.toUpperCase()} ${path}`;
        assert.ok(op.tags && op.tags.length > 0, `${loc}: missing tags`);
        assert.ok(op.summary, `${loc}: missing summary`);
        assert.ok(op.operationId, `${loc}: missing operationId`);
        const codes = Object.keys(op.responses);
        assert.ok(
          codes.some((c) => c.startsWith('2')),
          `${loc}: no 2xx response declared`,
        );
        for (const [code, res] of Object.entries(op.responses)) {
          assert.ok(res.description, `${loc} ${code}: response missing description`);
        }
      }
    }
  });

  it('path parameters are declared for every {placeholder} in the path', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      if (placeholders.length === 0) continue;
      for (const [method, op] of Object.entries(methods)) {
        const declared = new Set((op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name));
        for (const p of placeholders) {
          assert.ok(declared.has(p!), `${method.toUpperCase()} ${path}: path param {${p}} not declared`);
        }
      }
    }
  });

  it('POST/PATCH operations that accept a body declare application/json requestBody', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (method !== 'post' && method !== 'patch') continue;
        // Heuristic: these are the bodies we know we declared.
        const wantsBody =
          path === '/api/actors' ||
          path === '/api/actors/{id}' ||
          path === '/api/actors/{id}/items/from-compendium' ||
          path === '/api/actors/{id}/items/{itemId}' ||
          path === '/api/prompts/{id}/resolve';
        if (!wantsBody) continue;
        assert.ok(op.requestBody, `${method.toUpperCase()} ${path}: missing requestBody`);
        assert.ok(
          op.requestBody!.content['application/json'],
          `${method.toUpperCase()} ${path}: requestBody must declare application/json`,
        );
      }
    }
  });
});

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  registerOpenApiRoutes(app);
  return app;
}

describe('OpenAPI routes', () => {
  it('GET /api/openapi.json returns JSON with openapi=3.0.3', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /application\/json/);
    const body = JSON.parse(res.body) as Spec;
    assert.equal(body.openapi, '3.0.3');
  });

  it('GET /api/openapi.json rewrites the `servers` URL from the request host', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/openapi.json',
      headers: { host: 'mcp.example.com', 'x-forwarded-proto': 'https' },
    });
    const body = JSON.parse(res.body) as Spec;
    assert.equal(body.servers[0]!.url, 'https://mcp.example.com');
  });

  it('GET /api/docs serves HTML that references /api/openapi.json', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/docs' });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /text\/html/);
    assert.match(res.body, /\/api\/openapi\.json/);
    assert.match(res.body, /swagger-ui/i);
  });
});
