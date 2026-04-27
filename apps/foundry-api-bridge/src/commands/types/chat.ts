/** Chat message command params and results. */

export interface SendChatMessageParams {
  content: string;
  speaker?: string;
  actorId?: string;
  flavor?: string;
  whisperTo?: string[];
  type?: 'ic' | 'ooc' | 'emote';
}

export interface SendChatMessageResult {
  messageId: string;
  sent: boolean;
}
