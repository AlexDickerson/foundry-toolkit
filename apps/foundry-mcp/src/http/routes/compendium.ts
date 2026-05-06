import type { FastifyInstance } from 'fastify';
import type { CompendiumFacets } from '@foundry-toolkit/shared/foundry-api';
import {
  createCompendiumItemBody,
  ensureCompendiumPackBody,
  type CreateCompendiumItemResponse,
  type EnsureCompendiumPackResponse,
} from '@foundry-toolkit/shared/rpc';
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
      offset,
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
      ...(offset !== undefined ? { offset } : {}),
    });
    if (cached) return cached;

    // Bridge fallback carries the subset of filters the module's
    // FindInCompendiumHandler already understands. dm-tool-specific
    // filters that the bridge doesn't know about are dropped on the
    // floor here — acceptable because the path is only hit for
    // un-warmed packs, which dm-tool shouldn't be querying in steady
    // state.
    //
    // The bridge has no offset support; pagination always starts at
    // page 0 on the fallback path. `total` is set to the match count
    // so the caller doesn't attempt a second page.
    const bridgeResult = (await sendCommand('find-in-compendium', {
      name: q ?? '',
      packId,
      documentType,
      traits,
      anyTraits,
      sources,
      ancestrySlug,
      maxLevel,
      limit,
    })) as { matches: unknown[] };
    const bridgeMatches = Array.isArray(bridgeResult.matches) ? bridgeResult.matches : [];
    return { matches: bridgeMatches, total: bridgeMatches.length };
  });

  app.get('/api/compendium/packs', async (req) => {
    const { documentType } = listCompendiumPacksQuery.parse(req.query);
    return sendCommand('list-compendium-packs', { documentType });
  });

  app.get('/api/compendium/document', async (req) => {
    const { uuid } = getCompendiumDocumentQuery.parse(req.query);
    // Always fetch from the bridge — the warm cache stores pack docs from
    // the bulk dump which omits embedded `items` (spells, abilities, feats).
    // Consumers that need single-doc caching (dm-tool) handle it themselves
    // with their own TTL-bound SQLite cache. Going direct ensures `items`
    // is always present in the response.
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

  // Idempotent create-or-reuse of a world compendium pack. Used by
  // dm-tool's homebrew-item editor to lazily provision the target pack
  // on the first save. The bridge handler is the source of truth for
  // the `world.<name>` id composition and type validation.
  app.post('/api/compendium/packs/ensure', async (req): Promise<EnsureCompendiumPackResponse> => {
    const body = ensureCompendiumPackBody.parse(req.body);
    const result = (await sendCommand('ensure-compendium-pack', {
      name: body.name,
      label: body.label,
      ...(body.type !== undefined ? { type: body.type } : {}),
    })) as EnsureCompendiumPackResponse;
    log.info(
      `compendium-ensure: ${result.created ? 'created' : 'reused'} pack ${result.id} ` +
        `(label="${result.label}", type=${result.type})`,
    );
    return result;
  });

  // Create a single Item document inside a world pack. The pack must
  // already exist (call /api/compendium/packs/ensure first) and must
  // be an Item pack — the bridge errors otherwise. The dm-tool editor
  // strips identity fields (`_id`, `_stats`, embedded `_id`s) before
  // posting so the payload is always a fresh document.
  app.post('/api/compendium/items', async (req): Promise<CreateCompendiumItemResponse> => {
    const body = createCompendiumItemBody.parse(req.body);
    const result = (await sendCommand('create-compendium-item', body)) as CreateCompendiumItemResponse;
    log.info(`compendium-create-item: ${result.uuid} (name="${result.name}", type=${result.type})`);
    return result;
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
