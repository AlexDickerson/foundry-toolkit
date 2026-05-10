# foundry-toolkit compose stack

Five containers. One env file. Everything the GM needs to run a Foundry VTT
session with the full foundry-toolkit feature set available to players.

| Service         | Image                                   | Port            | Audience                 |
| --------------- | --------------------------------------- | --------------- | ------------------------ |
| caddy           | `caddy:2.8`                             | 80, 443         | public internet (TLS)    |
| foundry         | `foundry-toolkit-foundry:<tag>`         | 30000\*         | GM (via Caddy or direct) |
| foundry-mcp     | `foundry-toolkit-mcp:<tag>`             | 8765            | internal only            |
| player-portal   | `foundry-toolkit-portal:<tag>`          | 3000            | players (via Caddy)      |
| headless-bridge | `foundry-toolkit-headless-bridge:<tag>` | none (internal) | automation               |

\* Port 30000 is bound to `127.0.0.1` only — the GM can reach Foundry directly
at `http://localhost:30000` without going through Caddy. Port 3000 is not
mapped to the host; Caddy routes player traffic internally.

The `foundry-api-bridge` Foundry module is baked into the `foundry` image and
seeded into the data volume on first boot. Once a world is created and the
module enabled, it opens a WebSocket connection from the GM's browser tab to
`foundry-mcp` (port 8765).

