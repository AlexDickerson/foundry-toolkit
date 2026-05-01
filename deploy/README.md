# foundry-toolkit compose stack

Three containers. One env file. Everything the GM needs to run a Foundry VTT
session with the full foundry-toolkit feature set available to players.

| Service       | Image                                  | Port  | Audience      |
| ------------- | -------------------------------------- | ----- | ------------- |
| foundry       | `foundry-toolkit-foundry:<tag>`        | 30000 | GM            |
| foundry-mcp   | `foundry-toolkit-mcp:<tag>`            | 8765  | internal only |
| player-portal | `foundry-toolkit-portal:<tag>`         | 3000  | players       |

The `foundry-api-bridge` Foundry module is baked into the `foundry` image and
seeded into the data volume on first boot.  Once a world is created and the
module enabled, it opens a WebSocket connection from the GM's browser tab to
`foundry-mcp` (port 8765).

---

## Prerequisites

- Docker 24+ with Compose v2 (`docker compose`, not `docker-compose`)
- A Foundry VTT license (Paizo username + password)
- An OpenAI API key (optional — only for the `edit_image` map tool)

---

## Quick start

```sh
cp deploy/.env.example deploy/.env
# Fill in at minimum: FOUNDRY_USERNAME, FOUNDRY_PASSWORD, SHARED_SECRET
$EDITOR deploy/.env

docker compose -f deploy/compose.yaml up -d
```

Players reach the portal at **http://localhost:3000**.

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

# Internal networking check (proves foundry-mcp is reachable from player-portal)
docker compose -f deploy/compose.yaml exec player-portal \
  wget -qO- http://foundry-mcp:8765/healthz
# → 200
```

---

## One-time Foundry setup

After the stack boots and Foundry is reachable at port 30000:

1. Open **http://localhost:30000** in a browser.
2. Set an admin password if prompted, then create a world.
3. Launch the world and open **Game Settings → Manage Modules**.
4. Enable **Foundry API Bridge (Foundry MCP)** and save.
5. Reload the world.

The module's WebSocket URL must point to `ws://<your-server>:8765/foundry`.
`foundry-mcp` is not mapped to the host by default — see **Port 8765 and the
api-bridge module** below for your options.

---

## Updating to a newer version

```sh
# Pull all three images at once
docker compose -f deploy/compose.yaml pull

# Restart with the new images (data volume is preserved)
docker compose -f deploy/compose.yaml up -d
```

To pin a specific version, set `IMAGE_TAG=v0.2.0` in your `.env`.

---

## Local build (from source)

Use the override file to build all three images locally instead of pulling
from GHCR:

```sh
cp deploy/compose.override.yaml.example deploy/compose.override.yaml

# From the monorepo root:
docker compose -f deploy/compose.yaml -f deploy/compose.override.yaml build
docker compose -f deploy/compose.yaml -f deploy/compose.override.yaml up -d
```

---

## Port 8765 and the api-bridge module

`foundry-mcp` listens on port 8765 for WebSocket connections from the
`foundry-api-bridge` module, which runs in the GM's browser tab.  Because the
browser is external to the compose network, the GM's browser needs a routable
path to port 8765.

Options:

1. **Add a host port mapping** in `compose.override.yaml`:
   ```yaml
   services:
     foundry-mcp:
       ports:
         - '8765:8765'
   ```
   Then configure the module to use `ws://<your-server-ip>:8765/foundry`.

2. **Route via a reverse proxy** that terminates TLS and forwards
   `/foundry` WebSocket traffic to the internal `foundry-mcp` service.

Port 8765 is intentionally not mapped in the default `compose.yaml` because
exposing it publicly without TLS or auth is a security concern.  For a
local-network setup where the GM and server are on the same LAN, option 1 is
simplest.

---

## Environment variables

