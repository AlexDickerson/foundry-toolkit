# foundry-toolkit all-in-one image

One container. One env file. Everything the GM needs to run a Foundry VTT
session with the full foundry-toolkit feature set available to players.

| What's inside             | Port  | Audience             |
| ------------------------- | ----- | -------------------- |
| Foundry VTT               | 30000 | GM (optional access) |
| foundry-mcp (MCP server)  | 8765  | internal only        |
| player-portal (React SPA) | 3000  | players              |

The `foundry-api-bridge` Foundry module is pre-installed into the data volume
on first boot. Once a world is created and the module enabled, it dials out
from Foundry's browser context to `ws://127.0.0.1:8765/foundry` — that's the
hardcoded default, so no manual URL configuration is needed.

---

## Prerequisites

- Docker 24+ (BuildKit on by default)
- A Foundry VTT license (Paizo username + password)
- An OpenAI API key (optional — only for `edit_image` map tool)

---

## Quick start

```sh
cd deploy
cp .env.example .env
# Fill in at minimum: FOUNDRY_USERNAME, FOUNDRY_PASSWORD, SHARED_SECRET
$EDITOR .env

docker run -d \
  --name foundry-toolkit \
  --env-file .env \
  -p 3000:3000 \
  -v foundry-data:/data \
  ghcr.io/alexdickerson/foundry-toolkit:latest
```

Players reach the portal at **http://localhost:3000**.

Expose port `30000` with `-p 30000:30000` if you want direct GM browser access
to Foundry. It is not exposed by default because the player portal is the
intended player surface.

First boot downloads a fresh Foundry install using your Paizo credentials — this
takes a few minutes. Subsequent starts are instant.

### Verify everything is running

```sh
# player-portal health check
curl http://localhost:3000/health
# → {"ok":true}

# Foundry setup page (returns HTML once the download is complete)
curl -s -o /dev/null -w "%{http_code}" http://localhost:30000/
# → 200

# s6 service status (requires docker exec)
docker exec foundry-toolkit s6-rc -a list
```

---

## One-time Foundry setup

After the container boots and Foundry is reachable at port 30000:

1. Open **http://localhost:30000** in a browser.
2. Set an admin password if prompted, then create a world.
3. Launch the world and open **Game Settings → Manage Modules**.
4. Enable **Foundry API Bridge (Foundry MCP)** and save.
5. Reload the world.

The module's WebSocket URL defaults to `ws://127.0.0.1:8765/foundry`, which
is correct for the all-in-one image. No additional configuration is needed.

> **Migrating from the compose stack?** If you previously used the three-service
> compose setup and the module was configured to point at `ws://foundry-mcp:8765/foundry`,
> update it in **Module Settings → Foundry API Bridge → WebSocket URL** to
> `ws://127.0.0.1:8765/foundry` after switching to this image.

---

## Environment variables

| Variable            | Required    | Purpose                                         |
| ------------------- | ----------- | ----------------------------------------------- |
| `FOUNDRY_USERNAME`  | yes         | Paizo account username for Foundry download     |
| `FOUNDRY_PASSWORD`  | yes         | Paizo account password                          |
| `FOUNDRY_ADMIN_KEY` | recommended | Foundry admin console password                  |
| `OPENAI_API_KEY`    | no          | GPT-image-1 map editing (`edit_image` tool)     |
| `SHARED_SECRET`     | yes         | Bearer token for `/api/live/*` POST writes      |
| `ALLOW_EVAL`        | no          | Set to `1` to enable `/api/eval` debug endpoint |

`MCP_URL` and `FOUNDRY_URL` are baked into the image (`http://127.0.0.1:8765`
and `http://127.0.0.1:30000`) and should not be overridden.

---

## Stopping and restarting

```sh
docker stop foundry-toolkit    # graceful stop (volume preserved)
docker rm foundry-toolkit      # remove container (volume preserved)
docker rm -f foundry-toolkit   # force-remove running container
```

The `foundry-data` volume persists world data across container removals,
including:

- Foundry worlds, systems, and modules
- foundry-mcp's SQLite live-state database (`/data/mcp/foundry-mcp.db`) —
  stores inventory, globe, and Aurus snapshots pushed by dm-tool

To wipe everything:

```sh
docker volume rm foundry-data
```

The live-state snapshots refill automatically within seconds once dm-tool sends
its next update, so losing them is harmless.

---

## Updating to a newer image

```sh
docker pull ghcr.io/alexdickerson/foundry-toolkit:latest
docker rm -f foundry-toolkit
# Re-run the docker run command from Quick start
```

The `foundry-data` volume carries your worlds and settings forward — only the
image layers are replaced.

---

## How to expose player-portal publicly

Put a reverse proxy (nginx, Caddy, Cloudflare Tunnel) in front of port 3000.
A minimal Caddy example:

```
players.example.com {
    reverse_proxy localhost:3000
}
```

TLS termination, authentication, and access control are out of scope for this
image — handle them at the proxy layer.

---

## Port layout

| Port  | Service       | Notes                                      |
| ----- | ------------- | ------------------------------------------ |
| 3000  | player-portal | Player-facing; publish with `-p 3000:3000` |
| 30000 | Foundry VTT   | GM access; publish with `-p 30000:30000`   |
| 8765  | foundry-mcp   | Internal only; do not publish              |

---

## Building the image locally

```sh
# From the monorepo root:
docker build -f deploy/Dockerfile -t foundry-toolkit:dev .
```

---

## CI / releases

Pushing a `v*` tag triggers `.github/workflows/release-image.yml`, which
builds and pushes to `ghcr.io/alexdickerson/foundry-toolkit:<tag>` plus
`:latest`. Tag manually; the workflow does not bump versions automatically.

```sh
git tag v1.2.3
git push origin v1.2.3
```
