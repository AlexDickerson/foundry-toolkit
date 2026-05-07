# player-portal

Player-facing React SPA plus its Fastify server. In prod, one `node server-dist/index.js` process serves the SPA, four namespaces of routes, and the map-tile proxy.

Part of the foundry-toolkit monorepo at `apps/player-portal` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## What's in here

- **Home, Globe, Aurus leaderboard** — original portal surfaces.
- **Character creator + sheet** — ported from the standalone `character-creator` SPA. PF2e visuals (SCSS, fonts, i18n) derived from `foundryvtt/pf2e` (Apache-2.0) are preserved here — see [NOTICE](./NOTICE).

## Tech stack

- React 19 + Vite 7, `react-router-dom` 7
- Fastify 5 + `@fastify/static` + `@fastify/http-proxy` + `@fastify/secure-session`
- Tailwind CSS 4 (PostCSS) + Sass (for ported pf2e SCSS)
- TypeScript; `tsx` for dev-watch; `concurrently` for dual-process dev
- maplibre-gl + pmtiles on the client
- Vitest 4 + Testing Library + jsdom (client) / node (server)
- ESLint 10 (`strictTypeChecked`), Prettier

## Build & run

Two processes in dev, one in prod:

- `npm run dev` — `concurrently` runs Vite on `:5173` + `tsx watch server/index.ts` on `:3000`. Vite proxies `/api/*`, `/map/*`, and the Foundry asset prefixes → `:3000`.
- `npm run dev:mock` — Vite with an in-process mock middleware serving `src/fixtures/*-prepared.json` + placeholder images for the asset prefixes. Lets the SPA boot with neither Foundry nor foundry-mcp running. Live-sync (`/api/live/*`) still falls through and 404s in this mode.
- `npm run dev:client` / `dev:server` — each half independently.
- `npm run build` = `build:client` (tsc --noEmit && vite → `dist/`) + `build:server` (`tsc -p tsconfig.server.json` → `server-dist/`).
- `npm run start` — `node server-dist/index.js`; Fastify serves built `dist/` if present and falls back to `index.html` for SPA deep links.
- `npm run typecheck` — runs client, server, and scripts tsconfigs.
- `npm run lint` / `lint:fix` — workspace-scoped ESLint.
- `npm run test` / `test:watch` — Vitest (client tests in jsdom, server tests in node).

Env:

- `PORT` (default `3000`), `HOST` (default `0.0.0.0`).
- `SHARED_SECRET` — bearer-auth for `/api/live/*` POST endpoints (`Authorization: Bearer <secret>`). Used by dm-tool's `sidecar-client.ts` for machine-to-machine writes.
- `SECURE_SESSION_SECRET` — **required**; 64-char hex string (32 bytes) for `@fastify/secure-session`. Generate with `openssl rand -hex 32`. Rotating this value invalidates all active browser sessions.
- `MCP_URL` (default `http://localhost:8765`) — upstream for the `/api/mcp/*` proxy.
- `FOUNDRY_URL` (default `http://localhost:30000`) — upstream for the Foundry asset prefix proxies.
- `STATIC_DIR` — override the SPA directory (defaults to `<server-dist>/../dist`).
- `PORTAL_AUTH_BYPASS=1` — **dev only**; skips cookie-session auth entirely and injects a synthetic `dev` user. The login page is never shown. Never set this in production.

## Project structure

The client is organised feature-first: each feature owns its routes, components, types, and API wrappers; cross-cutting code lives in `shared/`.

```
src/
  main.tsx                    Vite entry
  test-setup.ts, vite-env.d.ts
  fixtures/                   `*-prepared.json` sample actors (mock + tests)

  app/                        App shell — routing, auth guard, layout
    App.tsx, Layout.tsx, Nav.tsx

  shared/                     Cross-cutting (consumed by 2+ features)
    ui/                       Generic UI primitives (PickerDialog, ConfirmDialog,
                              TabStrip, RankChip, ModifierTooltip, SectionHeader,
                              ConnectionIndicator)
    hooks/                    Generic React hooks (useDebounce, useRemoteData,
                              usePortalTheme, useUuidHover)
    lib/                      Generic utils (format, pf2e-maps, tabUtils,
                              prefetchIcons)
    i18n/                     Vendored pf2e en.json + t() resolver
    styles/                   Global CSS + ported pf2e SCSS

  features/                   One folder per feature
    auth/                     Login route + auth API
    home/, globe/, aurus/     Single-route portal surfaces
    characters/               Character namespace
      api.ts                  REST wrappers for /api/mcp/*
      types/                  Prepared character / item / strike / spell types
      lib/                    Character-domain utils (actor-utils, coins,
                              investment, live SSE client)
      ActorList.tsx,
      Characters.tsx,
      CharactersLayout.tsx    Listing route + parent layout

      creator/                Character creator flow (steps, helpers, pickers)
      sheet/                  Character sheet
        CharacterSheet.tsx, SheetHeader.tsx, SettingsDialog.tsx
        chat/                 Foundry chat event feed (always-on rail)
        dialog/               Foundry bridge prompt/dialog handlers
        hooks/                Sheet-only hooks (useLiveChat, useShopMode,
                              useParty, useEventChannel, etc.)
        party/                Party rail + member cards
        shop/                 Buy-gear-from-sheet UI
        tabs/                 Sheet tab content
          character/          Character tab + sub-blocks (Ability, Skills,
                              Stats, Conditions, IWR, QuickActions)
          details/            Background + Proficiencies tabs
          inventory/          Inventory + Crafting + party stash
          Actions.tsx, Spells.tsx, Feats.tsx, Progression.tsx
                              (flat tabs at this level)
      internal/               Code shared between creator AND sheet,
                              not exported elsewhere:
                              CompendiumPicker, prereqs/, hooks/usePaginatedSearch
```

