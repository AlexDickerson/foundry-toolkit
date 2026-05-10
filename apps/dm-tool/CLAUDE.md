# dm-tool

Electron desktop app for the GM: browses the dnd-map-tagger image library, reads PF2e books, drives Foundry VTT via MCP, runs the chat/loot/hooks AI agents, and pushes live state to the player-portal.

Part of the foundry-toolkit monorepo at `apps/dm-tool` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## Tech stack

- TypeScript, React 19, Electron 41
- electron-vite (three build targets: main, preload, renderer)
- Tailwind CSS 4 (via `@tailwindcss/postcss`)
- Radix UI primitives, `lucide-react`, `@tanstack/react-virtual`
- maplibre-gl + pmtiles, pdfjs-dist
- Vitest + happy-dom + Testing Library

Workspace deps (raw TS, transpiled by electron-vite): `@foundry-toolkit/ai`, `@foundry-toolkit/db` (subpath imports `./pf2e`, `./books`, `./maps`), `@foundry-toolkit/shared`.

## Build & run

- `npm run dev` — electron-vite dev (renderer HMR + main restart).
- `npm run build` — electron-vite build → `out/`.
- `npm run typecheck` — two projects: `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer).
- `npm run test` / `test:watch` / `test:coverage` — vitest.
- `npm run package:win` — `electron-vite build && electron-builder --win` → NSIS one-click per-user installer at `../../dist/`.
- `npm run package:mac` — `electron-vite build && electron-builder --mac` → `.dmg` at `../../dist/`.
- `npm run package:ci:win` / `package:ci:mac` — same as above but `--publish never` (used by CI).

## Project structure

- `electron/main.ts` — entry; bootstrap config, SQLite open, custom-protocol registration, session hooks, IPC wiring, BrowserWindow.
- `electron/ipc/` — full IPC surface; `setup-ipc.ts` handles first-run before the main DB is configured.
- `electron/config.ts` — bootstrap config loader + DB-backed config.
- `electron/book-scanner.ts` — phase-1 filesystem walk for the book catalog; phase-2 cover extraction is lazy.
- `electron/sidecar-client.ts` — HTTP client to player-portal's Fastify `/api/live/*` (ex-sidecar).
- `src/` — React renderer (`src/main.tsx` entry).

## Key decisions / gotchas

- **Three custom privileged protocols**, all registered **before** `app.ready` (CSP requires pre-ready registration):
  - `map-file://maps/<filename>` — flat library filenames only; path-traversal hard-rejected (no `..`, `/`, `\`); host pinned to `maps` because Chromium lowercases custom-scheme hostnames and would otherwise swallow the filename.
  - `book-file://files/<id>` / `book-file://covers/<id>` — PDFs and cover PNGs by integer id; id is validated against BookDb so a renderer bug can't read arbitrary filesystem paths. Range-request support via `net.fetch` lets large PDFs stream page-by-page.
  - `monster-file://img/<relative-path>` — monster art; progressively strips leading path segments to find the file under the pf2e.db directory.
- **Session hook** on `defaultSession.webRequest.onHeadersReceived`: strips `X-Frame-Options` and `frame-ancestors` (so external sites embed in iframes), and injects `Access-Control-Allow-Origin: *` for `https://map.pathfinderwiki.com/` so MapLibre can fetch PMTiles, sprites, and font glyphs from the renderer.
- `sandbox: false` on the BrowserWindow — preload needs `fs` access via `ipcRenderer`.
- **Windows packaging only bundles the external binaries** (`map-tagger.exe`, `Auto-Wall.exe`) — they are in `win.extraResources` and are not packaged into the macOS `.dmg`. Both must exist locally at `package:win` time; CI does not build them (they have their own release cycle via `tagger-v*` tags).
- `MapDb` is a read-only consumer of the map-tagger index (the `tagger/` Python subtool is the writer). `BookDb` shares the `pf2e.db` connection opened at startup.
- **Tailwind 4 JIT + HMR quirk**: newly-introduced utility classes occasionally fail to materialize during hot reload. For layout-critical sizing, prefer inline styles until a full reload.

## Releases

Tag convention: `dm-tool-vX.Y.Z` (separate from the `v*` tags used for Docker image releases).

To cut a release once the PR is merged to `main`:

```sh
git tag dm-tool-v1.5.1
git push origin dm-tool-v1.5.1
```

Or via `gh`:

```sh
gh release create dm-tool-v1.5.1 --target main --generate-notes --title "DM Tool v1.5.1"
```

The `release-dm-tool.yml` workflow fires on `dm-tool-v*` tag pushes, builds the Windows `.exe` (NSIS) and macOS `.dmg` on their respective runners, then attaches both installers to a GitHub Release.

**No code signing.** Both installers are unsigned.

- _macOS_: Gatekeeper will block first launch. Users must right-click → Open, or strip the quarantine attribute: `xattr -dr com.apple.quarantine "DM Tool.app"`.
- _Windows_: SmartScreen may warn on first run. Clicking "More info → Run anyway" proceeds normally.

**macOS icon**: `resources/icon.png` (1024×1024, upscaled from the 256×256 source in `icon.ico`). electron-builder converts it to `.icns` internally during the macOS build.

**External binaries not bundled in the macOS build**: `map-tagger.exe` and `Auto-Wall.exe` live in `win.extraResources` only and are not required at macOS packaging time. Users who need the map-tagger on Windows can install it separately from its own release (tagged `tagger-v*`).

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only, push frequently, lint + format before committing.
