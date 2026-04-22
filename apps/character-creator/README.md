# foundry-character-creator

React 19 SPA that renders a Pathfinder 2e character creator/viewer, consuming the [foundry-mcp](https://github.com/AlexDickerson/foundry-mcp) REST API. Renders post-`prepareData()` actor state using PF2e's styling conventions.

## Architecture

```
Browser (Vite :5173) ──/api/* ──proxy──> foundry-mcp server (:8765)
                     ──/icons, /systems, /modules, /worlds, /assets──> Foundry VTT (:30000)
```

The SPA talks to foundry-mcp over REST (`/api/*`) for gameplay data and proxies asset paths straight to the running Foundry instance for images. No cross-dependency on the module or server code — contract is HTTP-only.

## Dev loop

```bash
# Start foundry-mcp server in a separate terminal
cd ../foundry-mcp && npm run dev

# Start Foundry (or point FOUNDRY_URL at a running one)
cd ../foundry-api-bridge && ./local.sh up

# Run the SPA
npm install
npm run dev                      # Vite on :5173, proxies /api → :8765
```

Override defaults via env:
- `FOUNDRY_URL=http://my-foundry:30000`
- `MCP_URL=http://my-server:8765`

Mock mode (no backend required):

```bash
npm run dev:mock                 # serves src/fixtures/*-prepared.json inline
```

## Scripts

- `npm run dev` — Vite dev server with HMR
- `npm run dev:mock` — dev server with in-process mock API
- `npm run build` — typecheck + production build to `dist/`
- `npm run preview` — serve the built dist
- `npm run lint` / `lint:fix`
- `npm run typecheck`
- `npm run test` / `test:watch` — Vitest

## Production image

The repo publishes `ghcr.io/alexdickerson/foundry-character-creator:latest` (also tagged with the `package.json` version and `sha-<short>`) via `.github/workflows/docker.yml`. It is a multi-stage build — `node:20-alpine` produces the Vite `dist/`, which is baked into `nginx:alpine` at `/usr/share/nginx/html/`.

Its primary role is as a **static bundle image** consumed by [foundry-mcp](https://github.com/AlexDickerson/foundry-mcp) — that repo's Dockerfile pulls the built SPA via `COPY --from=ghcr.io/alexdickerson/foundry-character-creator:latest /usr/share/nginx/html/ ...` and serves it alongside the REST / MCP / WebSocket API from a single Fastify process in one container on Fly.io.

The nginx runtime stage keeps the image usable standalone as well (SPA fallback + `/healthz` on port 8080, no reverse proxy), which is handy for static-only previews but is not the primary deploy target.

## Attribution

Derived files (PF2e SCSS, `en.json` i18n) are Apache-2.0 licensed upstream. See [NOTICE](NOTICE) for specifics.

## Links

- [foundry-mcp](https://github.com/AlexDickerson/foundry-mcp) — server providing the REST API this SPA consumes
- [foundry-api-bridge](https://github.com/AlexDickerson/foundry-api-bridge) — Foundry module that feeds the server
