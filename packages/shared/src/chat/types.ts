export type ChatModel = 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001' | 'claude-opus-4-6';

/** Single source of truth for the Claude model used by @foundry-toolkit/ai agents
 *  and the renderer's picker default. Downstream constants files re-export
 *  this under their own names (DEFAULT_MODEL, DEFAULT_CHAT_MODEL). */
export const DEFAULT_CHAT_MODEL: ChatModel = 'claude-sonnet-4-6';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatChunk {
  type: 'delta' | 'done' | 'error' | 'tool-status';
  text?: string;
  error?: string;
}

export interface AonCreaturePreview {
  type: 'creature';
  name: string;
  level: number;
  hp: number;
  ac: number;
  fortitude: number;
  reflex: number;
  will: number;
  perception: number;
  speed: string;
  size: string;
  traits: string[];
  abilities: string[];
  immunities: string[];
  weaknesses: string;
  rarity: string;
  summary: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  /** Raw stat block text — everything after the first `---` separator. */
  statBlock: string;
}

export interface AonGenericPreview {
  type: 'generic';
  name: string;
  category: string;
  text: string;
}

export type AonPreviewData = AonCreaturePreview | AonGenericPreview;