The `headless-bridge` service (see [Headless bridge](#headless-bridge) below)
automates this browser-tab requirement so the connection stays alive 24/7
without any manual intervention.

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

Players reach the portal at **https://addnd.net/** (via Caddy) or **http://localhost:3000** if port 3000 is temporarily mapped for local testing.

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
`foundry-api-bridge` module, which runs in the GM's browser tab. Because the
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
exposing it publicly without TLS or auth is a security concern. For a
local-network setup where the GM and server are on the same LAN, option 1 is
simplest.

---

## Environment variables

| Variable                | Service(s)                 | Required | Purpose                                                                            |
| ----------------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `FOUNDRY_USERNAME`      | foundry                    | yes      | Paizo account username for Foundry download                                        |
| `FOUNDRY_PASSWORD`      | foundry                    | yes      | Paizo account password                                                             |
| `FOUNDRY_ADMIN_KEY`     | foundry, headless-bridge   | rec.     | Foundry admin console password                                                     |
| `FOUNDRY_ROUTE_PREFIX`  | foundry                    | no       | URL path prefix for Foundry (`foundry` → served at `/foundry/`); empty = no prefix |
| `OPENAI_API_KEY`        | foundry-mcp                | no       | GPT-image-1 map editing (`edit_image` tool)                                        |
| `ALLOW_EVAL`            | foundry-mcp                | no       | `1` enables `/api/eval` debug endpoint                                             |
| `SHARED_SECRET`         | foundry-mcp, player-portal | yes      | Bearer token for `/api/live/*` POST writes                                         |
| `SECURE_SESSION_SECRET` | player-portal              | no\*     | Cookie signing for portal user auth                                                |
| `BRIDGE_GM_USER`        | headless-bridge            | yes†     | Foundry username for the headless GM                                               |
| `BRIDGE_GM_PASS`        | headless-bridge            | no       | Password for `BRIDGE_GM_USER`                                                      |
| `BRIDGE_WORLD_ID`       | headless-bridge            | yes†     | World directory slug to join                                                       |
| `IMAGE_TAG`             | —                          | no       | Image tag to pull (default: `latest`)                                              |

\*Required once the portal user auth feature ships.
†Required only when running the `headless-bridge` service.

`MCP_URL` and `FOUNDRY_URL` are set by `compose.yaml` to the compose service
names and should not be overridden in `.env`.

---

## Volumes and persistence

| Volume         | Mounted in                        | Contains                                                                 |
| -------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `foundry-data` | foundry (`/data`, rw)             | Worlds, systems, modules, Foundry config                                 |
|                | foundry-mcp (`/foundry-data`, ro) | Read-only compendium pack access                                         |
| `caddy_data`   | caddy (`/data`)                   | Let's Encrypt certificates and ACME state — **do not delete carelessly** |
| `caddy_config` | caddy (`/config`)                 | Caddy runtime config cache                                               |

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

## TLS via Caddy

Caddy is included in the compose stack and provisions a Let's Encrypt
certificate for `addnd.net` automatically on first start.

### Prerequisites

1. **DNS** — add an A record at your registrar pointing `addnd.net` to your
   server's public IP. Propagation can take up to an hour; Caddy will retry
   the ACME challenge until it succeeds.

2. **Firewall** — ports **80** and **443** must be reachable from the public
   internet. Caddy uses the HTTP-01 ACME challenge, which requires port 80
   for certificate issuance. Port 443 serves HTTPS traffic.

### Path layout

| URL path                        | Routed to          | Notes                                |
| ------------------------------- | ------------------ | ------------------------------------ |
| `https://addnd.net/`            | player-portal:3000 | SPA root, player-facing surface      |
| `https://addnd.net/foundry/...` | foundry:30000      | Foundry VTT; prefix forwarded intact |

`foundry-mcp` is **not** publicly exposed. The `foundry-api-bridge` module
running in the GM's browser reaches `foundry-mcp` over the compose internal
network (see **Port 8765 and the api-bridge module** below).

### Certificate persistence

Caddy stores ACME state in the `caddy_data` Docker volume. This volume must
survive container restarts — the compose file treats it as a named volume so
Docker preserves it across `up`/`down` cycles.

**Do not delete `caddy_data` casually.** Let's Encrypt has rate limits
(5 duplicate certificates per week). To intentionally re-issue:

```sh
docker compose -f deploy/compose.yaml down
docker volume rm foundry-toolkit_caddy_data
docker compose -f deploy/compose.yaml up -d
```

### Disabling Caddy

If you want to run without TLS (local-only or using an external proxy), remove
the `caddy` service block from `compose.yaml`, add a host port mapping back to
`player-portal`, and set `FOUNDRY_ROUTE_PREFIX=` (empty) in `.env`.

---

## Foundry version variants

Two Foundry image variants are published:

- **Default (`foundry-toolkit-foundry`)** — pins to `felddy/foundryvtt:release` (latest stable, currently v14). Use this unless you have a specific reason to stay on v13.
- **v13 (`foundry-toolkit-foundry-v13`)** — pins to `felddy/foundryvtt:13`. Use this if your modules require v13 compatibility.

To use the v13 variant, swap the `image:` line in `compose.yaml`:

```yaml
foundry:
  image: ghcr.io/alexdickerson/foundry-toolkit-foundry-v13:${IMAGE_TAG:-latest}
```

**Compatibility caveat**: The bundled `foundry-api-bridge` module is built against current Foundry APIs. Running it in v13 may or may not work depending on what APIs it uses. You are responsible for verifying compatibility with your chosen Foundry version. This PR publishes the image; no version-pinned bridge build is included yet.

---

## Headless bridge

### Why it exists

The `foundry-api-bridge` module runs inside the GM's browser and dials out over
WebSocket to `foundry-mcp`. Without the browser open, there is no bridge — the
`player-portal` and any MCP clients lose access to live Foundry data.

The `headless-bridge` service eliminates this dependency. It launches a
headless Chromium browser (via Playwright), logs into Foundry as a dedicated
GM account, and holds the session open indefinitely. Docker's
`restart: unless-stopped` policy means the bridge auto-recovers from crashes,
world reloads, and container restarts.

### Dedicated bridge-gm account (required)

Foundry allows only one active session per user account. If the headless
process and your real GM browser tab both authenticate as the same account,
Foundry will boot the older session.

**Create a separate account** for the headless bridge:

1. Open `http://localhost:30000` and log in as admin.
2. Go to **Game Settings → Server Settings → User Management**.
3. Click **Create User** and fill in:
   - **Name**: `bridge-gm` (or any name — record it as `BRIDGE_GM_USER`)
   - **Role**: Gamemaster
   - **Password**: any password — record it as `BRIDGE_GM_PASS`
4. Save.

Your primary GM account is unaffected. During a real game session your GM
browser logs in as your normal Gamemaster user; the headless container stays
connected as `bridge-gm`. Both exist on the Foundry instance simultaneously
without conflict.

### Finding your world ID

`BRIDGE_WORLD_ID` is the world's **directory slug**, not its display title.
It appears in small text beneath each world card on the Foundry setup page.
You can also inspect the data volume:

```sh
docker compose -f deploy/compose.yaml exec foundry \
  ls /data/Data/worlds/
```

Each directory name is a valid world ID.

### Operations

```sh
# Tail logs
docker compose -f deploy/compose.yaml logs -f headless-bridge

# Stop just the headless bridge (Foundry keeps running)
docker compose -f deploy/compose.yaml stop headless-bridge

# Restart after credential change
docker compose -f deploy/compose.yaml restart headless-bridge

# Check whether the bridge module is connected to foundry-mcp
curl http://localhost:8765/health   # requires port 8765 exposed; see README
# → {"ok":true,"foundryConnected":true,...}
```

### Behaviour during real sessions

When your primary GM account is active in a browser:

- The `bridge-gm` headless session remains connected in parallel.
- Both sessions share the same world state — actions taken by `bridge-gm` (via
  MCP tools) appear in your GM view in real time.
- Logging out of your GM browser does not affect the headless session.
- There is no conflict as long as the two users are different Foundry accounts.

### Caveats

- **World must be enabled for the bridge-gm user.** Foundry worlds can
  restrict which users can join. Verify in User Management that `bridge-gm`
  has Gamemaster access to the world specified by `BRIDGE_WORLD_ID`.
- **Foundry setup page selectors.** The login flow uses CSS selectors derived
  from Foundry v14's HTML. If Foundry's UI changes in a future version, the
  selectors in `apps/headless-bridge/src/foundry.ts` may need updating.
- **First-boot delay.** If the stack starts fresh (Foundry downloading its
  binaries), `headless-bridge` will fail and restart several times before
  Foundry is ready. This is expected — Docker's restart policy backs off
  exponentially and resumes once Foundry is reachable.

---

## CI / releases

Pushing a `v*` tag triggers `.github/workflows/release-image.yml`, which
builds and pushes all four images:

```
ghcr.io/alexdickerson/foundry-toolkit-foundry:<tag>       + :latest
ghcr.io/alexdickerson/foundry-toolkit-foundry-v13:<tag>   + :latest
ghcr.io/alexdickerson/foundry-toolkit-mcp:<tag>           + :latest
ghcr.io/alexdickerson/foundry-toolkit-portal:<tag>        + :latest
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

2. Your Foundry world data is in the `foundry-data` named volume. The compose
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
