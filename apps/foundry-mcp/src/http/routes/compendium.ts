import type { FastifyInstance } from 'fastify';
import type { CompendiumFacets } from '@foundry-toolkit/shared/foundry-api';
import { sendCommand } from '../../bridge.js';
import { log } from '../../logger.js';
import { compendiumCache } from '../compendium-cache-singleton.js';
import {
  compendiumSearchQuery,
  getCompendiumDocumentQuery,
  listCompendiumFacetsQuery,
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

  // Pre-aggregated facets for the Monster/Item Browser sidebars. Served
  // from the warm cache — any requested pack that isn't warm triggers a
  // synchronous warm, logged loudly so a misconfigured
  // COMPENDIUM_CACHE_PACK_IDS surfaces in ops.
  app.get('/api/compendium/facets', async (req) => {
    const { documentType, packId } = listCompendiumFacetsQuery.parse(req.query);
    const opts = {
      ...(documentType !== undefined ? { documentType } : {}),
      ...(packId !== undefined ? { packIds: packId } : {}),
    };
    let facets = compendiumCache.facets(opts);
    if (facets === null) {
      const ids = packId ?? [];
      for (const id of ids) {
        if (!compendiumCache.hasPack(id)) {
          log.warn(`compendium-cache: facets cold-call warming ${id}`);
          await compendiumCache.warmPack(id);
        }
      }
      facets = compendiumCache.facets(opts) ?? emptyFacets();
    }
    return facets;
  });
}

function emptyFacets(): CompendiumFacets {
  return {
    rarities: [],
    sizes: [],
    creatureTypes: [],
    traits: [],
    sources: [],
    usageCategories: [],
    levelRange: null,
  };
}
