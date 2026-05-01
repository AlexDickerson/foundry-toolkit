import type { EventPublisher } from '@/transport/Broadcaster';

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

// Used for updateCombatant — includes actorId so dm-tool can match
// the Foundry combatant back to its local Combatant by foundryActorId.
interface CombatantUpdateForEvent {
  id: string;
  actorId: string;
  initiative: number | null;
  defeated: boolean;
  combat: { id: string } | null;
}

interface CombatForEvent {
  id: string;
  round: number;
  turn: number;
  combatants: { map<T>(fn: (c: CombatantForEvent) => T): T[] };
}

interface FoundryActorForEvent {
  id: string;
  type?: string;
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
const KNOWN_CHANNELS = new Set(['rolls', 'chat', 'combat', 'actors']);

// Opaque handle used to refcount subscriptions per connected client.
// Each `WebSocketClient` instance is passed in for reference equality;
// tests can pass any object. Multiple enables with the same
// SubscriberId are a no-op; cleanup walks every channel on disconnect.
export type SubscriberId = object;

/**
 * Owns Foundry Hook registrations for every active event channel.
 * Enables on the first subscriber for a channel (0→1) and tears the
 * Foundry hooks down only when the last subscriber disables (1→0), so
 * running multiple MCP servers against one Foundry world doesn't drop
 * a channel when one of them unsubscribes. `createChatMessage` is
 * shared between the rolls and chat channels and torn down only when
 * both go idle.
 */
export class EventChannelController {
  private readonly subscribers = new Map<string, Set<SubscriberId>>();
  private readonly hookHandles = new Map<string, HookHandle[]>();
  private chatMsgHookHandle: number | null = null;

  constructor(private readonly publisher: EventPublisher) {}

  enable(channel: string, subscriber: SubscriberId): void {
    if (!KNOWN_CHANNELS.has(channel)) {
      console.warn(`Foundry API Bridge | Unknown event channel: ${channel}`);
      return;
    }

    const existing = this.subscribers.get(channel);
    if (existing) {
      existing.add(subscriber);
      return;
    }

    // 0→1 transition: this is the first subscriber for the channel,
    // so register Foundry hooks now.
    this.subscribers.set(channel, new Set([subscriber]));
    this.registerHooks(channel);
    console.log(`Foundry API Bridge | Event channel enabled: ${channel}`);
  }

  disable(channel: string, subscriber: SubscriberId): void {
    const subs = this.subscribers.get(channel);
    if (!subs || !subs.delete(subscriber)) return;
    if (subs.size > 0) return;

    // 1→0 transition: tear down hooks for this channel.
    this.subscribers.delete(channel);
    this.teardownHooks(channel);
    console.log(`Foundry API Bridge | Event channel disabled: ${channel}`);
  }

  // Remove every subscription belonging to a single connection. Invoked
  // when a client disconnects so phantom subscriptions don't keep
  // shared hooks alive after the server drops.
  removeSubscriber(subscriber: SubscriberId): void {
    for (const channel of [...this.subscribers.keys()]) {
      this.disable(channel, subscriber);
    }
  }

