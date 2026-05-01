# @foundry-toolkit/shared

Types and shared UI components used across dm-tool and player-portal.

Part of the foundry-toolkit monorepo at `packages/shared` — see the root [CLAUDE.md](../../CLAUDE.md).

## Tech stack

- TypeScript (raw — consumers transpile)
- `peerDependencies`: `react >=19`, `maplibre-gl >=5` — consumers provide them.
- `@iconify-json/game-icons` for glyph sets.

## Build & run

- `npm run typecheck`
- `npm run test` — vitest

## Project structure

`src/types.ts` is a **thin re-export barrel** — do not add new types there. Add to the appropriate domain file instead (see below).

### Domain type files

| Subpath export | Source file               | Domain                                                                 |
| -------------- | ------------------------- | ---------------------------------------------------------------------- |
| `./maps`       | `src/maps/types.ts`       | Map browser, map-tagger run args, globe pins, mission briefing data    |
| `./books`      | `src/books/types.ts`      | Book catalog + reader (scan, ingest, classify)                         |
| `./compendium` | `src/compendium/types.ts` | Item browser + monster browser + compendium pack summaries             |
| `./chat`       | `src/chat/types.ts`       | AI chat messages, model constants, AoN preview shapes                  |
| `./party`      | `src/party/types.ts`      | Party inventory, Aurus leaderboard, party members (Foundry live query) |
| `./combat`     | `src/combat/types.ts`     | Combat tracker, encounter/combatant shapes, loot, spellcasting         |

Stragglers in `src/types.ts` (no domain yet): `ConfigPaths`, `PickPathArgs` — dm-tool config UI shapes.

### Where do new types go?

- **New feature in one domain** → add to that domain's `src/<domain>/types.ts`.
- **Spans two domains** → put it with the larger consumer; add a re-export from the other domain file if needed (no duplication).
- **Truly cross-cutting** → create `src/<new-domain>/types.ts` and a matching subpath export in `package.json`.
- **dm-tool-only IPC surface** → goes in `apps/dm-tool/electron/ipc/types.ts`, not in this package. `ElectronAPI` was moved there as part of audit finding F3.

The barrel (`src/types.ts`) should remain a pure re-export file. It will be deleted in a future minor version once consumers migrate to the narrow subpath imports.

### Other subpath exports

- `.` / `./types` — `src/types.ts` (barrel, backward-compat)
- `./foundry-api` — `src/foundry-api.ts` (foundry-mcp `/api/*` wire contract: `CompendiumMatch`, `ActorRef`, `PreparedActor`, `ApiError`, etc.)
- `./foundry-markup` — `src/foundry-markup.ts`
- `./http` — `src/http.ts` (`ApiRequestError`, `requestJson<T>`, `buildCompendiumQuery` — runtime helpers for hitting the foundry-mcp REST surface)
- `./map-stem` — `src/map-stem.ts`
- `./MissionBriefing` — `src/MissionBriefing.tsx` (React component)
- `./golarion-map` — `src/golarion-map/index.ts`
- `./rpc` — `src/rpc/index.ts` (Zod schemas + `z.infer<>` types for the `/api/*` request surface; re-used by both `apps/foundry-mcp` server and `apps/player-portal` client)

## Key decisions / gotchas

- Peer-deps, not direct deps: consumers (dm-tool via electron-vite, player-portal via Vite) bundle React + maplibre-gl themselves. This package just imports them.
- `./MissionBriefing` is a `.tsx` export — consumers must bundle it. Works fine under Vite / electron-vite; would need a compiler step if anything else consumed it.
- Lives in the root-ESLint scope — root `eslint.config.js` only excludes `packages/*/dist/`, not source.
- `src/golarion-map/pins.ts` imports `GlobePin` via relative `../types.js` — this resolves through the barrel and still works.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
