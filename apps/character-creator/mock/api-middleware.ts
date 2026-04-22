// Dev-only Vite middleware that stands in for the Foundry bridge + asset
// proxy. Enabled via `vite --mode mock` (npm run dev:mock). Lets the SPA
// boot and render without Foundry or the MCP bridge running.
//
// Scope is deliberately thin:
//   - GET /api/actors                     → summary list built from every
//                                           *-prepared.json in src/fixtures
//   - GET /api/actors/:id/prepared        → the matching fixture, or 404
//   - GET /icons | /systems | /modules | /worlds | /assets + image ext
//                                         → a grey SVG placeholder so the
//                                           console doesn't fill with 404s
//
// Anything else on /api/* falls through; we'll add routes as the UI needs
// them. Not used in production — this middleware is only registered when
// the Vite mode is "mock".

import type { Plugin, ViteDevServer } from 'vite';
import type { ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

interface FixtureActor {
  id: string;
  name: string;
  type: string;
  img: string;
  [key: string]: unknown;
}

interface ActorSummary {
  id: string;
  name: string;
  type: string;
  img: string;
}

const ASSET_PREFIXES = ['/icons/', '/systems/', '/modules/', '/worlds/', '/assets/'];
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

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (req.method !== 'GET') { next(); return; }

        if (url === '/api/actors' || url.startsWith('/api/actors?')) {
          const list: ActorSummary[] = fixtures.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            img: f.img,
          }));
          sendJson(res, 200, list); return;
        }

        const preparedMatch = /^\/api\/actors\/([^/?]+)\/prepared(?:\?.*)?$/.exec(url);
        if (preparedMatch) {
          const id = preparedMatch[1] ?? '';
          const actor = fixtures.find((f) => f.id === id);
          if (!actor) {
            sendJson(res, 404, {
              error: `Actor ${id} not found in fixtures`,
              suggestion: 'Drop a new <id>-prepared.json into frontend/src/fixtures/',
            }); return;
          }
          sendJson(res, 200, actor); return;
        }

        if (isAssetRequest(url)) {
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
