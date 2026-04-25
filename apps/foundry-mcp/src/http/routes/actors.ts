import type { FastifyInstance } from 'fastify';
import { sendCommand } from '../../bridge.js';
import {
  actorActionParams,
  actorIdParam,
  actorItemIdParams,
  actorTraceParams,
  addItemFromCompendiumBody,
  createActorBody,
  invokeActorActionBody,
  partyActorsQuery,
  updateActorBody,
  updateActorItemBody,
} from '../schemas.js';

export function registerActorRoutes(app: FastifyInstance): void {
  app.get('/api/actors', async () => sendCommand('get-actors'));

  /** Return player characters from the GM's party folder.
   *  Optional `?folder=` query param overrides the default folder name
   *  ("The Party") so GMs who renamed their folder don't need a code change. */
  app.get('/api/actors/party', async (req) => {
    const { folder } = partyActorsQuery.parse(req.query);
    return sendCommand('get-party-members', folder ? { folderName: folder } : {});
  });

  app.get('/api/actors/:id', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    return sendCommand('get-actor', { actorId: id });
  });

  app.get('/api/actors/:id/prepared', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    return sendCommand('get-prepared-actor', { actorId: id });
  });

  app.get('/api/actors/:id/trace/:slug', async (req) => {
    const { id, slug } = actorTraceParams.parse(req.params);
    return sendCommand('get-statistic-trace', { actorId: id, slug });
  });

  app.get('/api/actors/:id/items', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    return sendCommand('get-actor-items', { actorId: id });
  });

  // Character-creator wiring — the wizard creates a blank actor on
  // entry, patches it piecemeal as steps are filled, and leaves the
  // real actor in Foundry for the sheet view to reuse.
  app.post('/api/actors', async (req) => {
    const body = createActorBody.parse(req.body);
    return sendCommand('create-actor', body);
  });

  app.patch('/api/actors/:id', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    const body = updateActorBody.parse(req.body);
    return sendCommand('update-actor', { actorId: id, ...body });
  });

  app.post('/api/actors/:id/items/from-compendium', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    const body = addItemFromCompendiumBody.parse(req.body);
    return sendCommand('add-item-from-compendium', { actorId: id, ...body });
  });

  app.delete('/api/actors/:id/items/:itemId', async (req) => {
    const { id, itemId } = actorItemIdParams.parse(req.params);
    return sendCommand('delete-actor-item', { actorId: id, itemId });
  });

  app.patch('/api/actors/:id/items/:itemId', async (req) => {
    const { id, itemId } = actorItemIdParams.parse(req.params);
    const body = updateActorItemBody.parse(req.body);
    return sendCommand('update-actor-item', { actorId: id, itemId, ...body });
  });

  // Generic outbound-action dispatch. Routes `POST
  // /api/actors/:id/actions/:action` to the bridge's
  // `invoke-actor-action` command; the bridge looks `action` up in its
  // per-action handler registry (adjust-resource, adjust-condition,
  // roll-statistic, future craft/rest/strike/etc.). The body schema
  // stays loose on purpose — `params` is an `unknown` bag so new
  // actions land as a single handler entry, no new route, no new
  // command type.
  app.post('/api/actors/:id/actions/:action', async (req) => {
    const { id, action } = actorActionParams.parse(req.params);
    const { params } = invokeActorActionBody.parse(req.body ?? {});
    return sendCommand('invoke-actor-action', { actorId: id, action, params });
  });
}