Outside `src/`:

- `mock/api-middleware.ts` — Vite mock plugin (dev:mock only).
- `server/` — Fastify entry, auth (session/middleware/users), routes.
- `scripts/` — CLI user-management scripts (run via tsx).
- `data/users.json` — JSON user database (gitignored; created by `user:add`).
- `tsconfig.json` — client (Vite). `tsconfig.server.json` — server (`tsc` → `server-dist/`). `tsconfig.scripts.json` — scripts typecheck only.
- `NOTICE` — attribution for pf2e-derived files.

### Structure rules

- **Feature-first.** Code lives inside the feature that owns it. Promote to `shared/` only when 2+ features actually consume it. Promote to `characters/internal/` only when both creator and sheet consume it.
- **`@/*` alias.** Imports inside `src/` use `@/...` to point at `src/` regardless of depth. Mirrors the `tsconfig.json` `paths` mapping; `vite.config.ts` and `vitest.config.ts` aliases match.
- **`internal/` discipline.** Nothing outside `features/characters/` should import from `features/characters/internal/`. If a third consumer ever appears, promote the code to `shared/`.
- **No barrel re-exports.** Import each component from its file directly. Barrel `index.ts` files were removed because they obscured movement and complicated tree-shaking.
- **Sheet sub-features (`chat`, `dialog`, `party`, `shop`, `tabs`) are facets of the sheet, not standalone features.** They live under `sheet/`. If chat ever becomes a standalone route, it gets promoted to a feature folder.

## API namespaces

- **`/api/auth/login`** — `POST`; public. Body `{ username, password }`. Sets session cookie on success.
- **`/api/auth/logout`** — `POST`; clears session cookie.
- **`/api/auth/me`** — `GET`; returns `{ user }` (no hash) or 401.
- **`/api/live/<name>`** — three datasets (`inventory`, `aurus`, `globe`). `GET /api/live/<name>/stream` is an SSE stream (session-gated). POSTs use `SHARED_SECRET` bearer auth (dm-tool only).
- **`/api/mcp/*`** — transparent proxy to `MCP_URL` (foundry-mcp). Session-gated.
- **`/map/*`** — reverse-proxy to `https://map.pathfinderwiki.com/`. Session-gated.
- **`/icons`, `/systems`, `/modules`, `/worlds`** — proxied to foundry-mcp. Session-gated.
- **`/health`** — `{ ok: true }`. Always public.

## User management

Users are stored in `data/users.json` (gitignored). Manage them with:

```sh
# Add a user
npm run user:add -w @foundry-toolkit/player-portal -- --username alice --password "s3cr3t" --actor-id "abc123"

# List users (no hashes)
npm run user:list -w @foundry-toolkit/player-portal

# Reset password
npm run user:reset-password -w @foundry-toolkit/player-portal -- --username alice --password "newpass"

# Remove a user
npm run user:remove -w @foundry-toolkit/player-portal -- --username alice
```

- **Usernames are case-sensitive.** `alice` and `Alice` are different users.
- `actorId` is stored for future per-character scoping but not acted on yet.
- The server loads `data/users.json` once at boot into memory. After CLI mutations, restart the server (or send SIGUSR1 if a reload signal is added later).

## Key decisions / gotchas

- **Two layered auth mechanisms**: `SECURE_SESSION_SECRET` cookie-session gates all human-facing routes; `SHARED_SECRET` bearer continues to gate `/api/live/*` POSTs from dm-tool. The bearer routes are machine-to-machine — a logged-in human cannot write live snapshots through the browser (the routes intentionally do not use cookie auth).
- The SPA's `AuthGuard` checks `GET /api/auth/me` on mount. Server-side gating returns 401; the SPA then redirects to `/login?next=<path>`.
- Cookie sessions survive server restarts (payload is in the cookie). Rotating `SECURE_SESSION_SECRET` invalidates all existing sessions.
- The character creator was absorbed into this workspace. Its API client base is `/api/mcp`; the Fastify server reverse-proxies that to foundry-mcp.
- State for live-sync is in-memory only; a restart loses the cache, and the DM auto-pushes on every edit so it refills in seconds.
- `/map/*` proxy keeps tile fetches same-origin so the browser's CORS check passes.
- **`@foundry-toolkit/shared` is a devDependency**, not a dependency — the server uses it for types only, and Vite bundles it into the client. Easy to get wrong on a refactor.
- PF2e visuals are ported forward from the upstream pf2e system; frontend-side `t()` resolves i18n keys. Upstream license (Apache-2.0) preserved via `NOTICE`.
- User prefers sans-serif by default; serif is opt-in.
- This workspace is ignored by root ESLint; lint runs via its own workspace script.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only, push frequently, lint + format before committing.
