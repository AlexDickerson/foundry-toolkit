# foundry-mcp

Self-hosted MCP server that bridges Claude Code (or any MCP client) to a live Foundry VTT instance. Pairs with the [foundry-api-bridge](../foundry-api-bridge/) module running in the GM's browser tab. Sibling [player-portal](../player-portal/) consumes the REST surface via its `/api/mcp/*` reverse proxy.

Part of the foundry-toolkit monorepo at `apps/foundry-mcp` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

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
- `src/http/` — Fastify REST surface (consumed by player-portal via its `/api/mcp/*` proxy)
- `src/config.ts`, `src/logger.ts`
- `src/index.ts` — Entry point
- `_http/` — REST Client `.http` files for interactive endpoint testing

## Event Channels

SSE pub/sub for live Foundry events (rolls, chat, combat). External consumers — dm-tool, player-portal, Discord bots, stream overlays — subscribe to a named channel and receive events as they fire. `Hooks.on` registrations on the Foundry side are lazy: the module only listens while at least one subscriber is connected, so an idle server pushes nothing.

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

Currently implemented: `rolls`, `chat`, `combat`, `actors`.

The `actors` channel pushes a flattened `{ actorId, changedPaths }` diff for every `updateActor` hook. Subscribers filter by dot-notation path prefix (`"system.crafting"`, `"system.attributes.hp"`, etc.) — one hook, many consumers, no per-domain channel proliferation.

### Testing

`test/channel-manager.test.ts` covers pool invariants: 0↔1 transitions, fan-out, dead-subscriber pruning, idempotent unsubscribe, independent channels, callback errors. Module-side integration lives in `apps/foundry-api-bridge`'s Jest suite.

## Git Workflow

- All work MUST be done in git worktrees. Never work directly on main.
- Worktree directory: `.claude/worktrees/<branch-name>/` at the monorepo root (not per-app)
- Push work to the remote frequently — at minimum after every logical unit of work, and always before ending a session.
- All changes go through PRs to main. Never commit directly to main.
- Run linting before committing. Fix lint errors before pushing.

## Running

This server runs as a local Node.js process — no deployment infrastructure. It pairs with a self-hosted Foundry VTT instance via the `apps/foundry-api-bridge` module.

For a persistent background process, systemd works well:

```bash
systemctl --user status foundry-mcp    # check status
systemctl --user restart foundry-mcp   # restart
journalctl --user -u foundry-mcp -f    # tail logs
```

## Key Decisions

- WebSocket bridge to Foundry lives at `/foundry`; the module opens the WS outbound from the GM browser.
- REST `/api/*` exposes the same data the MCP tools see (actors, items, compendia, scenes, etc.). Currently consumed by `apps/player-portal` via its `/api/mcp/*` reverse proxy.
- OpenAI SDK used specifically for GPT-image-1 map editing (not for chat).
- Module and frontend live in sibling workspaces (`apps/foundry-api-bridge`, `apps/player-portal`); runtime contract between them stays WS (module) + REST (frontend). HTTP request/response schemas are shared via `@foundry-toolkit/shared/rpc` so server and frontend can't drift silently.
- The Foundry + module Docker image lives in `apps/foundry-api-bridge` (run via `./local.sh`); this server is a plain Node.js process that connects to it over the WebSocket bridge at `/foundry`.
