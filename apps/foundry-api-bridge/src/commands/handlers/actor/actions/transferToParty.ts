import type { ActionHandler, FoundryActor } from './types';
import { getFoundry } from './types';

export const transferToPartyAction: ActionHandler = async (actor: FoundryActor, params: Record<string, unknown>) => {
  const { itemId, targetActorId, quantity } = params;
  if (typeof itemId !== 'string') throw new Error('transferToParty: itemId (string) is required');
  if (typeof targetActorId !== 'string') throw new Error('transferToParty: targetActorId (string) is required');
  const qty = typeof quantity === 'number' && quantity > 0 ? Math.floor(quantity) : 1;

  const item = actor.items.get(itemId);
  if (!item) throw new Error(`transferToParty: item ${itemId} not found on actor ${actor.id}`);

  const target = getFoundry().game.actors.get(targetActorId);
  if (!target) throw new Error(`transferToParty: target actor ${targetActorId} not found`);

  if (typeof actor.transferItemToActor !== 'function') {
    throw new Error('transferToParty: transferItemToActor is not available on this actor type');
  }

  await actor.transferItemToActor(target, item, qty);
  return { ok: true };
};
