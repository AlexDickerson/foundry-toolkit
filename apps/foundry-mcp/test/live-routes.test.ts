import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod/v4';
import { LiveDb } from '../src/db/live-db.js';
import { registerLiveRoutes } from '../src/http/routes/live.js';
import type { AurusSnapshot, GlobeSnapshot, InventorySnapshot } from '@foundry-toolkit/shared/rpc';

// ─── helpers ───────────────────────────────────────────────────────────────

const SECRET = 'test-secret';

function makeApp(opts: { secret?: string } = {}): { app: FastifyInstance; db: LiveDb } {
  const db = new LiveDb(':memory:');
  const app = Fastify({ logger: false });
  // Mirror the ZodError → 400 error handler from src/http/app.ts.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      const suggestion = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      reply.code(400).send({ error: 'Invalid request parameters', suggestion });
      return;
    }
    reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  });
  registerLiveRoutes(app, db, opts.secret);
  return { app, db };
}

const inventoryFixture: InventorySnapshot = {
  items: [
    {
      id: 'item-1',
      name: 'Potion of Healing',
      qty: 2,
      category: 'consumable',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-03-01T00:00:00.000Z',
    },
  ],
  updatedAt: '2024-03-01T00:00:00.000Z',
};

const aurusFixture: AurusSnapshot = {
  teams: [
    {
      id: 'team-1',
      name: 'The Harrow',
      color: '#c0392b',
      combatPower: 8,
      valueReclaimedCp: 100000,
      isPlayerParty: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-03-01T00:00:00.000Z',
    },
  ],
  updatedAt: '2024-03-01T00:00:00.000Z',
};

const globeFixture: GlobeSnapshot = {
  pins: [
    {
      id: 'pin-1',
      lng: 15.5,
      lat: -23.1,
      label: 'Absalom',
      icon: 'city',
      zoom: 4,
      note: 'Capital city',
      kind: 'note',
    },
  ],
  updatedAt: '2024-03-01T00:00:00.000Z',
};

// ─── LiveDb unit tests ─────────────────────────────────────────────────────

describe('LiveDb — in-memory persistence', () => {
  it('getInventory returns an empty snapshot before any write', () => {
    const db = new LiveDb(':memory:');
    const snap = db.getInventory();
    assert.deepEqual(snap.items, []);
    assert.ok(snap.updatedAt, 'updatedAt must be set');
    db.close();
  });

  it('setInventory persists and getInventory retrieves it', () => {
    const db = new LiveDb(':memory:');
    db.setInventory(inventoryFixture);
    const snap = db.getInventory();
    assert.deepEqual(snap, inventoryFixture);
    db.close();
  });

  it('setInventory round-trips via JSON serialization', () => {
    const db = new LiveDb(':memory:');
    db.setInventory(inventoryFixture);
    const snap = db.getInventory();
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), inventoryFixture);
    db.close();
  });

  it('second setInventory overwrites the first (single-row semantics)', () => {
    const db = new LiveDb(':memory:');
    db.setInventory(inventoryFixture);
    const v2: InventorySnapshot = { items: [], updatedAt: '2024-04-01T00:00:00.000Z' };
    db.setInventory(v2);
    const snap = db.getInventory();
    assert.equal(snap.items.length, 0);
    assert.equal(snap.updatedAt, v2.updatedAt);
    db.close();
  });

  it('subscribeInventory callback is called synchronously on setInventory', () => {
    const db = new LiveDb(':memory:');
    const received: InventorySnapshot[] = [];
    db.subscribeInventory((s) => received.push(s));
    db.setInventory(inventoryFixture);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], inventoryFixture);
    db.close();
  });

  it('subscribeInventory unsubscribe stops further calls', () => {
    const db = new LiveDb(':memory:');
    const received: InventorySnapshot[] = [];
    const unsub = db.subscribeInventory((s) => received.push(s));
    unsub();
    db.setInventory(inventoryFixture);
    assert.equal(received.length, 0);
    db.close();
  });

  it('getAurus returns empty snapshot before any write', () => {
    const db = new LiveDb(':memory:');
    assert.deepEqual(db.getAurus().teams, []);
    db.close();
  });

  it('setAurus / getAurus round-trips', () => {
    const db = new LiveDb(':memory:');
    db.setAurus(aurusFixture);
    assert.deepEqual(db.getAurus(), aurusFixture);
    db.close();
  });

  it('subscribeAurus fires on setAurus', () => {
    const db = new LiveDb(':memory:');
    const received: AurusSnapshot[] = [];
    db.subscribeAurus((s) => received.push(s));
    db.setAurus(aurusFixture);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], aurusFixture);
    db.close();
  });

  it('getGlobe returns empty snapshot before any write', () => {
    const db = new LiveDb(':memory:');
    assert.deepEqual(db.getGlobe().pins, []);
    db.close();
  });

  it('setGlobe / getGlobe round-trips', () => {
    const db = new LiveDb(':memory:');
    db.setGlobe(globeFixture);
    assert.deepEqual(db.getGlobe(), globeFixture);
    db.close();
  });

  it('subscribeGlobe fires on setGlobe', () => {
    const db = new LiveDb(':memory:');
    const received: GlobeSnapshot[] = [];
    db.subscribeGlobe((s) => received.push(s));
    db.setGlobe(globeFixture);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], globeFixture);
    db.close();
  });

  it('multiple subscribers all receive the broadcast', () => {
    const db = new LiveDb(':memory:');
    const calls: string[] = [];
    db.subscribeInventory(() => calls.push('a'));
    db.subscribeInventory(() => calls.push('b'));
    db.setInventory(inventoryFixture);
    assert.deepEqual(calls, ['a', 'b']);
    db.close();
  });
});

