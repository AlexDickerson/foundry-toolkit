// Serves Foundry-hosted static assets (modules/, systems/, worlds/, etc.)
// to the foundry-mcp server over the WebSocket bridge.
//
// The bridge runs inside the GM's browser tab, which shares an origin with
// Foundry's built-in HTTP server. A plain `fetch()` with a root-relative path
// therefore reaches Foundry's file system without any additional config.
//
// foundry-mcp's GET /modules/* (and /systems/*, /icons/*, …) route calls this
// command and re-serves the response body to consumers (dm-tool renderer,
// player-portal). The mcp server caches hits indefinitely so each asset is
// only fetched once per server process lifetime.

interface FetchAssetParams {
  /** Root-relative Foundry asset path, e.g.
   *  `modules/pf2e-tokens-bestiaries/portraits/bestial/goblin.webp`.
   *  A leading slash is tolerated and stripped before the fetch. */
  path: string;
}

interface FetchAssetResult {
  ok: true;
  contentType: string;
  /** Asset body encoded as a base64 string. */
  bytes: string;
}

interface FetchAssetError {
  ok: false;
  status: number;
  error: string;
}

type FetchAssetResponse = FetchAssetResult | FetchAssetError;

export async function fetchAssetHandler(params: FetchAssetParams): Promise<FetchAssetResponse> {
  const rawPath = params.path;
  // Normalise: ensure a leading slash for the fetch, reject empty or
  // obviously malicious paths.
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (path === '/' || path.includes('..')) {
    return { ok: false, status: 400, error: `Invalid asset path: ${rawPath}` };
  }

  let response: Response;
  try {
    response = await fetch(path);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: `Asset not found: ${path} (${response.status.toString()})` };
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

  let bytes: string;
  try {
    const buffer = await response.arrayBuffer();
    // Spread-into-fromCharCode hits the JS max-argument limit for images
    // larger than ~65 KB. Process in 8 KB chunks instead.
    const uint8 = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < uint8.length; i += CHUNK) {
      binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
    }
    bytes = btoa(binary);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Failed to read asset body: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true, contentType, bytes };
}
