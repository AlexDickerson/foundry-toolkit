# foundry-toolkit demo stack

Three containers on one internal network:

| Container       | Image / source                  | Exposed                       |
| --------------- | ------------------------------- | ----------------------------- |
| `foundry`       | `felddy/foundryvtt:release`     | host port 30000               |
| `foundry-mcp`   | built from `apps/foundry-mcp`   | internal only (8765)          |
| `player-portal` | built from `apps/player-portal` | host port 3000 (configurable) |

The `foundry-api-bridge` Foundry module (already deployed in your world) dials out
from the browser to `ws://foundry-mcp:8765/foundry` over the compose network — no
extra configuration needed inside the stack itself.

---

## Prerequisites

- Docker with Compose v2 (`docker compose`, not `docker-compose`)
- A Foundry VTT license (Paizo username + password)
- The `foundry-api-bridge` module installed and enabled in your Foundry world
- An OpenAI API key (optional — only needed for the `edit_image` map tool)

---

## Quick start

Run all commands from inside this `deploy/` directory.

```sh
cd deploy
cp .env.example .env
# Fill in at minimum: FOUNDRY_USERNAME, FOUNDRY_PASSWORD, SHARED_SECRET
$EDITOR .env

docker compose build        # build foundry-mcp and player-portal images
docker compose up -d        # start all three services
```

First boot downloads a fresh Foundry install using your Paizo credentials — this
takes a few minutes. Subsequent starts are instant.

### Verify the stack is up

```sh
# player-portal health check
curl http://localhost:3000/health
# → {"ok":true}

# Foundry setup page (won't fully load without a world, but should serve HTML)
curl -s -o /dev/null -w "%{http_code}" http://localhost:30000/
# → 200

# foundry-mcp reachable from inside player-portal container
docker compose exec player-portal wget -qO- http://foundry-mcp:8765/api/actors
# → JSON response (empty array or actor list depending on Foundry state)
```

---

## Configuring foundry-api-bridge

The `foundry-api-bridge` module must be told where foundry-mcp is listening. In
Foundry's **Module Settings** → **Foundry API Bridge**, set the WebSocket URL to:

```
ws://foundry-mcp:8765/foundry
```

This hostname resolves inside the compose network. If you're running Foundry
**outside** this stack (e.g. a separate host) and still want to use foundry-mcp
from this compose, set the URL to your Docker host's IP or hostname instead:

```
ws://<your-host-ip>:8765/foundry
```

Note: in that case you'll need to expose port 8765 in `compose.yaml` by adding
a `ports` entry under `foundry-mcp`.

---

## Port layout

| Port  | Service       | Notes                                        |
| ----- | ------------- | -------------------------------------------- |
| 30000 | Foundry VTT   | Direct browser access                        |
| 3000  | player-portal | Override with `PLAYER_PORTAL_PORT`           |
| 8765  | foundry-mcp   | Internal only — not accessible from the host |

To change the player-portal host port without rebuilding:

```sh
# In .env:
PLAYER_PORTAL_PORT=8080

docker compose up -d   # restarts player-portal with the new port mapping
```

---

## Environment variables

| Variable             | Required    | Default | Purpose                                                        |
| -------------------- | ----------- | ------- | -------------------------------------------------------------- |
| `FOUNDRY_USERNAME`   | yes         | —       | Paizo account username for Foundry download                    |
| `FOUNDRY_PASSWORD`   | yes         | —       | Paizo account password                                         |
| `FOUNDRY_ADMIN_KEY`  | recommended | —       | Foundry admin console password                                 |
| `OPENAI_API_KEY`     | no          | —       | GPT-image-1 map editing (`edit_image` tool)                    |
| `SHARED_SECRET`      | yes         | —       | Bearer token for `/api/live/*` POST writes                     |
| `ALLOW_EVAL`         | no          | `0`     | Set to `1` to enable the `/api/eval` debug endpoint            |
| `PLAYER_PORTAL_PORT` | no          | `3000`  | Host port mapping for player-portal                            |
| `FOUNDRY_DATA_PATH`  | no          | —       | Host path to bind-mount as `/data` instead of the named volume |

`MCP_URL` and `FOUNDRY_URL` are wired internally via compose service DNS and are
not read from `.env`.

---

## Stopping, restarting, rebuilding

```sh
docker compose stop              # pause all containers (volumes preserved)
docker compose down              # stop + remove containers (volumes preserved)
docker compose down -v           # also delete foundry-data volume (world data lost)

docker compose build             # rebuild foundry-mcp and player-portal images
docker compose up -d --build     # rebuild + restart in one step
```

---

## Data persistence

Foundry world data — systems, modules, worlds, uploads — lives in the
`foundry-toolkit-demo_foundry-data` named volume. It survives `docker compose
down` and `docker compose restart`. Only `docker compose down -v` deletes it.

foundry-mcp and player-portal are stateless; player-portal's in-memory live-sync
state (inventory/globe/aurus snapshots) refills within seconds once dm-tool
pushes its next update.

---

## TLS / HTTPS

This stack serves plain HTTP. Put nginx, Caddy, or Cloudflare Tunnel in front
for HTTPS. A minimal Caddy reverse-proxy example:

```
demo.example.com {
    reverse_proxy localhost:3000
}

foundry.example.com {
    reverse_proxy localhost:30000
}
```
