import type { FastifyInstance } from 'fastify';
import { sendCommand } from '../../bridge.js';
import { compendiumCache } from '../compendium-cache-singleton.js';
import {
  compendiumSearchQuery,
  getCompendiumDocumentQuery,
  listCompendiumPacksQuery,
  listCompendiumSourcesQuery,
} from '../schemas.js';

export function registerCompendiumRoutes(app: FastifyInstance): void {
  app.get('/api/compendium/search', async (req) => {
    const { q, packId, documentType, traits, anyTraits, sources, ancestrySlug, maxLevel, limit } =
      compendiumSearchQuery.parse(req.query);

    // Serve from cache when every requested pack is warmed. Partial
    // hits fall through so the user doesn't see a surprising mix of
    // cached and bridge-sourced results.
    const cached = compendiumCache.search({
      ...(q !== undefined ? { q } : {}),
      ...(packId !== undefined ? { packIds: packId } : {}),
      ...(documentType !== undefined ? { documentType } : {}),
      ...(traits !== undefined ? { traits } : {}),
      ...(anyTraits !== undefined ? { anyTraits } : {}),
      ...(sources !== undefined ? { sources } : {}),
      ...(ancestrySlug !== undefined ? { ancestrySlug } : {}),
      ...(maxLevel !== undefined ? { maxLevel } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (cached) return cached;

    return sendCommand('find-in-compendium', {
      name: q ?? '',
      packId,
      documentType,
      traits,
      anyTraits,
      sources,
      ancestrySlug,
      maxLevel,
      limit,
    });
  });

  app.get('/api/compendium/packs', async (req) => {
    const { documentType } = listCompendiumPacksQuery.parse(req.query);
    return sendCommand('list-compendium-packs', { documentType });
  });

  app.get('/api/compendium/document', async (req) => {
    const { uuid } = getCompendiumDocumentQuery.parse(req.query);
    const cached = compendiumCache.getDocument(uuid);
    if (cached) return { document: cached };
    return sendCommand('get-compendium-document', { uuid });
  });

  app.get('/api/compendium/sources', async (req) => {
    const { documentType, packId, q, traits, maxLevel } = listCompendiumSourcesQuery.parse(req.query);
    return sendCommand('list-compendium-sources', {
      documentType,
      packId,
      name: q ?? '',
      traits,
      maxLevel,
    });
  });
}