// ─── GET /api/live/* ───────────────────────────────────────────────────────

describe('GET /api/live/inventory', () => {
  it('returns 200 with an empty snapshot before any write', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/live/inventory' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as InventorySnapshot;
    assert.deepEqual(body.items, []);
    assert.ok(body.updatedAt);
  });

  it('returns the stored snapshot after a write', async () => {
    const { app, db } = makeApp();
    db.setInventory(inventoryFixture);
    const res = await app.inject({ method: 'GET', url: '/api/live/inventory' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.payload), inventoryFixture);
  });
});

describe('GET /api/live/aurus', () => {
  it('returns 200 with empty snapshot', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/live/aurus' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((JSON.parse(res.payload) as AurusSnapshot).teams, []);
  });
});

describe('GET /api/live/globe', () => {
  it('returns 200 with empty snapshot', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/live/globe' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((JSON.parse(res.payload) as GlobeSnapshot).pins, []);
  });
});

// ─── POST /api/live/* — auth ───────────────────────────────────────────────

describe('POST /api/live/inventory — auth', () => {
  it('returns 401 when secret is set and no Authorization header provided', async () => {
    const { app } = makeApp({ secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(inventoryFixture),
    });
    assert.equal(res.statusCode, 401);
  });

  it('returns 401 when secret is set and the wrong token is provided', async () => {
    const { app } = makeApp({ secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-secret' },
      payload: JSON.stringify(inventoryFixture),
    });
    assert.equal(res.statusCode, 401);
  });

  it('returns 200 and persists when the correct token is provided', async () => {
    const { app, db } = makeApp({ secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      payload: JSON.stringify(inventoryFixture),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.payload), inventoryFixture);
    assert.deepEqual(db.getInventory(), inventoryFixture);
  });

  it('returns 200 without auth check when no secret is configured', async () => {
    const { app } = makeApp({ secret: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(inventoryFixture),
    });
    assert.equal(res.statusCode, 200);
  });

  it('returns 400 for an invalid body (missing items)', async () => {
    const { app } = makeApp({ secret: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ updatedAt: '2024-01-01T00:00:00.000Z' }),
    });
    assert.equal(res.statusCode, 400);
  });
});

// ─── POST /api/live/* — persistence + broadcast ────────────────────────────

describe('POST /api/live/inventory — persistence and broadcast', () => {
  it('GET after POST returns the posted snapshot', async () => {
    const { app } = makeApp({ secret: undefined });
    await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(inventoryFixture),
    });
    const res = await app.inject({ method: 'GET', url: '/api/live/inventory' });
    assert.deepEqual(JSON.parse(res.payload), inventoryFixture);
  });

  it('POST broadcasts to subscribeInventory listeners', async () => {
    const { app, db } = makeApp({ secret: undefined });
    const received: InventorySnapshot[] = [];
    db.subscribeInventory((s) => received.push(s));

    await app.inject({
      method: 'POST',
      url: '/api/live/inventory',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(inventoryFixture),
    });

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], inventoryFixture);
  });
});

describe('POST /api/live/aurus', () => {
  it('stores and returns the aurus snapshot', async () => {
    const { app } = makeApp({ secret: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/aurus',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(aurusFixture),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.payload), aurusFixture);
  });

  it('returns 401 when secret is set and missing', async () => {
    const { app } = makeApp({ secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/aurus',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(aurusFixture),
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('POST /api/live/globe', () => {
  it('stores and returns the globe snapshot', async () => {
    const { app } = makeApp({ secret: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/globe',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(globeFixture),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.payload), globeFixture);
  });

  it('returns 401 when secret is set and missing', async () => {
    const { app } = makeApp({ secret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/api/live/globe',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(globeFixture),
    });
    assert.equal(res.statusCode, 401);
  });
});
