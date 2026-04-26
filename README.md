# foundry-toolkit

A personal companion stack for running Pathfinder 2e in Foundry VTT. Four apps and four shared
packages, consolidated into one npm-workspaces monorepo.

The two main surfaces are:

- **dm-tool** — an Electron desktop app the GM runs alongside Foundry. Browses a tagged map
  library, reads PF2e books, runs AI chat/loot/hook agents, and manages combat and party inventory.
- **player-portal** — a web app players open in a browser. Renders a live PF2e character sheet
  outside Foundry (dark/light themed, grid layouts), handles spell casting, skill rolls, feat
  prereqs, item investment, and long-rest mechanics. Backed by a Fastify server that proxies
  Foundry data and pushes live state.

Both apps talk to **foundry-mcp** (a self-hosted MCP + REST server) via **foundry-api-bridge** (a
Foundry VTT module that opens an outbound WebSocket to the MCP server).

## Layout

```
foundry-toolkit/
├── apps/
│   ├── dm-tool/              Electron desktop app (GM-side): map browser, book reader,
│   │                           AI agents, combat tracker, monster browser, party inventory
│   ├── player-portal/        Player-facing React SPA + Fastify server: PF2e character sheet,
│   │                           inventory, Golarion globe, Aurus leaderboard, asset proxy
│   ├── foundry-mcp/          Self-hosted MCP + REST server; WebSocket bridge to Foundry;
│   │                           SSE event channels (rolls, chat, combat, actors)
│   └── foundry-api-bridge/   Foundry VTT module — opens outbound WS to foundry-mcp,
│                               routes commands, relays Foundry dialogs to player-portal
├── packages/
│   ├── ai/                   PF2e GM assistant agents (chat, hooks, loot, classifier);
│   │                           Vercel AI SDK v6, adversarial two-pass chat pattern
│   ├── db/                   SQLite data layer for dm-tool (settings, combat, maps, books)
│   ├── pf2e-rules/           Pure PF2e rules math — XP budgets, treasure tables, no I/O
│   └── shared/               Wire-contract types (foundry-api, rpc), shared UI components
│                               (MissionBriefing, Golarion globe), PF2e design tokens
├── tools/
│   └── launcher/             Electron GUI to spawn dev:* scripts per worktree
├── tagger/                   Python map-indexing subtool (not an npm workspace)
├── auto-wall-bin/            Prebuilt wall-detection binary (extraResources for dm-tool)
└── tsconfig.base.json        Shared strict TypeScript config
```

Internal dependency graph:

- `shared` + `pf2e-rules` → `ai` → `db` → `dm-tool`
- `shared` → `player-portal` (MCP wire contract + design tokens)
- `shared` → `foundry-mcp` (wire contract types + Zod schemas)
- `foundry-api-bridge` is standalone

## Getting started

```bash
npm install   # installs all workspaces; rebuilds better-sqlite3 for dm-tool's Electron ABI
```

Then launch whichever app you need:

```bash
npm run dev:dm-tool              # GM Electron app
npm run dev:mcp                  # foundry-mcp REST + MCP server
npm run dev:player-portal        # player-portal (Vite :5173 + Fastify :3000)
npm run dev:player-portal:mock   # same, but with fixture mock (no Foundry required)
npm run dev:api-bridge           # Vite watch build for the Foundry module
npm run launcher                 # Electron GUI — pick a worktree + dev:* combo
```

Other root commands:

```bash
npm run typecheck    # fan out across all workspaces
npm run test         # fan out across all workspaces
npm run lint         # root ESLint pass + per-workspace lint scripts
npm run lint:fix     # autofix where possible
npm run build        # fan out across all workspaces
npm run knip         # dead-code / unused-deps scan
```

Each workspace has its own `CLAUDE.md` with app-specific build notes and gotchas. The root
`CLAUDE.md` covers the monorepo toolchain, lint workflow, and contribution rules.

## What's notable

**Dialog relay** — When a player triggers an action (attack roll, skill check, saving throw),
foundry-api-bridge suppresses Foundry's native dialog and relays it to the player-portal character
sheet as a typed overlay. Players interact with a styled PF2e dialog rather than a browser popup.

**Dispatcher pattern** — A generic Foundry command dispatcher routes typed PF2e client calls
(saves, strikes, damage, spell casting) through `pf2e-rules` for the math and `foundry-mcp` for
execution. Decouples PF2e rules logic from Foundry API specifics and makes the action surface
incrementally extendable.

**Player-portal character sheet** — A full PF2e character sheet rendered in the browser, outside
Foundry: dark/light themes using PF2e design tokens, grid and list views, feat prerequisite
evaluation, skill rolls, spell slots with casting support, item investment, inventory with crafting,
and live sync from dm-tool via WebSocket.

**Golarion globe** — A shared React component displaying an interactive Golarion world map:
auto-rotate, procedural starfield, east-drifting ambient cloud layer, atmospheric depth halo, and
clickable map pins with fill-color customization.

**Live event channels** — foundry-mcp exposes SSE endpoints (`/api/events/:channel/stream`) for
`rolls`, `chat`, `combat`, and `actors`. The Foundry module registers `Hooks.on` lazily — only
while a subscriber is connected — and tears them down when the last consumer disconnects. External
consumers (dm-tool, player-portal, Discord bots, stream overlays) subscribe without polling.

## Toolchain

- TypeScript 6, ESM throughout (`"type": "module"` at root)
- Vite 7 / electron-vite for bundling; React 19; Tailwind CSS 4; Fastify 5
- ESLint 10 flat config + typescript-eslint + Prettier 3 (120-col)
- Vitest 4 for most workspaces; Jest in `foundry-api-bridge` (forked upstream test suite)
- CI: lint + typecheck + test + knip in `.github/workflows/ci.yml`

## Status and scope

Personal-use project, not aimed at distribution. All four apps run locally against a self-hosted
Foundry VTT instance. `apps/foundry-api-bridge` has a Docker workflow (`./local.sh`) for running
Foundry VTT in a container; `apps/player-portal` has a compose file (`deploy-compose.yml`) for
deploying the portal to a local server.

`tagger/` and `auto-wall-bin/` are not npm workspaces and must be built separately before
`dm-tool` can be packaged.

## License

[MIT](LICENSE) © Alex Dickerson. `apps/foundry-api-bridge` preserves upstream fork attribution.
`apps/player-portal` includes Apache-2.0 derived files ported from `foundryvtt/pf2e` for the
character creator/sheet surface — see [NOTICE](apps/player-portal/NOTICE).
