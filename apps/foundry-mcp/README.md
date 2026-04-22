# foundry-mcp

Self-hosted MCP server that bridges Claude (or any MCP client) to a live Foundry VTT instance over WebSocket.

## Architecture

```
MCP client ──HTTP──> foundry-mcp server ──WebSocket──> foundry-api-bridge (in GM browser)
                         (host:8765)                        (Foundry VTT v13+)
                    │
                    └──REST /api/*──> foundry-character-creator (React SPA)
```

- **This repo (`foundry-mcp`)** — Node.js MCP server using Streamable HTTP transport. Accepts MCP tool calls, translates them to Foundry commands, and relays them over a WebSocket to the GM's browser session. Also exposes a Fastify REST surface at `/api/*` for the character-creator UI, and handles asset uploads directly to the Foundry data directory.
- **[foundry-api-bridge](https://github.com/AlexDickerson/foundry-api-bridge)** — Foundry VTT module that runs in the GM's browser tab. Receives commands via WebSocket, executes them against the Foundry API, returns results. Ships with its own Docker image that layers the module onto `felddy/foundryvtt`.
- **[foundry-character-creator](https://github.com/AlexDickerson/foundry-character-creator)** — React SPA that consumes this server's `/api/*` endpoints for a Pathfinder 2e character creator/viewer.

## MCP Tools

| Tool              | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `get_scenes_list` | List all scenes with id, name, active status                     |
| `get_scene`       | Full scene detail: grid, tokens, walls, lights, notes, ASCII map |
| `activate_scene`  | Set a scene as active for all players                            |
| `capture_scene`   | WebP screenshot of the active scene canvas                       |
| `create_scene`    | Create a new scene with background image and grid settings       |
| `upload_asset`    | Upload a file (image, audio) to the Foundry data directory       |

(And more — see `src/tools/` for the full surface.)

## Setup

Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`.

```bash
npm install
npm run dev                          # Development
npm run build && npm start           # Production
```

The server runs as a systemd user service on the production Foundry host:

```bash
systemctl --user status foundry-mcp    # check status
systemctl --user restart foundry-mcp   # restart
journalctl --user -u foundry-mcp -f    # tail logs
```

MCP clients connect to `http://<host>:8765/mcp`. The Foundry module connects its WebSocket to `ws://<host>:8765/foundry`.

## Local development

The server is runtime-independent. For a full local stack:

1. Start the Foundry + module container from the [foundry-api-bridge](https://github.com/AlexDickerson/foundry-api-bridge) repo:
   ```bash
   cd ../foundry-api-bridge
   ./local.sh up
   ```
2. Run the server here (in this repo):
   ```bash
   npm install
   npm run dev
   ```
3. In Foundry, enable the foundry-api-bridge module and set the WebSocket URL to `ws://localhost:8765/foundry`.
4. (Optional) Start the character-creator SPA from [foundry-character-creator](https://github.com/AlexDickerson/foundry-character-creator):
   ```bash
   cd ../foundry-character-creator
   npm install
   npm run dev
   ```
