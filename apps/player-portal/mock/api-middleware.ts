// Dev-only Vite middleware that stands in for the MCP proxy + Foundry asset
// proxy. Enabled via `vite --mode mock` (npm run dev:mock). Lets the SPA
// boot and render without Foundry or foundry-mcp running.
//
// Supported routes:
//   GET  /api/mcp/actors                 → summary list built from every
//                                          *-prepared.json in src/fixtures
//   GET  /api/mcp/actors/:id/prepared    → the matching fixture (plus any
//                                          in-memory flag overrides) or 404
//   PATCH /api/mcp/actors/:id            → merges the body's `flags` into
//                                          the in-memory flag store and
//                                          returns an ActorRef-shaped ack
//   POST /api/mcp/actors/:id/actions/:action
//                                        → no-op stub that acks `{ok: true}`;
//                                          lets the SPA exercise action
//                                          buttons without a live bridge
//   GET  /api/mcp/compendium/document    → synthetic document built from
//                                          the requested UUID's tail
//                                          segment, so formula / feat /
//                                          item detail panes render
//                                          populated state
//   POST /api/mcp/uploads                → decodes the base64 body into an
//                                          in-memory buffer keyed by its
//                                          relative path; later asset-
//                                          prefix GETs return it
//   GET  /icons | /systems | /modules | /worlds + image ext
//                                        → uploaded buffer for an exact
//                                          path match, else a grey SVG
//                                          placeholder
//
// Anything else on /api/* (including /api/live/*) falls through. Not used
// in production — this middleware is only registered when the Vite mode
// is "mock".

import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

interface FixtureActor {
  id: string;
  name: string;
  type: string;
  img: string;
  flags?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

interface ActorSummary {
  id: string;
  name: string;
  type: string;
  img: string;
}

// `/assets/` is intentionally excluded — Vite's built SPA chunks live
// there and intercepting them would break the client.
const ASSET_PREFIXES = ['/icons/', '/systems/', '/modules/', '/worlds/'];
const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif'];

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" fill="#e5e5e5"/>' +
  '<text x="32" y="37" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="10">img</text>' +
  '</svg>';

export function mockApi(fixturesDir: string): Plugin {
  return {
    name: 'mock-api',
    configureServer(server: ViteDevServer): void {
      const fixtures = loadFixtures(fixturesDir);
      server.config.logger.info(
        `  \x1b[36m➜\x1b[0m  mock API: ${fixtures.length.toString()} actor fixture(s) from ${path.relative(server.config.root, fixturesDir)}`,
      );

      // Per-process stores. Reset when the Vite dev server restarts —
      // good enough for iteration; the real backend is the authority.
      const flagOverrides = new Map<string, Record<string, Record<string, unknown>>>();
      const uploads = new Map<string, { contentType: string; body: Buffer }>();

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';

        if (method === 'GET' && (url === '/api/mcp/actors' || url.startsWith('/api/mcp/actors?'))) {
          const list: ActorSummary[] = fixtures.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            img: f.img,
          }));
          sendJson(res, 200, list); return;
        }

        const preparedMatch = /^\/api\/mcp\/actors\/([^/?]+)\/prepared(?:\?.*)?$/.exec(url);
        if (method === 'GET' && preparedMatch) {
          const id = preparedMatch[1] ?? '';
          const actor = fixtures.find((f) => f.id === id);
          if (!actor) {
            sendJson(res, 404, {
              error: `Actor ${id} not found in fixtures`,
              suggestion: 'Drop a new <id>-prepared.json into frontend/src/fixtures/',
            }); return;
          }
          const override = flagOverrides.get(id);
          const merged = override
            ? { ...actor, flags: { ...(actor.flags ?? {}), ...override } }
            : actor;
          sendJson(res, 200, merged); return;
        }

        const actorPatchMatch = /^\/api\/mcp\/actors\/([^/?]+)(?:\?.*)?$/.exec(url);
        if (method === 'PATCH' && actorPatchMatch) {
          const id = actorPatchMatch[1] ?? '';
          const actor = fixtures.find((f) => f.id === id);
          if (!actor) {
            sendJson(res, 404, { error: `Actor ${id} not found in fixtures` });
            return;
          }
          readJsonBody(req)
            .then((body) => {
              const flags = (body as { flags?: Record<string, Record<string, unknown>> }).flags;
              if (flags) {
                const current = flagOverrides.get(id) ?? { ...(actor.flags ?? {}) };
                for (const [scope, entries] of Object.entries(flags)) {
                  current[scope] = { ...(current[scope] ?? {}), ...entries };
                }
                flagOverrides.set(id, current);
              }
              sendJson(res, 200, {
                id: actor.id,
                uuid: `Actor.${actor.id}`,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                folder: null,
              });
            })
            .catch((err: unknown) => {
              sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid body' });
            });
          return;
        }

