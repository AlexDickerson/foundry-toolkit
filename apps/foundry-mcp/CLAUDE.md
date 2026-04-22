# foundry-mcp

Self-hosted MCP server that bridges Claude Code (or any MCP client) to a live Foundry VTT instance. Pairs with the [foundry-api-bridge](https://github.com/AlexDickerson/foundry-api-bridge) module running in the GM's browser tab, plus the [foundry-character-creator](https://github.com/AlexDickerson/foundry-character-creator) SPA for the REST-driven character creator UI.

## Tech Stack

- TypeScript (Node 20+)
- MCP SDK (`@modelcontextprotocol/sdk`) — Streamable HTTP transport
- Fastify — REST surface at `/api/*`
- `ws` — WebSocket bridge to Foundry
- OpenAI SDK — GPT-image-1 for `edit_image` map editing (not chat)
- Zod — request validation

## Build & Run

- `npm run dev` — tsx in watch-ish mode (restart on change)
- `npm run build` — Compile TypeScript → `dist/`
- `npm start` — Run compiled server (`node dist/index.js`)
- `npm run lint` / `npm run lint:fix`

Environment: copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`. See `.env.example` for optional flags (`ALLOW_EVAL`, etc.).

Default ports:

- `8765` — HTTP (MCP over Streamable HTTP at `/mcp`, REST at `/api/*`, WebSocket at `/foundry`)

## Project Structure

- `src/tools/` — MCP tool implementations
- `src/bridge.ts` — WebSocket bridge to Foundry module
- `src/events/` — Multi-channel SSE pool + subscription lifecycle (see Event Channels below)
- `src/http/` — Fastify REST surface (consumed by foundry-character-creator)
- `src/config.ts`, `src/logger.ts`
- `src/index.ts` — Entry point
- `_http/` — REST Client `.http` files for interactive endpoint testing

## Event Channels

SSE pub/sub for live Foundry events (rolls, chat, combat). External consumers — dm-tool, character-creator, Discord bots, stream overlays — subscribe to a named channel and receive events as they fire. `Hooks.on` registrations on the Foundry side are lazy: the module only listens while at least one subscriber is connected, so an idle server pushes nothing.

### Architecture

- `src/events/channel-manager.ts` — singleton `ChannelManager` with a per-channel `Set<SubscriberFn>`. `subscribe(channel, fn)` returns an unsubscribe. The 0→1 and 1→0 subscriber-count transitions fire `onSubscriptionChange(channel, active)`.
- `src/bridge.ts` wires that callback to `sendCommand('set-event-subscription', {channel, active})`. The module owns the matching `Hooks.on` / `Hooks.off` lifecycle (see [apps/foundry-api-bridge/CLAUDE.md](../foundry-api-bridge/CLAUDE.md)).
- `src/http/routes/events.ts` — `GET /api/events/:channel/stream` is the SSE endpoint. Writes `: connected`, subscribes to the channel, streams `data: {json}\n\n` with a 20s heartbeat, cleans up on client close.

### Wire protocol

| Direction | Shape | Path |
|---|---|---|
| Server → module | `{id, type: "set-event-subscription", params: {channel, active}}` | Existing command path; gets a normal `CommandResponse` ack |
| Module → server | `{kind: "event", channel, data}` | Third branch in `bridge.ts` message handler — no `id`, no `bridgeId` |
| Client → server | `GET /api/events/:channel/stream` | SSE; each `data:` line is the raw JSON payload |

### Lifecycle

1. Client opens SSE → `ChannelManager.subscribe()` → 0→1 transition fires callback
2. `bridge.ts` sends `set-event-subscription {active: true}` to the module
3. Module's `EventChannelController.enable(channel)` registers `Hooks.on(...)` listeners
4. Foundry fires a hook → module serializes → `wsClient.pushEvent(channel, data)`
5. `bridge.ts` sees `{kind: "event"}` → `ChannelManager.publish()` → fan-out to every SSE subscriber
6. Last client disconnects → 1→0 transition → module `Hooks.off(...)` + state cleared
7. On Foundry reconnect, `bridge.ts` re-pushes `set-event-subscription {active: true}` for every currently-active channel so streams survive module disconnects without consumers re-subscribing

### Adding a channel

1. Add the name to `EVENT_CHANNELS` in `src/http/schemas.ts`
2. Add a matching case to the switch in `apps/foundry-api-bridge/src/events/EventChannelController.ts#enable` that registers the Foundry hooks and pushes via `wsClient.pushEvent(channel, data)`
3. Add the name to `KNOWN_CHANNELS` in the same file
4. Consume: `curl -N http://localhost:8765/api/events/<channel>/stream`

Currently implemented: `rolls`, `chat`, `combat`.

### Testing

`test/channel-manager.test.ts` covers pool invariants: 0↔1 transitions, fan-out, dead-subscriber pruning, idempotent unsubscribe, independent channels, callback errors. Module-side integration lives in the bridge repo's Jest suite.

## Git Workflow

- All work MUST be done in git worktrees. Never work directly on main.
- Worktree directory: `.claude/worktrees/<branch-name>`
- Push work to the remote frequently — at minimum after every logical unit of work, and always before ending a session.
- All changes go through PRs to main. Never commit directly to main.
- Run linting before committing. Fix lint errors before pushing.

## Deployment

Primary deploy target: **Fly.io**, from a Docker image published to GHCR.

- `Dockerfile` — multi-stage build: compiles the server, pulls the prebuilt SPA bundle from `ghcr.io/alexdickerson/foundry-character-creator:latest`, and serves both from a single Node process on `$PORT` (defaults to 8080 in the container, 8765 for local dev).
- `fly.toml` — Fly Machines config. `min_machines_running=1` + `auto_stop_machines=false` because the Foundry module's outbound WebSocket to `/foundry` must stay connected.
- `.github/workflows/docker.yml` — builds + smoke-tests the image on PRs, publishes `ghcr.io/alexdickerson/foundry-mcp:{latest,version,sha}` on merges to main.
- `.github/workflows/fly-deploy.yml` — triggers on successful Docker workflow completion on main (or via `workflow_dispatch`) and runs `flyctl deploy --remote-only --image ghcr.io/.../foundry-mcp:latest`. Requires the `FLY_API_TOKEN` secret.

First-time setup:

```bash
fly launch --no-deploy              # creates the app; adjust name in fly.toml if taken
fly secrets set OPENAI_API_KEY=...  # required for edit_image
```

The Foundry module points its WebSocket at `wss://<app>.fly.dev/foundry`; MCP clients hit `https://<app>.fly.dev/mcp`; the character-creator SPA loads at `https://<app>.fly.dev/`. All same-origin, one container, one port.

**Alternative — systemd on a Foundry host** (the old setup, still supported since the server is plain `node dist/index.js`):

```bash
systemctl --user status foundry-mcp    # check status
systemctl --user restart foundry-mcp   # restart
journalctl --user -u foundry-mcp -f    # tail logs
```

The Docker image for Foundry+module itself lives in [foundry-api-bridge](https://github.com/AlexDickerson/foundry-api-bridge); this repo's image only bundles the MCP server + SPA.

## Key Decisions

- WebSocket bridge to Foundry lives at `/foundry`; the module opens the WS outbound from the GM browser.
- REST `/api/*` exposes the same data the MCP tools see (actors, items, compendia, scenes, etc.) for the character-creator SPA.
- OpenAI SDK used specifically for GPT-image-1 map editing (not for chat).
- Module and frontend live in separate repos now; contract between them is WS (module) + REST (frontend). No shared code.
- Server ships three ways: as a source zip (GitHub Releases, for systemd-on-Foundry-host), as a bare Node process, and as a Docker image on GHCR that bundles the character-creator SPA for single-container Fly.io deploys. The Foundry + module Docker image still lives in foundry-api-bridge; this repo's image is MCP server + SPA only.
- The SPA bundle is pulled into the Dockerfile via `COPY --from=ghcr.io/alexdickerson/foundry-character-creator:latest` rather than bundled here — keeps the frontend on its own release cadence and avoids duplicate checkouts in CI.
