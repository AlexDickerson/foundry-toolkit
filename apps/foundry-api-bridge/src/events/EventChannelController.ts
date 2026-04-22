import type { WebSocketClient } from '@/transport/WebSocketClient';

// Minimal local Foundry type snippets for the documents we read in hook
// callbacks. Kept here rather than pulled from shared types because
// these are read-only event-time shapes, not the CRUD-oriented types
// in commands/handlers/combat/combatTypes.

interface FoundryDieResult {
  result: number;
  active: boolean;
}

interface FoundryDiceTerm {
  faces: number;
  results: FoundryDieResult[];
}

interface FoundryRollInMessage {
  total: number;
  formula: string;
  isCritical?: boolean;
  isFumble?: boolean;
  dice?: FoundryDiceTerm[];
}

interface FoundryAuthor {
  id: string;
  name: string;
}

interface FoundrySpeaker {
  alias?: string;
  actor?: string;
  scene?: string;
  token?: string;
}

interface FoundryChatMessage {
  id: string;
  uuid?: string;
  content?: string;
  isRoll: boolean;
  type?: number;
  timestamp?: number;
  whisper?: string[];
  rolls?: FoundryRollInMessage[];
  author?: FoundryAuthor;
  speaker?: FoundrySpeaker;
  flavor?: string;
  flags?: Record<string, unknown>;
}

interface CombatantForEvent {
  id: string;
  uuid?: string;
  initiative: number | null;
  defeated: boolean;
}

interface CombatantWithParent extends CombatantForEvent {
  combat: { id: string } | null;
}

interface CombatForEvent {
  id: string;
  round: number;
  turn: number;
  combatants: { map<T>(fn: (c: CombatantForEvent) => T): T[] };
}

type HookCallback = (...args: unknown[]) => void;

interface FoundryHooks {
  on(hook: string, fn: HookCallback): number;
  off(hook: string, id: number): void;
}

declare const Hooks: FoundryHooks;

interface HookHandle {
  name: string;
  id: number;
}

// Channels currently supported. Keep in sync with `EVENT_CHANNELS` in
// the server's http/schemas.ts — the server rejects SSE requests for
// channels that don't appear there, and the module ignores
// `set-event-subscription` for channels it doesn't switch on below.
const KNOWN_CHANNELS = new Set(['rolls', 'chat', 'combat']);

/**
 * Owns Foundry Hook registrations for every active event channel. The
 * server's ChannelManager calls `enable` on 0→1 subscriber transitions
 * and `disable` on 1→0, so Hook callbacks exist only while somebody is
 * listening. `createChatMessage` is shared between the rolls and chat
 * channels and torn down only when both go idle.
 */
export class EventChannelController {
  private readonly active = new Set<string>();
  private readonly hookHandles = new Map<string, HookHandle[]>();
  private chatMsgHookHandle: number | null = null;

  constructor(private readonly wsClient: WebSocketClient) {}

  enable(channel: string): void {
    if (this.active.has(channel)) return;
    if (!KNOWN_CHANNELS.has(channel)) {
      console.warn(`Foundry API Bridge | Unknown event channel: ${channel}`);
      return;
    }
    this.active.add(channel);

    const handles: HookHandle[] = [];

    switch (channel) {
      case 'rolls':
        this.ensureChatMsgHook();
        break;

      case 'chat':
        this.ensureChatMsgHook();
        handles.push(
          this.reg('deleteChatMessage', (raw) => {
            if (!isFoundryChatMessage(raw)) return;
            this.wsClient.pushEvent('chat', { eventType: 'delete', data: { id: raw.id } });
          }),
        );
        handles.push(
          this.reg('updateChatMessage', (raw) => {
            if (!isFoundryChatMessage(raw)) return;
            this.wsClient.pushEvent('chat', { eventType: 'update', data: serializeChatMessage(raw) });
          }),
        );
        break;

      case 'combat': {
        const combatPush =
          (eventType: 'start' | 'turn' | 'round') =>
          (raw: unknown): void => {
            if (!isFoundryCombat(raw)) return;
            this.wsClient.pushEvent('combat', { eventType, ...serializeCombat(raw) });
          };
        handles.push(this.reg('combatStart', combatPush('start')));
        handles.push(this.reg('combatTurn', combatPush('turn')));
        handles.push(this.reg('combatRound', combatPush('round')));
        handles.push(
          this.reg('createCombatant', (raw) => {
            if (!isCombatantWithParent(raw) || !raw.combat) return;
            this.wsClient.pushEvent('combat', {
              eventType: 'combatant-add',
              encounterId: raw.combat.id,
              combatant: serializeCombatant(raw),
            });
          }),
        );
        handles.push(
          this.reg('deleteCombatant', (raw) => {
            if (!isCombatantWithParent(raw) || !raw.combat) return;
            this.wsClient.pushEvent('combat', {
              eventType: 'combatant-remove',
              encounterId: raw.combat.id,
              combatant: serializeCombatant(raw),
            });
          }),
        );
        handles.push(
          this.reg('deleteCombat', (raw) => {
            if (!isFoundryCombat(raw)) return;
            this.wsClient.pushEvent('combat', { eventType: 'end', encounterId: raw.id });
          }),
        );
        break;
      }
    }

    if (handles.length > 0) {
      this.hookHandles.set(channel, handles);
    }
    console.log(`Foundry API Bridge | Event channel enabled: ${channel}`);
  }