  private registerHooks(channel: string): void {
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
            this.publisher.pushEvent('chat', { eventType: 'delete', data: { id: raw.id } });
          }),
        );
        handles.push(
          this.reg('updateChatMessage', (raw) => {
            if (!isFoundryChatMessage(raw)) return;
            this.publisher.pushEvent('chat', { eventType: 'update', data: serializeChatMessage(raw) });
          }),
        );
        break;

      case 'actors':
        handles.push(
          this.reg('updateActor', (...args: unknown[]) => {
            const [rawActor, rawChange] = args;
            if (!isFoundryActorForEvent(rawActor)) return;
            const changedPaths = extractChangedPaths(rawChange);
            if (changedPaths.length === 0) return;
            this.publisher.pushEvent('actors', { actorId: rawActor.id, changedPaths });
          }),
        );
        // PF2e conditions and effects are embedded items. createItem/deleteItem
        // fire when they are added or removed; updateItem fires when a valued
        // condition's badge changes (e.g. Frightened 2 → 1). None of these
        // trigger updateActor directly, so we hook them here to push an actors
        // event so the portal refetches the prepared actor.
        handles.push(
          this.reg('createItem', (...args: unknown[]) => {
            const actorId = getConditionOrEffectActorId(args[0]);
            if (actorId === null) return;
            this.publisher.pushEvent('actors', { actorId, changedPaths: ['items'] });
          }),
        );
        handles.push(
          this.reg('deleteItem', (...args: unknown[]) => {
            const actorId = getConditionOrEffectActorId(args[0]);
            if (actorId === null) return;
            this.publisher.pushEvent('actors', { actorId, changedPaths: ['items'] });
          }),
        );
        handles.push(
          this.reg('updateItem', (...args: unknown[]) => {
            const actorId = getConditionOrEffectActorId(args[0]);
            if (actorId === null) return;
            this.publisher.pushEvent('actors', { actorId, changedPaths: ['items'] });
          }),
        );
        break;

      case 'combat': {
        const combatPush =
          (eventType: 'start' | 'turn' | 'round') =>
          (raw: unknown): void => {
            if (!isFoundryCombat(raw)) return;
            this.publisher.pushEvent('combat', { eventType, ...serializeCombat(raw) });
          };
        handles.push(this.reg('combatStart', combatPush('start')));
        handles.push(this.reg('combatTurn', combatPush('turn')));
        handles.push(this.reg('combatRound', combatPush('round')));
        handles.push(
          this.reg('createCombatant', (raw) => {
            if (!isCombatantWithParent(raw) || !raw.combat) return;
            this.publisher.pushEvent('combat', {
              eventType: 'combatant-add',
              encounterId: raw.combat.id,
              combatant: serializeCombatant(raw),
            });
          }),
        );
        handles.push(
          this.reg('deleteCombatant', (raw) => {
            if (!isCombatantWithParent(raw) || !raw.combat) return;
            this.publisher.pushEvent('combat', {
              eventType: 'combatant-remove',
              encounterId: raw.combat.id,
              combatant: serializeCombatant(raw),
            });
          }),
        );
        handles.push(
          this.reg('deleteCombat', (raw) => {
            if (!isFoundryCombat(raw)) return;
            this.publisher.pushEvent('combat', { eventType: 'end', encounterId: raw.id });
          }),
        );
        handles.push(
          this.reg('updateCombatant', (...args: unknown[]) => {
            const [rawCombatant, rawChanges] = args;
            if (!isCombatantUpdateForEvent(rawCombatant) || !rawCombatant.combat) return;
            // Only push when initiative was explicitly set (not cleared to null).
            const changes = rawChanges as Record<string, unknown>;
            if (typeof changes['initiative'] !== 'number') return;
            this.publisher.pushEvent('combat', {
              eventType: 'combatant-update',
              encounterId: rawCombatant.combat.id,
              combatant: {
                id: rawCombatant.id,
                actorId: rawCombatant.actorId,
                initiative: rawCombatant.initiative,
                defeated: rawCombatant.defeated,
              },
            });
          }),
        );
        break;
      }
    }

    if (handles.length > 0) {
      this.hookHandles.set(channel, handles);
    }
  }

  private teardownHooks(channel: string): void {
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
      !this.subscribers.has('rolls') &&
      !this.subscribers.has('chat') &&
      this.chatMsgHookHandle !== null
    ) {
      Hooks.off('createChatMessage', this.chatMsgHookHandle);
      this.chatMsgHookHandle = null;
    }
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
    if (this.subscribers.has('rolls')) {
      const roll = message.rolls?.[0];
      if (message.isRoll && roll) {
        this.publisher.pushEvent('rolls', serializeRoll(message, roll));
      }
    }
    if (this.subscribers.has('chat')) {
      this.publisher.pushEvent('chat', { eventType: 'create', data: serializeChatMessage(message) });
    }
  }
}

// ---- Serializers --------------------------------------------------------

function computeSpeakerOwnerIds(speaker: FoundrySpeaker | null | undefined): string[] {
  const actorId = speaker?.actor;
  if (!actorId) return [];
  const g = (globalThis as Record<string, unknown>)['game'] as
    | { actors?: { get(id: string): { ownership?: Record<string, number> } | null | undefined } }
    | undefined;
  const actor = g?.actors?.get(actorId);
  if (!actor?.ownership) return [];
  return Object.entries(actor.ownership)
    .filter(([userId, level]) => userId !== 'default' && level === 3)
    .map(([userId]) => userId);
}

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
    speakerOwnerIds: computeSpeakerOwnerIds(m.speaker),
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

// ---- Helpers ------------------------------------------------------------

// Returns the actor id if `raw` is a PF2e condition or effect embedded on an
// actor; null otherwise. Used by the createItem/deleteItem/updateItem hooks
// in the actors channel so only status-effect changes trigger a push.
function getConditionOrEffectActorId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (item['type'] !== 'condition' && item['type'] !== 'effect') return null;
  const parent = item['parent'];
  if (typeof parent !== 'object' || parent === null) return null;
  const p = parent as Record<string, unknown>;
  if (p['documentName'] !== 'Actor' || typeof p['id'] !== 'string') return null;
  return p['id'];
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

function isCombatantUpdateForEvent(value: unknown): value is CombatantUpdateForEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['actorId'] === 'string' &&
    (typeof obj['initiative'] === 'number' || obj['initiative'] === null) &&
    typeof obj['defeated'] === 'boolean'
  );
}

function isFoundryActorForEvent(value: unknown): value is FoundryActorForEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['id'] === 'string';
}

// Flatten a Foundry `updateActor` diff into dot-notation leaf paths so
// subscribers can filter by prefix ("system.crafting", "system.attributes.hp",
// etc.). Foundry delivers diffs as a mix of nested objects and
// dot-notation keys depending on the update path; this walker handles
// both and always produces path strings in the same shape.
//
// Exported for unit testing; the hook callback is the only caller.
export function extractChangedPaths(change: unknown): string[] {
  if (typeof change !== 'object' || change === null) return [];
  const out: string[] = [];
  walk(change as Record<string, unknown>, '', out);
  return out;
}

function walk(obj: Record<string, unknown>, prefix: string, out: string[]): void {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    // Dot-notation keys already encode depth — treat as a leaf so the
    // emitted path mirrors what Foundry actually sent.
    if (key.includes('.')) {
      out.push(path);
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, path, out);
    } else {
      out.push(path);
    }
  }
}
