# tagger

Python map-indexing subtool — not an npm workspace. See parent [CLAUDE.md](../CLAUDE.md) for monorepo context.

## Build locally

From `tagger/`:

```bat
.\build.bat
```

Produces `tagger/dist/map-tagger.exe` via Nuitka. Requires Python 3.11+. First build is slow (Nuitka downloads a C runtime and compiles); subsequent builds reuse the cache.

## Release pipeline

Releases are tag-driven via `.github/workflows/release-tagger.yml`. Push a `tagger-v*` tag to trigger a build on `windows-latest` and publish the exe as a GitHub Release asset.

**To cut a release:**

```bash
git tag tagger-v0.2.0
git push origin tagger-v0.2.0
```

The workflow builds with the same Nuitka flags as `build.bat` and attaches `map-tagger-<version>.exe` plus a SHA256 sidecar to the release.

Current version: `[project] version` in `pyproject.toml` (currently `0.1.0`).

The `tagger-v*` tag prefix is intentionally distinct from `v*`, which the `release-image.yml` workflow uses for Docker image releases.

## dm-tool packaging

`apps/dm-tool/package.json` references `../../tagger/dist/map-tagger.exe` as `extraResources` for electron-builder. That path must exist at `npm run package` / `package:ci` time.

- **Local dev packaging** — run `.\build.bat` in `tagger/` first.
- **Clean packaging (no Python required)** — pull the latest release exe with the fetch script:
  - Windows (PowerShell): `.\tagger\scripts\fetch-release.ps1`
  - Mac/Linux (bash): `./tagger/scripts/fetch-release.sh`

Both scripts require the `gh` CLI (`https://cli.github.com/`) with an active `gh auth login`.
