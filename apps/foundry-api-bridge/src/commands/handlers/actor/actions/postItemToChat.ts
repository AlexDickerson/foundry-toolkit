import type { InvokeActorActionResult } from '@/commands/types';
import type { FoundryActor } from './types';

// Posts an owned item's action card to chat — mirrors the pf2e sheet's
// "send to chat" button on an action / reaction / free action.
// Consumable charge consumption is left to whoever clicks the roll
// buttons inside the posted card. Distinct from the typed `use-item`
// command, which runs the full activation pipeline (activities,
// scaling, auto-consume) and has its own MCP/IPC consumers.

export async function postItemToChatAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const itemId = params['itemId'];
  if (typeof itemId !== 'string' || itemId.length === 0) {
    throw new Error('post-item-to-chat: params.itemId is required');
  }
  const item = actor.items.get(itemId);
  if (!item) {
    throw new Error(`post-item-to-chat: item ${itemId} not found on actor ${actor.id}`);
  }
  await item.toMessage();
  return { ok: true, itemId: item.id, itemName: item.name };
}
