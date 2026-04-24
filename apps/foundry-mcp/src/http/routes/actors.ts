import type { FastifyInstance } from 'fastify';
import { sendCommand } from '../../bridge.js';
import {
  actorIdParam,
  actorItemIdParams,
  actorTraceParams,
  addItemFromCompendiumBody,
  adjustActorConditionBody,
  adjustActorResourceBody,
  createActorBody,
  updateActorBody,
  updateActorItemBody,
} from '../schemas.js';

export function registerActorRoutes(app: FastifyInstance): void {
  app.get('/api/actors', async () => sendCommand('get-actors'));

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

  // Stepper for numeric resources (HP, temp HP, hero points, focus
  // points). Body picks the field; positive delta heals / grants,
  // negative damages / spends. The bridge clamps into [0, max] and
  // reports `{before, after, max}` so clients don't have to
  // refetch the prepared actor just to update a pip display.
  app.post('/api/actors/:id/resources/adjust', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    const body = adjustActorResourceBody.parse(req.body);
    return sendCommand('adjust-actor-resource', { actorId: id, ...body });
  });

  // Stepper for PF2e persistent-count conditions (dying, wounded,
  // doomed). Positive delta = apply N stacks via increaseCondition;
  // negative = peel N stacks via decreaseCondition. Handler goes
  // through PF2e's condition API rather than raw updates, so the
  // system's cascade behaviour (dying → wounded, auto-death at cap)
  // stays intact.
  app.post('/api/actors/:id/conditions/adjust', async (req) => {
    const { id } = actorIdParam.parse(req.params);
    const body = adjustActorConditionBody.parse(req.body);
    return sendCommand('adjust-actor-condition', { actorId: id, ...body });
  });
}
