# player-portal

Player-facing React SPA plus its Fastify live-sync server. In prod, one `node server-dist/index.js` process serves the SPA, the `/api/*` live-sync routes (absorbed from the old standalone sidecar), and a `/map/*` reverse-proxy to `map.pathfinderwiki.com`.

Part of the foundry-toolkit monorepo at `apps/player-portal` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## Tech stack

- React 19 + Vite, `react-router-dom` 7
- Fastify 5 + `@fastify/static` + `@fastify/http-proxy` + `@fastify/websocket`
- TypeScript; `tsx` for dev-watch; `concurrently` for dual-process dev
- maplibre-gl + pmtiles on the client

## Build & run

Two processes in dev, one in prod:

- `npm run dev` — `concurrently` runs Vite on `:5173` + `tsx watch server/index.ts` on `:3000`; Vite proxies `/api` and `/map` → `:3000`.
- `npm run dev:client` / `dev:server` — each half independently.
- `npm run build` = `build:client` (Vite → `dist/`) + `build:server` (`tsc -p tsconfig.server.json` → `server-dist/`).
- `npm run start` — `node server-dist/index.js`; Fastify serves built `dist/` if present and falls back to `index.html` for SPA deep links.
- `npm run typecheck` — runs both tsconfigs.
- `npm run preview` — Vite preview of the built SPA only (no server).

Env:

- `PORT` (default `3000`), `HOST` (default `0.0.0.0`).
- `SHARED_SECRET` — **required**; bearer-auth for `/api/*` POST endpoints (`Authorization: Bearer <secret>`). Reads/WS streams are unauthed.
- `STATIC_DIR` — override the SPA directory (defaults to `<server-dist>/../dist`).

## Project structure

- `src/` — React client (routes under `react-router-dom`).
- `server/index.ts` — Fastify entry + route registration.
- `server/store.ts` — in-memory snapshot stores with subscribe/publish.
- `server/types.ts` — `InventorySnapshot`, `AurusSnapshot`, `GlobeSnapshot`.
- `tsconfig.json` — client (Vite). `tsconfig.server.json` — server (`tsc` → `server-dist/`).

## Live-sync API shape

Three datasets (`inventory`, `aurus`, `globe`), each with:

- `GET /api/<name>` — current snapshot, unauthed.
- `POST /api/<name>` — overwrite snapshot; bearer-auth required.
- `GET /api/<name>/stream` (WebSocket) — snapshot on connect + pushed updates, unauthed.

Also: `GET /health`, and a reverse-proxy at `/map/*` → `https://map.pathfinderwiki.com/` (replaces the old nginx block so PMTiles fetches are same-origin).

## Key decisions / gotchas

- `/api/*` routes are ex-sidecar — they were absorbed into the player-portal process. dm-tool's `electron/sidecar-client.ts` is the write-side consumer.
- State is in-memory only; a restart loses the cache, and the DM auto-pushes on every edit so it refills in seconds.
- Auth is a single shared bearer secret for writes. Reads + WS streams are intentionally public — players need them and nothing private lives in these feeds (DM notes stay in dm-tool's SQLite / Obsidian vault).
- `/map/*` proxy keeps tile fetches same-origin so the browser's CORS check passes.
- **`@foundry-toolkit/shared` is a devDependency**, not a dependency — the server uses it for types only, and Vite bundles it into the client. Easy to get wrong on a refactor.
- This workspace is ignored by root ESLint; lint runs via its own workspace script.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only, push frequently, lint + format before committing.
