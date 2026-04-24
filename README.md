# foundry-toolkit

Monorepo consolidating the Foundry VTT companion tools. Previously five separate repos; collapsed into one npm-workspaces monorepo.

## Layout

```
foundry-toolkit/
├── apps/
│   ├── dm-tool/              Electron desktop app (GM-side)
│   ├── player-portal/        Player-facing web app + Fastify server
│   │                           serves the SPA, /api/live/* (ex-sidecar),
│   │                           /api/mcp/* (proxy to foundry-mcp), /map/*,
│   │                           and the Foundry asset prefixes. Includes
│   │                           the PF2e character creator/sheet surface.
│   ├── foundry-mcp/          Self-hosted MCP server (Fly.io deploy)
│   └── foundry-api-bridge/   Foundry VTT module — WebSocket bridge to MCP
├── packages/
│   ├── ai/                   PF2e GM assistant agents (chat, hooks, loot, classifier)
│   ├── db/                   Data layer (pf2e.db, BookDb, MapDb)
│   └── shared/               Types + shared UI
├── resources/                dm-tool Electron icons
├── tagger/                   Python map-indexing subtool (built separately)
├── tools/
│   └── launcher/             Tiny Electron GUI to run `dev:*` scripts per worktree
└── tsconfig.base.json        Shared strict TS config
```

## Scripts (root)

- `npm install` — installs everything + rebuilds better-sqlite3 for Electron
- `npm run typecheck` — type-check all workspaces
- `npm run test` — run all workspace test suites
- `npm run lint` — root ESLint + per-workspace lint scripts
- `npm run build` — build all workspaces
- `npm run dev:dm-tool` — launch dm-tool Electron dev
- `npm run dev:mcp` — launch foundry-mcp server
- `npm run dev:player-portal` — launch player-portal (Vite + Fastify concurrently)
- `npm run dev:player-portal:mock` — same but with the in-process MCP/asset mock
- `npm run dev:api-bridge` — vite watch build for the Foundry module
- `npm run launcher` — open `tools/launcher`, a small Electron GUI that lists every worktree × `dev:*` app pair and spawns the selected one in a new Windows Terminal tab

See each workspace's README / CLAUDE.md for app-specific details.

## Deferred from consolidation

- **CI**: per-repo GitHub Actions workflows were not ported. Minimal CI TBD.
- **Deployments**: Fly.io (foundry-mcp), electron-builder (dm-tool), GHCR images (api-bridge, player-portal) all still reference the old repos. Re-point when productionizing.
- **Branches**: feature branches stay in the source repos until explicitly carried over.

## License

[MIT](LICENSE) © Alex Dickerson. `apps/foundry-api-bridge` additionally preserves upstream fork attribution; `apps/player-portal` includes Apache-2.0 derived files (ported from `foundryvtt/pf2e` for the character creator/sheet surface) — see its [NOTICE](apps/player-portal/NOTICE).
