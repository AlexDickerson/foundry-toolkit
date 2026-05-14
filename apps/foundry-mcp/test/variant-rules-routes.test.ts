import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod/v4';
import { openPf2eDb, closePf2eDb } from '@foundry-toolkit/db/pf2e';
import { registerVariantRulesRoutes } from '../src/http/routes/variant-rules.js';

const dbPath = join(tmpdir(), `vr-routes-test-${process.pid.toString()}.db`);

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      const suggestion = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      reply.code(400).send({ error: 'Invalid request parameters', suggestion });
      return;
    }
    reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  });
  registerVariantRulesRoutes(app);
  return app;
}

describe('variant-rules REST routes', () => {
  let app: FastifyInstance;

  before(() => {
    openPf2eDb(dbPath);
    app = makeApp();
  });

  after(() => {
    closePf2eDb();
  });

  it('GET returns 200 with all-false defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/variant-rules' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as Record<string, boolean>;
    assert.equal(body['freeArchetype'], false);
    assert.equal(body['ancestryParagon'], false);
    assert.equal(body['dualClass'], false);
    assert.equal(body['automaticBonusProgression'], false);
    assert.equal(body['proficiencyWithoutLevel'], false);
    assert.equal(body['gradualAbilityBoosts'], false);
  });

  it('PUT accepts a partial update and returns merged config', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/variant-rules',
      payload: { freeArchetype: true },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as Record<string, boolean>;
    assert.equal(body['freeArchetype'], true);
    assert.equal(body['ancestryParagon'], false);
  });

  it('PUT rejects unknown keys with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/variant-rules',
      payload: { freeArchetype: true, unknownRule: true },
    });
    assert.equal(res.statusCode, 400);
  });

  it('PUT rejects non-boolean values with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/variant-rules',
      payload: { freeArchetype: 'yes' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('PUT accepts all six known keys', async () => {
    const payload = {
      freeArchetype: true,
      ancestryParagon: true,
      dualClass: true,
      automaticBonusProgression: true,
      proficiencyWithoutLevel: true,
      gradualAbilityBoosts: true,
    };
    const res = await app.inject({ method: 'PUT', url: '/api/variant-rules', payload });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as typeof payload;
    assert.equal(body['freeArchetype'], true);
    assert.equal(body['gradualAbilityBoosts'], true);
  });

  it('GET reflects updates from PUT', async () => {
    await app.inject({ method: 'PUT', url: '/api/variant-rules', payload: { freeArchetype: false } });
    const res = await app.inject({ method: 'GET', url: '/api/variant-rules' });
    const body = JSON.parse(res.body) as Record<string, boolean>;
    assert.equal(body['freeArchetype'], false);
  });
});
