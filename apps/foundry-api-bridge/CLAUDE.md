# foundry-api-bridge

Foundry VTT module that exposes a WebSocket command interface to a self-hosted MCP server. Fork of `foundry-api-bridge` (MIT) with phone-home behaviour removed.

Part of the foundry-toolkit monorepo at `apps/foundry-api-bridge` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## Tech Stack
- TypeScript
- Vite bundler (watch + build)
- ESLint 9, Prettier
- Jest (tests)
- Foundry VTT types (`@league-of-foundry-developers/foundry-vtt-types`)
- Docker — Dockerfile layers the built module onto `felddy/foundryvtt:14`

## Build & Run
- `npm run build` — Production build (tsc --noEmit + vite build)
- `npm run dev` — Watch mode
- `npm run lint` / `npm run lint:fix`
- `npm run type-check`
- `npm run test` / `npm run test:watch` / `npm run test:coverage`
- `npm run all` — lint + test + build

## Docker
- `./local.sh up` / `./local.sh rebuild` — local Docker Desktop workflow (Foundry + module, port 30000)
- `./dev.sh deploy` — sync + build + restart on remote `server.ad`

Note: the Dockerfile **only** bundles Foundry + this module. The MCP server runs from `apps/foundry-mcp` in this monorepo (`npm run dev:mcp`). Once the module is enabled inside Foundry, configure its WebSocket URL to point at the MCP server's `/foundry` endpoint (default `ws://localhost:8765/foundry`).

## Project Structure
- `src/commands/` — Command router and handlers (actors, scenes, tokens, walls, etc.)
- `src/events/` — `EventChannelController` owning `Hooks.on/off` lifecycle per channel (see Event Channels below)
- `src/transport/` — WebSocket transport layer (`WebSocketClient.send` for command responses, `sendEvent` for bridge prompts, `pushEvent` for channel events)
- `src/ui/` — Foundry UI components
- `src/settings/` — Foundry module settings registration
- `src/__tests__/` — Jest test suites
- `dist/module.json`, `dist/styles/`, `dist/templates/` — Static assets that aren't produced by Vite (checked in; copied by the Dockerfile)
- `PATCHES.md` — Documents every change vs. upstream fork
- `LICENSE` — Upstream MIT (preserved)

## Event Channels

The server asks the module to register or tear down `Hooks.on` listeners based on whether anyone's subscribed to a given channel. `src/events/EventChannelController.ts` owns that lifecycle.

### How it works

- Server sends `set-event-subscription {channel, active}` over the command path
- `SetEventSubscriptionHandler` (a factory closure over the controller) dispatches to `controller.enable(channel)` or `.disable(channel)`
- `enable` switches on channel name, registers the matching hooks, and stores each `{name, id}` pair in `hookHandles: Map<channel, HookHandle[]>` for deterministic teardown
- Hook callbacks serialize the event payload and call `wsClient.pushEvent(channel, data)` — fire-and-forget — which the server routes to every SSE subscriber

### Wire protocol (module side)

| Direction | Shape |
|---|---|
| In (command) | `{id, type: "set-event-subscription", params: {channel, active}}` — routed like any other command |
| Out (push) | `{kind: "event", channel, data}` via `WebSocketClient.pushEvent` — fire-and-forget, dropped when socket is closed |

### Shared-hook refcounting

`createChatMessage` feeds both `rolls` (rolls-only payload when `message.isRoll`) and `chat` (every message). `ensureChatMsgHook()` registers it exactly once on the first dependant channel to enable. `disable()` tears it down only when **both** channels are inactive. Apply the same pattern for any future channel that shares a Foundry hook with another — the handle is stored as a bare `chatMsgHookHandle: number | null` rather than in `hookHandles`, precisely because its lifetime spans multiple channels.

### Adding a channel

1. Add the name to `KNOWN_CHANNELS` in `src/events/EventChannelController.ts`
2. Add a `case` in the `enable()` switch that:
   - Registers every Foundry hook the channel needs via `this.reg(hookName, fn)` — `reg` wraps `Hooks.on` and returns a `HookHandle` you push into the per-case `handles` array
   - In each hook callback, narrow the argument with a type guard (see `isFoundryChatMessage`, `isFoundryCombat`), serialize, and call `this.wsClient.pushEvent(channel, data)`
3. If the channel reads from a hook that another channel also needs, factor it into a `ensure<Name>Hook()` helper and extend the refcount check in `disable()`
4. Add the matching name to `EVENT_CHANNELS` in `apps/foundry-mcp/src/http/schemas.ts` — the server rejects SSE requests for channels not listed there

### Hook handle cleanup contract

Every `Hooks.on()` call returns a numeric id. The controller stores `{name, id}` pairs per channel in `hookHandles` so `disable()` can call `Hooks.off(name, id)` for each. Forgetting this leaks callback registrations across reconnects — Foundry will invoke the stale callback, which then pushes through a dead `wsClient`.

### Testing

No module-side tests for `EventChannelController` yet — follow-up. Would need the Jest suite's Foundry `Hooks` mock extended to verify enable/disable call sequences and payload serialization.

## Git Workflow
- All work MUST be done in git worktrees. Never work directly on main.
- Worktree directory: `.claude/worktrees/<branch-name>/` at the monorepo root (not per-app)
- Push work to the remote frequently — at minimum after every logical unit of work, and always before ending a session.
- All changes go through PRs to main. Never commit directly to main.
- Run linting before committing. Fix lint errors before pushing.

## Key Decisions
- Module is built with Vite. Static assets live in `dist/` pre-built and are copied by the Dockerfile (they aren't generated by Vite).
- WebSocket URL is configurable via Foundry module settings. Default is empty — user must point it at a self-hosted MCP server.
- Docker image layers module onto `felddy/foundryvtt:14`; server is out-of-scope for this repo.
- `legacy-peer-deps=true` in `.npmrc` — required for `@league-of-foundry-developers/foundry-vtt-types` vs. our bleeding-edge TypeScript pin.
