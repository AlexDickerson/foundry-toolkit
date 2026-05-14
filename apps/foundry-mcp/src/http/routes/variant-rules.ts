import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getVariantRules, setVariantRules, KNOWN_VARIANT_RULE_KEYS, isPf2eDbOpen } from '@foundry-toolkit/db/pf2e';
import { log } from '../../logger.js';

// All known keys must be booleans. Extra keys are rejected by .strict().
const variantRulesBody = z
  .object({
    freeArchetype: z.boolean().optional(),
    ancestryParagon: z.boolean().optional(),
    dualClass: z.boolean().optional(),
    automaticBonusProgression: z.boolean().optional(),
    proficiencyWithoutLevel: z.boolean().optional(),
    gradualAbilityBoosts: z.boolean().optional(),
  })
  .strict();

export function registerVariantRulesRoutes(app: FastifyInstance): void {
  app.get('/api/variant-rules', async (_req, reply) => {
    if (!isPf2eDbOpen()) {
      reply.code(503).send({ error: 'Database not configured' });
      return;
    }
    return getVariantRules();
  });

  app.put('/api/variant-rules', async (req, reply) => {
    if (!isPf2eDbOpen()) {
      reply.code(503).send({ error: 'Database not configured' });
      return;
    }

    // Belt-and-suspenders: explicitly reject unknown keys before Zod
    // strict() fires so the error message names the offending key.
    if (req.body !== null && typeof req.body === 'object') {
      const unknown = Object.keys(req.body as object).filter((k) => !KNOWN_VARIANT_RULE_KEYS.has(k));
      if (unknown.length > 0) {
        reply.code(400).send({ error: `Unknown variant rule keys: ${unknown.join(', ')}` });
        return;
      }
    }

    const patch = variantRulesBody.parse(req.body);
    const current = getVariantRules();
    const next = { ...current, ...patch };
    setVariantRules(next);
    log.info(`variant-rules updated: ${JSON.stringify(patch)}`);
    return next;
  });
}
