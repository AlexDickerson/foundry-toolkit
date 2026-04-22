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
    const parsed = compendiumSearchQuery.parse(req.query);
    const {
      q,
      packId,
      documentType,
      traits,
      anyTraits,
      sources,
      ancestrySlug,
      minLevel,
      maxLevel,
      rarities,
      sizes,
      creatureTypes,
      usageCategories,
      isMagical,
      hpMin,
      hpMax,
      acMin,
      acMax,
      fortMin,
      fortMax,
      refMin,
      refMax,
      willMin,
      willMax,
      limit,
    } = parsed;

    // Serve from cache when every requested pack is warmed. Partial
    // hits fall through so the user doesn't see a surprising mix of
    // cached and bridge-sourced results. The extended dm-tool filters
    // (rarity/size/creatureType/combat-stat ranges/etc.) are post-
    // filters over the warm cache — the bridge's find-in-compendium
    // doesn't know about them, so an uncached pack returns an
    // unfiltered response from the bridge. dm-tool's client can
    // narrow further on its side when it hits that fallback, but in
    // practice the bestiary/equipment packs are warmed at startup.
    const cached = compendiumCache.search({
      ...(q !== undefined ? { q } : {}),
      ...(packId !== undefined ? { packIds: packId } : {}),
      ...(documentType !== undefined ? { documentType } : {}),
      ...(traits !== undefined ? { traits } : {}),
      ...(anyTraits !== undefined ? { anyTraits } : {}),
      ...(sources !== undefined ? { sources } : {}),
      ...(ancestrySlug !== undefined ? { ancestrySlug } : {}),
      ...(minLevel !== undefined ? { minLevel } : {}),
      ...(maxLevel !== undefined ? { maxLevel } : {}),
      ...(rarities !== undefined ? { rarities } : {}),
      ...(sizes !== undefined ? { sizes } : {}),
      ...(creatureTypes !== undefined ? { creatureTypes } : {}),
      ...(usageCategories !== undefined ? { usageCategories } : {}),
      ...(isMagical !== undefined ? { isMagical } : {}),
      ...(hpMin !== undefined ? { hpMin } : {}),
      ...(hpMax !== undefined ? { hpMax } : {}),
      ...(acMin !== undefined ? { acMin } : {}),
      ...(acMax !== undefined ? { acMax } : {}),
      ...(fortMin !== undefined ? { fortMin } : {}),
      ...(fortMax !== undefined ? { fortMax } : {}),
      ...(refMin !== undefined ? { refMin } : {}),
      ...(refMax !== undefined ? { refMax } : {}),
      ...(willMin !== undefined ? { willMin } : {}),
      ...(willMax !== undefined ? { willMax } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (cached) return cached;

    // Bridge fallback carries the subset of filters the module's
    // FindInCompendiumHandler already understands. dm-tool-specific
    // filters that the bridge doesn't know about are dropped on the
    // floor here — acceptable because the path is only hit for
    // un-warmed packs, which dm-tool shouldn't be querying in steady
    // state.
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
