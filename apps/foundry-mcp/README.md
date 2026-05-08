# foundry-mcp

Self-hosted MCP server that bridges Claude (or any MCP client) to a live Foundry VTT instance over WebSocket.

## Architecture

```
MCP client ──HTTP──> foundry-mcp server ──WebSocket──> foundry-api-bridge (in GM browser)
                         (host:8765)                        (Foundry VTT v13+)
                    ▲
                    │
       /api/mcp/* proxy from sibling player-portal SPA
```

- **This repo (`foundry-mcp`)** — Node.js MCP server using Streamable HTTP transport. Accepts MCP tool calls, translates them to Foundry commands, and relays them over a WebSocket to the GM's browser session. Also exposes a Fastify REST surface at `/api/*` and handles asset uploads directly to the Foundry data directory.
- **[foundry-api-bridge](../foundry-api-bridge/)** — Foundry VTT module that runs in the GM's browser tab. Receives commands via WebSocket, executes them against the Foundry API, returns results. Ships with its own Docker image that layers the module onto `felddy/foundryvtt`.
- **[player-portal](../player-portal/)** — Sibling app that hosts the PF2e character creator/sheet SPA + live-sync server. Reverse-proxies `/api/mcp/*` here so the SPA can hit this server's REST surface same-origin.

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

## Item art overrides

The player-portal character sheet can show purchased PF2e item-card art instead of the default Foundry compendium icons. The system has three parts:

- **`item_art_overrides` table** in `foundry-mcp.db` (`LIVE_DB_PATH`): maps `item_slug → art_filename` (the on-disk filename in URL-encoded form).
- **`GET /item-art/<filename>`**: serves PNGs from the configured art directory.
- **Override injection**: `GET /api/actors/:id/items` and `/api/actors/:id/party-stash` replace each item's `img` field with `/item-art/<filename>` when a slug match exists.

### Configuration

```env
# Directory containing purchased PF2e item-card PNGs (flat, no subdirs expected).
# If unset, /item-art/* returns 404 and the rest of the server works normally.
FOUNDRY_MCP_ITEM_ART_DIR=/data/item-art
```

### Seeding the database

1. Start foundry-mcp with `COMPENDIUM_CACHE_PACK_IDS=pf2e.equipment-srd` and Foundry connected so the compendium cache is warm.
2. Run the seed CLI:

```bash
# From the monorepo root:
npm run seed-item-art -w apps/foundry-mcp -- --dir "/path/to/art"

# Options:
#   --dir <path>   Art directory (required)
#   --db  <path>   foundry-mcp.db path (default: ./data/foundry-mcp.db)
#   --url <url>    foundry-mcp base URL (default: http://localhost:8765)
```

The CLI decodes URL-encoded filenames (`+` → space, `%26` → `&`, `+-+` → variant in parens), normalises Armour → Armor, searches the compendium by name, and upserts matching rows. Unmatched filenames are printed as a **needs-review** list so you can handle typos or non-SRD items manually.

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

The server is runtime-independent. For a full local stack (run from the monorepo root unless noted):

1. Start the Foundry + module container from the sibling workspace:
   ```bash
   cd apps/foundry-api-bridge
   ./local.sh up
   ```
2. Run the server:
   ```bash
   npm run dev:mcp
   ```
3. In Foundry, enable the foundry-api-bridge module and set the WebSocket URL to `ws://localhost:8765/foundry`.
4. (Optional) Run the player-portal SPA:
   ```bash
   npm run dev:player-portal
   ```