  disable(channel: string): void {
    if (!this.active.has(channel)) return;
    this.active.delete(channel);

    const handles = this.hookHandles.get(channel);
    if (handles) {
      for (const { name, id } of handles) {
        Hooks.off(name, id);
      }
      this.hookHandles.delete(channel);
    }

    // `createChatMessage` is shared by rolls and chat. Tear down only
    // when both channels have gone idle.
    if (
      (channel === 'rolls' || channel === 'chat') &&
      !this.active.has('rolls') &&
      !this.active.has('chat') &&
      this.chatMsgHookHandle !== null
    ) {
      Hooks.off('createChatMessage', this.chatMsgHookHandle);
      this.chatMsgHookHandle = null;
    }

    console.log(`Foundry API Bridge | Event channel disabled: ${channel}`);
  }

  private reg(name: string, fn: HookCallback): HookHandle {
    return { name, id: Hooks.on(name, fn) };
  }

  private ensureChatMsgHook(): void {
    if (this.chatMsgHookHandle !== null) return;
    this.chatMsgHookHandle = Hooks.on('createChatMessage', (raw: unknown) => {
      if (!isFoundryChatMessage(raw)) return;
      this.handleChatMessage(raw);
    });
  }

  private handleChatMessage(message: FoundryChatMessage): void {
    if (this.active.has('rolls')) {
      const roll = message.rolls?.[0];
      if (message.isRoll && roll) {
        this.wsClient.pushEvent('rolls', serializeRoll(message, roll));
      }
    }
    if (this.active.has('chat')) {
      this.wsClient.pushEvent('chat', { eventType: 'create', data: serializeChatMessage(message) });
    }
  }
}

// ---- Serializers --------------------------------------------------------

function serializeChatMessage(m: FoundryChatMessage): Record<string, unknown> {
  return {
    id: m.id,
    uuid: m.uuid ?? null,
    content: m.content ?? '',
    speaker: m.speaker ?? null,
    timestamp: m.timestamp ?? null,
    whisper: m.whisper ?? [],
    type: m.type ?? null,
    author: m.author ? { id: m.author.id, name: m.author.name } : null,
    flavor: m.flavor ?? '',
    isRoll: m.isRoll,
    rolls:
      m.rolls?.map((r) => ({
        formula: r.formula,
        total: r.total,
        isCritical: r.isCritical ?? false,
        isFumble: r.isFumble ?? false,
        dice:
          r.dice?.map((d) => ({
            faces: d.faces,
            results: d.results.map((x) => ({ result: x.result, active: x.active })),
          })) ?? [],
      })) ?? [],
    flags: m.flags ?? {},
  };
}

function serializeRoll(m: FoundryChatMessage, r: FoundryRollInMessage): Record<string, unknown> {
  return {
    id: m.id,
    messageId: m.id,
    user: m.author ? { id: m.author.id, name: m.author.name } : null,
    speaker: m.speaker ?? null,
    flavor: m.flavor ?? '',
    rollTotal: r.total,
    formula: r.formula,
    isCritical: r.isCritical ?? false,
    isFumble: r.isFumble ?? false,
    dice:
      r.dice?.map((d) => ({
        faces: d.faces,
        results: d.results.map((x) => ({ result: x.result, active: x.active })),
      })) ?? [],
    timestamp: Date.now(),
  };
}

function serializeCombat(c: CombatForEvent): Record<string, unknown> {
  return {
    encounterId: c.id,
    round: c.round,
    turn: c.turn,
    combatants: c.combatants.map((cb) => ({
      id: cb.id,
      uuid: cb.uuid ?? null,
      initiative: cb.initiative,
      defeated: cb.defeated,
    })),
  };
}

function serializeCombatant(cb: CombatantForEvent): Record<string, unknown> {
  return {
    id: cb.id,
    uuid: cb.uuid ?? null,
    initiative: cb.initiative,
    defeated: cb.defeated,
  };
}

// ---- Type guards --------------------------------------------------------

function isFoundryChatMessage(value: unknown): value is FoundryChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['id'] === 'string' && typeof obj['isRoll'] === 'boolean';
}

function isFoundryCombat(value: unknown): value is CombatForEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['round'] === 'number' &&
    typeof obj['turn'] === 'number' &&
    typeof obj['combatants'] === 'object' &&
    obj['combatants'] !== null
  );
}

function isCombatantWithParent(value: unknown): value is CombatantWithParent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['id'] !== 'string') return false;
  if (!(typeof obj['initiative'] === 'number' || obj['initiative'] === null)) return false;
  if (typeof obj['defeated'] !== 'boolean') return false;
  // `combat` may be null for a combatant mid-creation; the caller
  // checks before pushing.
  return true;
}