| Variable               | Service(s)                    | Required | Purpose                                       |
| ---------------------- | ----------------------------- | -------- | --------------------------------------------- |
| `FOUNDRY_USERNAME`     | foundry                       | yes      | Paizo account username for Foundry download   |
| `FOUNDRY_PASSWORD`     | foundry                       | yes      | Paizo account password                        |
| `FOUNDRY_ADMIN_KEY`    | foundry                       | rec.     | Foundry admin console password                |
| `OPENAI_API_KEY`       | foundry-mcp                   | no       | GPT-image-1 map editing (`edit_image` tool)   |
| `ALLOW_EVAL`           | foundry-mcp                   | no       | `1` enables `/api/eval` debug endpoint        |
| `SHARED_SECRET`        | foundry-mcp, player-portal    | yes      | Bearer token for `/api/live/*` POST writes    |
| `SECURE_SESSION_SECRET`| player-portal                 | no*      | Cookie signing for portal user auth           |
| `PLAYER_PORTAL_PORT`   | —                             | no       | Host port for player-portal (default: 3000)   |
| `IMAGE_TAG`            | —                             | no       | Image tag to pull (default: `latest`)         |

*Required once the portal user auth feature ships.

`MCP_URL` and `FOUNDRY_URL` are set by `compose.yaml` to the compose service
names and should not be overridden in `.env`.

---

## Volumes and persistence

| Volume        | Mounted in                     | Contains                                        |
| ------------- | ------------------------------ | ----------------------------------------------- |
| `foundry-data`| foundry (`/data`, rw)          | Worlds, systems, modules, Foundry config        |
|               | foundry-mcp (`/foundry-data`, ro) | Read-only compendium pack access             |

`foundry-mcp` and `player-portal` are stateless — no persistent volumes.
foundry-mcp's SQLite live-state snapshots are ephemeral and refill within
seconds from dm-tool on next push; losing them on restart is harmless.

To wipe Foundry world data completely:

```sh
docker compose -f deploy/compose.yaml down -v
```

### Bind-mount option

If you have existing Foundry data at a host path, replace the named volume
with a bind mount in `compose.override.yaml`:

```yaml
services:
  foundry:
    volumes:
      - /path/to/your/foundry-data:/data
```

---

## How to expose publicly

Put a reverse proxy (nginx, Caddy, Cloudflare Tunnel) in front of ports 3000
and optionally 30000.  A minimal Caddy example:

```
players.example.com {
    reverse_proxy localhost:3000
}

foundry.example.com {
    reverse_proxy localhost:30000
}
```

TLS termination, authentication, and access control are out of scope — handle
them at the proxy layer.  If you also need to expose the `foundry-mcp`
WebSocket for the api-bridge module, proxy port 8765 through the same host.

---

## CI / releases

Pushing a `v*` tag triggers `.github/workflows/release-image.yml`, which
builds and pushes all three images:

```
ghcr.io/alexdickerson/foundry-toolkit-foundry:<tag>   + :latest
ghcr.io/alexdickerson/foundry-toolkit-mcp:<tag>       + :latest
ghcr.io/alexdickerson/foundry-toolkit-portal:<tag>    + :latest
```

Tag manually; the workflow does not bump versions automatically.

```sh
git tag v0.2.0
git push origin v0.2.0
```

---

## Migrating from v0.1.0 (all-in-one image)

v0.1.0 shipped a single container (`ghcr.io/alexdickerson/foundry-toolkit`).
v0.2.0+ ships three separate images managed by this compose stack.

**Migration steps:**

1. Stop and remove the v0.1.0 container:
   ```sh
   docker stop foundry-toolkit
   docker rm foundry-toolkit
   ```

2. Your Foundry world data is in the `foundry-data` named volume.  The compose
   stack uses the same volume name, so your worlds carry over automatically.
   Verify with:
   ```sh
   docker volume ls | grep foundry-data
   ```

   If you used a bind mount (e.g. `-v /my/data:/data`), add a bind-mount
   override in `compose.override.yaml` as shown in the Volumes section above.

3. Copy and fill the new env file:
   ```sh
   cp deploy/.env.example deploy/.env
   $EDITOR deploy/.env
   ```
   Add `SECURE_SESSION_SECRET` (new in v0.2.0); all other variables carry over
   from your old `.env`.

4. Start the compose stack:
   ```sh
   docker compose -f deploy/compose.yaml up -d
   ```

5. In Module Settings → Foundry API Bridge → WebSocket URL, update the URL
   from `ws://127.0.0.1:8765/foundry` to `ws://<your-server>:8765/foundry`
   (or whatever path your reverse proxy exposes for port 8765).