        // Synthetic compendium document resolver. Derives a human name
        // from the UUID's tail ("Compendium.pf2e.equipment-srd.Item.bomb-lesser"
        // → "Bomb Lesser"), so formula / feat / item detail panes have
        // *something* to show in mock mode. The real resolver runs on
        // the live bridge in non-mock dev and in production.
        const compendiumDocMatch = /^\/api\/mcp\/compendium\/document(?:\?.*)?$/.exec(url);
        if (method === 'GET' && compendiumDocMatch) {
          const uuid = new URLSearchParams(url.split('?')[1] ?? '').get('uuid') ?? '';
          if (uuid.length === 0) {
            sendJson(res, 400, { error: 'uuid query parameter is required' });
            return;
          }
          const tail = uuid.split('.').pop() ?? uuid;
          const name = tail
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          sendJson(res, 200, {
            document: {
              id: tail,
              uuid,
              name,
              type: 'consumable',
              img: `icons/mock/${tail}.svg`,
              system: {
                level: { value: 1 },
                traits: { value: ['mock', 'alchemical'], rarity: 'common' },
                price: { value: { gp: 3 } },
                description: { value: `<p>Mock description for <strong>${name}</strong>.</p>` },
              },
            },
          });
          return;
        }

        // Synthetic compendium search so the formula picker (and any
        // future pickers) can render results in mock mode. Matches are
        // derived from the query string — we fabricate a few plausible
        // consumable entries with sequential uuids.
        const compendiumSearchMatch = /^\/api\/mcp\/compendium\/search(?:\?.*)?$/.exec(url);
        if (method === 'GET' && compendiumSearchMatch) {
          const params = new URLSearchParams(url.split('?')[1] ?? '');
          const q = (params.get('q') ?? '').trim();
          if (q.length === 0) {
            sendJson(res, 200, { matches: [] });
            return;
          }
          const slug = q.toLowerCase().replace(/\s+/g, '-');
          const matches = Array.from({ length: 3 }, (_, i) => {
            const suffix = i === 0 ? slug : `${slug}-${String(i + 1)}`;
            const uuid = `Compendium.pf2e.equipment-srd.Item.${suffix}`;
            const name = suffix
              .split('-')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            return {
              packId: 'pf2e.equipment-srd',
              packLabel: 'Equipment',
              documentId: suffix,
              uuid,
              name,
              type: 'consumable',
              img: `icons/mock/${suffix}.svg`,
              level: i + 1,
            };
          });
          sendJson(res, 200, { matches });
          return;
        }

        // Generic outbound-action passthrough. The live bridge dispatches
        // per action; the mock just acks so the SPA's optimistic path
        // works without a backend.
        const actionMatch = /^\/api\/mcp\/actors\/([^/?]+)\/actions\/([^/?]+)(?:\?.*)?$/.exec(url);
        if (method === 'POST' && actionMatch) {
          readJsonBody(req)
            .then(() => {
              sendJson(res, 200, { ok: true });
            })
            .catch((err: unknown) => {
              sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid body' });
            });
          return;
        }

        if (method === 'POST' && url === '/api/mcp/uploads') {
          readJsonBody(req)
            .then((body) => {
              const parsed = body as { path?: string; dataBase64?: string };
              if (typeof parsed.path !== 'string' || typeof parsed.dataBase64 !== 'string') {
                sendJson(res, 400, { error: 'path and dataBase64 are required' });
                return;
              }
              const buf = Buffer.from(parsed.dataBase64, 'base64');
              const normalized = parsed.path.replace(/^\/+/, '');
              const contentType = guessContentType(normalized);
              uploads.set(`/${normalized}`, { contentType, body: buf });
              sendJson(res, 200, { path: normalized, bytes: buf.length });
            })
            .catch((err: unknown) => {
              sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid body' });
            });
          return;
        }

        if (method === 'GET' && isAssetRequest(url)) {
          const pathOnly = (url.split('?')[0] ?? url);
          const stored = uploads.get(pathOnly);
          if (stored) {
            res.statusCode = 200;
            res.setHeader('content-type', stored.contentType);
            res.setHeader('content-length', stored.body.length.toString());
            res.setHeader('cache-control', 'no-store');
            res.end(stored.body);
            return;
          }
          res.statusCode = 200;
          res.setHeader('content-type', 'image/svg+xml');
          res.setHeader('cache-control', 'public, max-age=60');
          res.end(PLACEHOLDER_SVG);
          return;
        }

        next();
      });
    },
  };
}

function loadFixtures(dir: string): FixtureActor[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('-prepared.json'));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    return JSON.parse(raw) as FixtureActor;
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function isAssetRequest(url: string): boolean {
  const prefixed = ASSET_PREFIXES.some((p) => url.startsWith(p));
  if (!prefixed) return false;
  const pathOnly = url.split('?')[0] ?? url;
  return IMAGE_EXTENSIONS.some((ext) => pathOnly.toLowerCase().endsWith(ext));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (raw.length === 0) return {};
  return JSON.parse(raw);
}

function guessContentType(p: string): string {
  const ext = p.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
