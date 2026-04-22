import '@foundry-toolkit/shared/env-auto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { PORT, HOST } from './config.js';
import { wss, isFoundryConnected } from './bridge.js';
import { log } from './logger.js';
import { registerTools } from './tools/index.js';
import { buildHttpApp } from './http/app.js';

// Fastify app — handles /api/*, /healthz, static SPA assets, and SPA
// fallback for unmatched GETs. Routed from the parent http.Server below.
const httpApp = await buildHttpApp();

// ---------------------------------------------------------------------------
// Session management — one transport + McpServer per MCP client
// ---------------------------------------------------------------------------

const sessions = new Map<string, StreamableHTTPServerTransport>();

async function createSession(): Promise<StreamableHTTPServerTransport> {
  const mcp = new McpServer({ name: 'foundry-mcp', version: '0.1.0' });
  registerTools(mcp);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      log.info(`MCP session created: ${sessionId}`);
      sessions.set(sessionId, transport);
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
      log.info(`MCP session closed: ${sid}`);
    }
  };

  await mcp.connect(transport);
  return transport;
}

// ---------------------------------------------------------------------------
// HTTP Server — routes MCP traffic and Foundry WS upgrades. Everything else
// falls through to the Fastify app (/api/*, /healthz, SPA assets, fallback).
// ---------------------------------------------------------------------------

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Strip query string for path-only matching.
  const path = (req.url ?? '').split('?')[0] ?? '';

  // MCP Streamable HTTP endpoint. Previously `/` was also accepted as a
  // convenience alias; dropped now so the SPA can live at the root path.
  if (path === '/mcp') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else if (!sessionId) {
      transport = await createSession();
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session ID' }, id: null }));
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      log.error(`MCP transport error: ${err}`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
    return;
  }

  // Server logs (legacy).
  if (path.startsWith('/logs')) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const n = parseInt(url.searchParams.get('n') ?? '50', 10);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(log.tail(n)));
    return;
  }

  // Rich health probe — keeps bridge/session state. `/healthz` (the
  // lightweight container probe) is handled inside the Fastify app.
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        foundryConnected: isFoundryConnected(),
        activeSessions: sessions.size,
      }),
    );
    return;
  }

  // Everything else — /api/*, /healthz, static SPA assets, SPA fallback —
  // goes through Fastify.
  httpApp.routing(req, res);
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/foundry')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, HOST, () => {
  log.info(`foundry-mcp server listening on ${HOST}:${PORT}`);
  log.info(`  MCP endpoint: http://${HOST}:${PORT}/mcp`);
  log.info(`  REST API:     http://${HOST}:${PORT}/api/`);
  log.info(`  Foundry WS:   ws://${HOST}:${PORT}/foundry`);
  log.info(`  Health:       http://${HOST}:${PORT}/health (rich) and /healthz (probe)`);
  log.info(`  Logs:         http://${HOST}:${PORT}/logs`);
  log.info(`  SPA:          http://${HOST}:${PORT}/`);
});
