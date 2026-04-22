import type { FastifyInstance } from 'fastify';
import { buildOpenApiSpec } from '../openapi.js';

// Built once at registration time — the spec is deterministic from the
// imported schemas, and this endpoint is called rarely enough that we
// don't need per-request regeneration.
export function registerOpenApiRoutes(app: FastifyInstance): void {
  const spec = buildOpenApiSpec();

  app.get('/api/openapi.json', async (req, reply) => {
    // Prefer absolute URLs for the `servers` block when the client
    // reaches us via a reverse proxy (Fly, nginx). Clone so we don't
    // mutate the cached spec.
    const host = req.headers['x-forwarded-host'] ?? req.headers['host'];
    const proto = req.headers['x-forwarded-proto'] ?? (req.protocol || 'http');
    if (host) {
      const clone = { ...spec, servers: [{ url: `${String(proto)}://${String(host)}` }] };
      reply.type('application/json').send(clone);
      return;
    }
    reply.type('application/json').send(spec);
  });

  // Minimal Swagger UI page that loads the assets from jsDelivr. Keeps
  // the container image lean (no bundled UI) and avoids wiring another
  // plugin. Users who don't want the CDN dependency can hit
  // /api/openapi.json directly and feed it to their own viewer.
  app.get('/api/docs', async (_req, reply) => {
    reply.type('text/html').send(SWAGGER_HTML);
  });
}

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>foundry-mcp REST API</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body { margin: 0; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.addEventListener('load', () => {
        window.ui = SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
        });
      });
    </script>
  </body>
</html>
`;
