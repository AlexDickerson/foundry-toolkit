import type { ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

/**
 * Server-side predicate for the `/api/live/chat/:actorId/stream` and
 * `/api/live/chat/:actorId/recent` routes. Returns true if the message
 * should be delivered to a subscriber viewing `actorId`, identified as
 * `userId` (null when the caller didn't provide an identity).
 *
 * Rules (any match → include):
 *  1. Public: whisper list is empty.
 *  2. Speaker: the message was spoken/rolled by actorId.
 *  3. Whisper recipient: userId appears in the whisper list.
 *
 * Rule 4 (broadcast party-member rolls) is deferred — see the chat-relay
 * plan at ~/.claude/plans/read-only-investigation-plan-mode-delightful-perlis.md.
 */
export function messagePassesFilter(
  message: ChatMessageSnapshot,
  actorId: string,
  userId: string | null,
): boolean {
  if (message.whisper.length === 0) return true;
  if (message.speaker?.actor === actorId) return true;
  if (userId !== null && message.whisper.includes(userId)) return true;
  return false;
}
