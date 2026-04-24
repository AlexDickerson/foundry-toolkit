# player-portal

Player-facing React SPA plus its Fastify server. In prod, one `node server-dist/index.js` process serves the SPA, four namespaces of routes, and the map-tile proxy.

Part of the foundry-toolkit monorepo at `apps/player-portal` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## What's in here

- **Home, Globe, Inventory, Aurus leaderboard** — the original portal surfaces.
- **Character creator + sheet** — ported from the standalone `character-creator` SPA. PF2e visuals (SCSS, fonts, i18n) derived from `foundryvtt/pf2e` (Apache-2.0) are preserved here — see [NOTICE](./NOTICE).

## Tech stack

- React 19 + Vite 7, `react-router-dom` 7
- Fastify 5 + `@fastify/static` + `@fastify/http-proxy` + `@fastify/websocket`
- Tailwind CSS 4 (PostCSS) + Sass (for ported pf2e SCSS)
- TypeScript; `tsx` for dev-watch; `concurrently` for dual-process dev
- maplibre-gl + pmtiles on the client
- Vitest 4 + Testing Library + jsdom
- ESLint 10 (`strictTypeChecked`), Prettier

## Build & run

Two processes in dev, one in prod:

- `npm run dev` — `concurrently` runs Vite on `:5173` + `tsx watch server/index.ts` on `:3000`. Vite proxies `/api/*`, `/map/*`, and the Foundry asset prefixes → `:3000`.
- `npm run dev:mock` — Vite with an in-process mock middleware serving `src/fixtures/*-prepared.json` + placeholder images for the asset prefixes. Lets the SPA boot with neither Foundry nor foundry-mcp running. Live-sync (`/api/live/*`) still falls through and 404s in this mode.
- `npm run dev:client` / `dev:server` — each half independently.
- `npm run build` = `build:client` (tsc --noEmit && vite → `dist/`) + `build:server` (`tsc -p tsconfig.server.json` → `server-dist/`).
- `npm run start` — `node server-dist/index.js`; Fastify serves built `dist/` if present and falls back to `index.html` for SPA deep links.
- `npm run typecheck` — runs both tsconfigs.
- `npm run lint` / `lint:fix` — workspace-scoped ESLint.
- `npm run test` / `test:watch` — Vitest.

Env:

- `PORT` (default `3000`), `HOST` (default `0.0.0.0`).
- `SHARED_SECRET` — **required**; bearer-auth for `/api/live/*` POST endpoints (`Authorization: Bearer <secret>`). Reads/WS streams are unauthed.
- `MCP_URL` (default `http://localhost:8765`) — upstream for the `/api/mcp/*` proxy.
- `FOUNDRY_URL` (default `http://localhost:30000`) — upstream for the Foundry asset prefix proxies.
- `STATIC_DIR` — override the SPA directory (defaults to `<server-dist>/../dist`).

## Project structure

- `src/` — React client.
  - `src/App.tsx` — router: `/`, `/globe`, `/inventory`, `/leaderboard`, `/characters`, `/characters/new`, `/characters/:actorId`.
  - `src/api/` — typed fetch wrappers for `/api/mcp/*`.
  - `src/components/` — Layout + Nav + character-side components (common/, creator/, sheet/, settings/, shop/, tabs/).
  - `src/i18n/` — vendored `en.json` from pf2e (Apache-2.0) + `t()` resolver.
  - `src/lib/` — generic helpers + `live.ts` WS client.
  - `src/prereqs/` — creator prerequisite evaluator.
  - `src/routes/` — route-level components (Home, Globe, Inventory, Leaderboard, Characters, CharacterCreator, CharacterSheet).
  - `src/styles/pf2e/` — ported SCSS from `foundryvtt/pf2e` (Apache-2.0).
  - `src/fixtures/` — `*-prepared.json` sample actors used by mock mode and tests.
- `mock/api-middleware.ts` — Vite mock plugin (dev:mock only).
- `server/index.ts` — Fastify entry + route registration.
- `server/store.ts` — in-memory snapshot stores with subscribe/publish.
- `server/types.ts` — `InventorySnapshot`, `AurusSnapshot`, `GlobeSnapshot`.
- `tsconfig.json` — client (Vite). `tsconfig.server.json` — server (`tsc` → `server-dist/`).
- `NOTICE` — attribution for pf2e-derived files.

## API namespaces

- **`/api/live/<name>`** — three datasets (`inventory`, `aurus`, `globe`). `GET` returns the current snapshot (public). `POST` overwrites it (bearer auth required — used by dm-tool's `sidecar-client.ts`). `GET /api/live/<name>/stream` is a WebSocket that pushes the current snapshot on connect and every update after.
- **`/api/mcp/*`** — transparent proxy to `MCP_URL` (foundry-mcp). Authorization header is passed through unchanged.
- **`/map/*`** — reverse-proxy to `https://map.pathfinderwiki.com/` so PMTiles tile requests are same-origin.
- **`/icons`, `/systems`, `/modules`, `/worlds`** — proxied to `FOUNDRY_URL` so prepared-actor asset paths resolve same-origin. `/assets` is intentionally **not** proxied — Vite's built SPA chunks live there.
- **`/health`** — `{ ok: true }`.

## Key decisions / gotchas

- The character creator was absorbed into this workspace. Its API client base is `/api/mcp`; the Fastify server reverse-proxies that to foundry-mcp.
- The live-sync `/api/*` routes were renamed to `/api/live/*` at the same time — dm-tool's `electron/sidecar-client.ts` and `electron/ipc/{aurus,globe,inventory}.ts` target the new paths.
- State for live-sync is in-memory only; a restart loses the cache, and the DM auto-pushes on every edit so it refills in seconds.
- Auth is a single shared bearer secret for `/api/live/*` writes. Reads + WS streams are intentionally public — players need them and nothing private lives in these feeds (DM notes stay in dm-tool's SQLite / Obsidian vault).
- `/map/*` proxy keeps tile fetches same-origin so the browser's CORS check passes.
- **`@foundry-toolkit/shared` is a devDependency**, not a dependency — the server uses it for types only, and Vite bundles it into the client. Easy to get wrong on a refactor.
- PF2e visuals are ported forward from the upstream pf2e system; frontend-side `t()` resolves i18n keys. Upstream license (Apache-2.0) preserved via `NOTICE`.
- User prefers sans-serif by default; serif is opt-in.
- This workspace is ignored by root ESLint; lint runs via its own workspace script.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only, push frequently, lint + format before committing.
