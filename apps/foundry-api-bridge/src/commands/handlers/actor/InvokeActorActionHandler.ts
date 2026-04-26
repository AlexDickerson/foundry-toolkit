import type { InvokeActorActionParams, InvokeActorActionResult } from '@/commands/types';
import { extractDiceResults } from './actorTypes';
import type { FoundryD20Roll } from './actorTypes';

// Minimal Foundry type snippets. Kept local to the handler because
// the pf2e runtime surface isn't covered by the bundled foundry-vtt
// types and we narrow defensively from `unknown` anyway. Each action
// reads what it needs; the shared fields (id, system, update) sit on
// `FoundryActor` so the router can hand one object to every handler.

interface FoundryActor {
  id: string;
  uuid: string;
  type: string;
  system: Record<string, unknown> & {
    /** PF2e system caches prepared strike/action objects on the
     *  character here. Shape is `{slug, variants: [{roll()}], damage(),
     *  critical()}`. Loose typing because the surface's runtime-only. */
    actions?: Pf2eStrike[];
  };
  items: FoundryItemCollection;
  update(data: Record<string, unknown>): Promise<FoundryActor>;
  /** PF2e-specific: bumps a condition by 1 (creates the effect at
   *  value 1 if absent). */
  increaseCondition?: (slug: string) => Promise<unknown>;
  /** PF2e-specific: drops a condition value by 1; removes the
   *  effect when it hits 0. */
  decreaseCondition?: (slug: string) => Promise<unknown>;
  /** PF2e-specific: unified `Statistic` accessor — perception, saves,
   *  every skill. Returns null when the statistic isn't defined
   *  (e.g. loot actors). */
  getStatistic?: (slug: string) => Pf2eStatistic | null;
}

interface Pf2eStatistic {
  roll(args: {
    skipDialog?: boolean;
    createMessage?: boolean;
    rollMode?: string;
  }): Promise<FoundryD20Roll | null>;
}

interface Pf2eStrikeVariant {
  roll(args: Record<string, unknown>): Promise<unknown>;
}

interface Pf2eStrike {
  slug: string;
  variants?: Pf2eStrikeVariant[];
  damage?: (args: Record<string, unknown>) => Promise<unknown>;
  critical?: (args: Record<string, unknown>) => Promise<unknown>;
}

interface FoundryItem {
  id: string;
  name: string;
  type: string;
  toMessage(args?: Record<string, unknown>): Promise<unknown>;
}

interface FoundryItemCollection {
  get(id: string): FoundryItem | undefined;
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

type PF2eActionFn = (options: Record<string, unknown>) => Promise<unknown>;

interface FoundryGame {
  actors: ActorsCollection;
  messages?: { contents: Array<{ id: string; isRoll?: boolean }> };
  pf2e?: {
    actions?: Record<string, PF2eActionFn | undefined>;
  };
}

interface FoundryGlobals {
  game: FoundryGame;
}

function getFoundry(): FoundryGlobals {
  return globalThis as unknown as FoundryGlobals;
}

// Per-action handler signature. Receives the resolved actor + the
// untyped params bag from the request; returns whatever structured
// result makes sense for the action (opaque to the router).
type ActionHandler = (actor: FoundryActor, params: Record<string, unknown>) => Promise<InvokeActorActionResult>;

// ─── Action registry ───────────────────────────────────────────────────

// Dispatch table. Adding a new outbound action is a single entry —
// no new command type, no new HTTP route, no SPA api method.
const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'adjust-resource': adjustResourceAction,
  'adjust-condition': adjustConditionAction,
  'roll-statistic': rollStatisticAction,
  craft: craftAction,
  'rest-for-the-night': restForTheNightAction,
  'roll-strike': rollStrikeAction,
  'roll-strike-damage': rollStrikeDamageAction,
  // Simple "send the item's action card to chat" — same behaviour as
  // the pf2e sheet's "post to chat" button. Distinct from the typed
  // `use-item` command, which runs the full activation pipeline
  // (activities, scaling, consumable charges) and has its own
  // MCP/IPC consumers.
  'post-item-to-chat': postItemToChatAction,
  'add-formula': addFormulaAction,
  'remove-formula': removeFormulaAction,
  'get-spellcasting': getSpellcastingAction,
  'cast-spell': castSpellAction,
};

// ─── adjust-resource ───────────────────────────────────────────────────

// Signed stepper against an actor's numeric resource. Writes the
// clamped result straight to the field via `actor.update()` — no
// damage pipeline, no IWR, no dying cascade. Matches the plain
// behaviour of the pf2e sheet's +/- buttons; callers that want full
// damage semantics should use a dedicated apply-damage action (not
// yet registered here).

type ResourceKey = 'hp' | 'hp-temp' | 'hero-points' | 'focus-points';

const RESOURCE_KEYS: readonly ResourceKey[] = ['hp', 'hp-temp', 'hero-points', 'focus-points'];

interface ResourceConfig {
  /** Dot-path passed to `actor.update()`. */
  path: string;
  /** Steps under `actor.system` used to read the current value. */
  valuePath: readonly string[];
  /** Steps under `actor.system` used to read the max, or null when
   *  the resource has no natural cap (e.g. temp HP). */
  maxPath: readonly string[] | null;
}

const RESOURCES: Record<ResourceKey, ResourceConfig> = {
  hp: {
    path: 'system.attributes.hp.value',
    valuePath: ['attributes', 'hp', 'value'],
    maxPath: ['attributes', 'hp', 'max'],
  },
  'hp-temp': {
    path: 'system.attributes.hp.temp',
    valuePath: ['attributes', 'hp', 'temp'],
    maxPath: null,
  },
  'hero-points': {
    path: 'system.resources.heroPoints.value',
    valuePath: ['resources', 'heroPoints', 'value'],
    maxPath: ['resources', 'heroPoints', 'max'],
  },
  'focus-points': {
    path: 'system.resources.focus.value',
    valuePath: ['resources', 'focus', 'value'],
    maxPath: ['resources', 'focus', 'max'],
  },
};

function isResourceKey(v: unknown): v is ResourceKey {
  return typeof v === 'string' && (RESOURCE_KEYS as readonly string[]).includes(v);
}

async function adjustResourceAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const resource = params['resource'];
  if (!isResourceKey(resource)) {
    throw new Error(`adjust-resource: params.resource must be one of ${RESOURCE_KEYS.join(', ')}`);
  }
  const delta = params['delta'];
  if (typeof delta !== 'number' || !Number.isInteger(delta)) {
    throw new Error('adjust-resource: params.delta must be an integer');
  }

  const config = RESOURCES[resource];
  const before = readNumber(actor.system, config.valuePath);
  const max = config.maxPath !== null ? readNumber(actor.system, config.maxPath) : null;
  const upperBound = max ?? Number.POSITIVE_INFINITY;
  const after = Math.max(0, Math.min(upperBound, before + delta));

  if (after !== before) {
    await actor.update({ [config.path]: after });
  }

  return { actorId: actor.id, resource, before, after, max };
}

// ─── adjust-condition ──────────────────────────────────────────────────

// Signed stepper for the three persistent PF2e conditions. Deltas are
// applied via repeated `increase`/`decreaseCondition` calls so the
// system's lifecycle fires — dying crossing max kills the character,
// decreasing dying past 0 leaves a wounded stack, etc.

type ConditionKey = 'dying' | 'wounded' | 'doomed';

const CONDITION_KEYS: readonly ConditionKey[] = ['dying', 'wounded', 'doomed'];

const CONDITION_VALUE_PATH: Record<ConditionKey, readonly string[]> = {
  dying: ['attributes', 'dying', 'value'],
  wounded: ['attributes', 'wounded', 'value'],
  doomed: ['attributes', 'doomed', 'value'],
};

const CONDITION_MAX_PATH: Record<ConditionKey, readonly string[]> = {
  dying: ['attributes', 'dying', 'max'],
  wounded: ['attributes', 'wounded', 'max'],
  doomed: ['attributes', 'doomed', 'max'],
};

function isConditionKey(v: unknown): v is ConditionKey {
  return typeof v === 'string' && (CONDITION_KEYS as readonly string[]).includes(v);
}

async function adjustConditionAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const condition = params['condition'];
  if (!isConditionKey(condition)) {
    throw new Error(`adjust-condition: params.condition must be one of ${CONDITION_KEYS.join(', ')}`);
  }
  const delta = params['delta'];
  if (typeof delta !== 'number' || !Number.isInteger(delta)) {
    throw new Error('adjust-condition: params.delta must be an integer');
  }

  if (typeof actor.increaseCondition !== 'function' || typeof actor.decreaseCondition !== 'function') {
    throw new Error(
      `adjust-condition: actor ${actor.id} doesn't expose PF2e condition methods — is this a pf2e system actor?`,
    );
  }

  const before = readNumber(actor.system, CONDITION_VALUE_PATH[condition]);

  if (delta > 0) {
    for (let i = 0; i < delta; i++) {
      await actor.increaseCondition(condition);
    }
  } else if (delta < 0) {
    for (let i = 0; i < -delta; i++) {
      await actor.decreaseCondition(condition);
    }
  }

  // Max can shift in the same call (dying's cap moves with doomed),
  // so re-read after the writes.
  const after = readNumber(actor.system, CONDITION_VALUE_PATH[condition]);
  const max = readNumber(actor.system, CONDITION_MAX_PATH[condition]);

  return { actorId: actor.id, condition, before, after, max };
}

// ─── roll-statistic ────────────────────────────────────────────────────

// Click-to-roll for any PF2e `Statistic` — Perception, saves, skills.
// Uses the unified `actor.getStatistic(slug).roll()` path so one
// handler covers every check the character sheet can surface. Chat
// dialog is skipped — if we want a modifier prompt later we'll
// surface an SPA-side picker and pass the resolved DC/traits through
// explicitly. `createMessage` is true so the roll card lands in the
// Foundry chat log for players watching.

const STATISTIC_SLUGS: readonly string[] = [
  'perception',
  'fortitude',
  'reflex',
  'will',
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
];

const ROLL_MODES: readonly string[] = ['publicroll', 'gmroll', 'blindroll', 'selfroll'];

async function rollStatisticAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const statistic = params['statistic'];
  if (typeof statistic !== 'string' || !STATISTIC_SLUGS.includes(statistic)) {
    throw new Error(`roll-statistic: params.statistic must be one of ${STATISTIC_SLUGS.join(', ')}`);
  }
  const rollMode = params['rollMode'];
  if (rollMode !== undefined && (typeof rollMode !== 'string' || !ROLL_MODES.includes(rollMode))) {
    throw new Error(`roll-statistic: params.rollMode must be one of ${ROLL_MODES.join(', ')} when present`);
  }

  if (typeof actor.getStatistic !== 'function') {
    throw new Error(
      `roll-statistic: actor ${actor.id} doesn't expose getStatistic — is this a pf2e system actor?`,
    );
  }

  const stat = actor.getStatistic(statistic);
  if (!stat) {
    throw new Error(`roll-statistic: statistic "${statistic}" not available on actor ${actor.id}`);
  }

  // `exactOptionalPropertyTypes` makes `rollMode: undefined` invalid on
  // the target type — only include the key when we have a value.
  const rollArgs: { skipDialog: boolean; createMessage: boolean; rollMode?: string } = {
    skipDialog: true,
    createMessage: true,
  };
  if (typeof rollMode === 'string') rollArgs.rollMode = rollMode;
  const roll = await stat.roll(rollArgs);

  if (!roll) {
    throw new Error(`roll-statistic: roll for "${statistic}" returned no result (cancelled?)`);
  }

  const dice = extractDiceResults(roll.terms);
  const result: InvokeActorActionResult = {
    statistic,
    total: roll.total,
    formula: roll.formula,
    dice,
  };
  if (roll.isCritical) result['isCritical'] = true;
  if (roll.isFumble) result['isFumble'] = true;

  // Best-effort: match the just-created chat message so callers can
  // cite it (e.g. a live sheet can highlight the row).
  const lastMessage = getFoundry().game.messages?.contents.at(-1);
  if (lastMessage?.isRoll === true) {
    result['chatMessageId'] = lastMessage.id;
  }

  return result;
}

// ─── craft ─────────────────────────────────────────────────────────────

// pf2e's `game.pf2e.actions.craft` accepts `uuid` directly and
// resolves it internally — we don't need to `fromUuid` ourselves.
// The action fires a Crafting skill check chat card; SPA state
// refreshes via the `actors` event channel if the roll mutates the
// actor (on success it creates an item in inventory).
async function craftAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const itemUuid = params['itemUuid'];
  if (typeof itemUuid !== 'string' || itemUuid.length === 0) {
    throw new Error('craft: params.itemUuid is required');
  }
  const quantityRaw = params['quantity'];
  const quantity = typeof quantityRaw === 'number' && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;

  const craftFn = getFoundry().game.pf2e?.actions?.['craft'];
  if (typeof craftFn !== 'function') {
    throw new Error('craft: game.pf2e.actions.craft is unavailable (pf2e system not installed?)');
  }

  await craftFn({ uuid: itemUuid, actors: [actor], quantity });

  return { ok: true };
}

// ─── rest-for-the-night ────────────────────────────────────────────────

// pf2e's Rest for the Night — daily preparations, HP/heal, spell
// slot reset, resource refresh. `skipDialog` suppresses the native
// confirmation popup so the SPA can drive it silently. Returns the
// chat message count so the SPA can echo "N recovery results" if it
// wants to, matching the prior eval-based shape.
async function restForTheNightAction(
  actor: FoundryActor,
  _params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`rest-for-the-night: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const restFn = getFoundry().game.pf2e?.actions?.['restForTheNight'];
  if (typeof restFn !== 'function') {
    throw new Error(
      'rest-for-the-night: game.pf2e.actions.restForTheNight is unavailable (pf2e system not installed?)',
    );
  }

  const result = (await restFn({ actors: [actor], skipDialog: true }));
  const messageCount = Array.isArray(result) ? result.length : 0;

  return { ok: true, messageCount };
}

// ─── roll-strike ───────────────────────────────────────────────────────

// Rolls a single MAP variant of a PF2e strike. `variantIndex` 0/1/2
// maps to first attack / second (−5 MAP) / third (−10 MAP). The
// PF2e `StrikeData` lives at `actor.system.actions[i]` and each
// variant exposes its own `roll()` that bakes in the MAP penalty.
async function rollStrikeAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`roll-strike: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const strikeSlug = params['strikeSlug'];
  if (typeof strikeSlug !== 'string' || strikeSlug.length === 0) {
    throw new Error('roll-strike: params.strikeSlug is required');
  }
  const variantIndex = params['variantIndex'];
  if (typeof variantIndex !== 'number' || !Number.isInteger(variantIndex) || variantIndex < 0) {
    throw new Error('roll-strike: params.variantIndex must be a non-negative integer');
  }

  const strike = resolveStrike(actor, strikeSlug);
  const variant = strike.variants?.[variantIndex];
  if (!variant) {
    throw new Error(`roll-strike: strike "${strikeSlug}" has no variant ${variantIndex.toString()}`);
  }
  // skipDialog: true — suppress PF2e's CheckModifiersDialog (situational modifier
  // prompt). Portal players are explicitly requesting the attack; they
  // don't need a dialog step. Consistent with rollStatisticAction.
  await variant.roll({ skipDialog: true });
  return { ok: true };
}

// ─── roll-strike-damage ────────────────────────────────────────────────

// Rolls either regular damage or critical damage for a strike
// (whichever was appropriate for the attack outcome). Critical vs.
// normal is client-driven since the SPA reads the outcome from the
// attack's chat card.
async function rollStrikeDamageAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`roll-strike-damage: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const strikeSlug = params['strikeSlug'];
  if (typeof strikeSlug !== 'string' || strikeSlug.length === 0) {
    throw new Error('roll-strike-damage: params.strikeSlug is required');
  }
  const critical = params['critical'] === true;

  const strike = resolveStrike(actor, strikeSlug);
  // DamageModifierDialog is suppressed via the renderDamageModifierDialog hook
  // in prompt-intercept.ts — skipDialog is NOT in DamageRollParams so passing
  // it here has no effect. The hook handles it unconditionally.
  if (critical) {
    if (typeof strike.critical !== 'function') {
      throw new Error(`roll-strike-damage: strike "${strikeSlug}" has no critical roll`);
    }
    await strike.critical({});
  } else {
    if (typeof strike.damage !== 'function') {
      throw new Error(`roll-strike-damage: strike "${strikeSlug}" has no damage roll`);
    }
    await strike.damage({});
  }
  return { ok: true };
}

function resolveStrike(actor: FoundryActor, slug: string): Pf2eStrike {
  const actions = actor.system.actions;
  if (!Array.isArray(actions)) {
    throw new Error(`actor ${actor.id} has no system.actions — is this a pf2e character?`);
  }
  const strike = actions.find((s) => s.slug === slug);
  if (!strike) {
    throw new Error(`strike "${slug}" not found on actor ${actor.id}`);
  }
  return strike;
}

// ─── post-item-to-chat ─────────────────────────────────────────────────

// Posts an owned item's action card to chat — mirrors the pf2e sheet's
// "send to chat" button on an action / reaction / free action.
// Consumable charge consumption is left to whoever clicks the roll
// buttons inside the posted card. Distinct from the typed `use-item`
// command, which runs the full activation pipeline (activities,
// scaling, auto-consume) and has its own MCP/IPC consumers.
async function postItemToChatAction(
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

// ─── add-formula ───────────────────────────────────────────────────────

// Appends a compendium UUID to `system.crafting.formulas`. Dedupes so
// clicking Add twice on the same item is a no-op, not a duplicate. The
// pf2e sheet's `+ Add Formula` button does the same thing. Returns the
// post-update formula count so the SPA can echo "N formulas known"
// without a full refetch.
async function addFormulaAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const uuid = params['uuid'];
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new Error('add-formula: params.uuid is required');
  }

  const formulas = readFormulas(actor);
  const alreadyKnown = formulas.some((f) => f.uuid === uuid);
  if (alreadyKnown) {
    return { ok: true, added: false, uuid, formulaCount: formulas.length };
  }
  const next = [...formulas, { uuid }];
  await actor.update({ 'system.crafting.formulas': next });
  return { ok: true, added: true, uuid, formulaCount: next.length };
}

// ─── remove-formula ────────────────────────────────────────────────────

// Removes a formula by its compendium UUID. No-op when the formula
// isn't known — lets the SPA fire-and-forget without a pre-check.
async function removeFormulaAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const uuid = params['uuid'];
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new Error('remove-formula: params.uuid is required');
  }

  const formulas = readFormulas(actor);
  const next = formulas.filter((f) => f.uuid !== uuid);
  if (next.length === formulas.length) {
    return { ok: true, removed: false, uuid, formulaCount: formulas.length };
  }
  await actor.update({ 'system.crafting.formulas': next });
  return { ok: true, removed: true, uuid, formulaCount: next.length };
}

interface CraftingFormulaEntry {
  uuid: string;
}

function readFormulas(actor: FoundryActor): CraftingFormulaEntry[] {
  const crafting = (actor.system as { crafting?: { formulas?: unknown } }).crafting;
  const formulas = crafting?.formulas;
  if (!Array.isArray(formulas)) return [];
  return formulas.filter((f): f is CraftingFormulaEntry => {
    return typeof f === 'object' && f !== null && typeof (f as { uuid?: unknown }).uuid === 'string';
  });
}

// ─── get-spellcasting ──────────────────────────────────────────────────

// Returns a serializable snapshot of the actor's spellcasting entries
// for the dm-tool combat panel. Includes spells grouped by entry and
// slot state appropriate to each preparation mode.

type SpellPreparationMode = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual' | 'items';

interface Pf2eSpellcasting {
  get(id: string): Pf2eSpellcastingEntry | undefined;
}

interface Pf2eSpellcastingEntry {
  cast(spell: Pf2eSpellItem, opts: { rank?: number; slot?: number }): Promise<unknown>;
}

interface Pf2eSpellItem {
  id: string;
  name: string;
  type: string;
  system: {
    level: { value: number };
    traits: { value: string[] };
    time?: { value: string };
    location?: { value: string | null };
  };
}

interface Pf2eActorWithSpells extends FoundryActor {
  spellcasting?: Pf2eSpellcasting;
}

async function getSpellcastingAction(
  actor: FoundryActor,
  _params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const focus = (actor.system as { resources?: { focus?: { value?: number; max?: number } } }).resources?.focus;
  const focusPoints =
    focus && typeof focus.max === 'number' && focus.max > 0
      ? { value: typeof focus.value === 'number' ? focus.value : 0, max: focus.max }
      : null;

  // Pull all items from the actor via actor.items (a Foundry Collection that
  // always exposes embedded documents with full .system). Avoid
  // actor.spellcasting.contents — it returns synthetic wrappers in current
  // PF2e that don't expose .system directly.
  const allItems: unknown[] = [];
  const itemColl = actor.items as unknown as {
    contents?: unknown[];
    forEach?: (fn: (i: unknown) => void) => void;
  };
  if (Array.isArray(itemColl.contents)) {
    allItems.push(...itemColl.contents);
  } else if (typeof itemColl.forEach === 'function') {
    itemColl.forEach((item) => allItems.push(item));
  }

  function itemType(i: unknown): string {
    return typeof (i as Record<string, unknown>)['type'] === 'string'
      ? ((i as Record<string, unknown>)['type'] as string)
      : '';
  }
  function itemSystem(i: unknown): Record<string, unknown> {
    const sys = (i as Record<string, unknown>)['system'];
    return typeof sys === 'object' && sys !== null ? (sys as Record<string, unknown>) : {};
  }
  function nested(obj: Record<string, unknown>, ...keys: string[]): unknown {
    let cur: unknown = obj;
    for (const k of keys) {
      if (typeof cur !== 'object' || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  }

  const entryItems = allItems.filter((i) => itemType(i) === 'spellcastingEntry');
  const spellItems = allItems.filter((i) => itemType(i) === 'spell');

  if (entryItems.length === 0) {
    return { actorId: actor.id, entries: [] };
  }

  const entries = entryItems.map((rawEntry) => {
    const entryId = String((rawEntry as Record<string, unknown>)['id'] ?? '');
    const entryName = String((rawEntry as Record<string, unknown>)['name'] ?? '');
    const sys = itemSystem(rawEntry);
    const preparedSys = nested(sys, 'prepared') as Record<string, unknown> | undefined;
    const mode = (preparedSys?.['value'] as SpellPreparationMode | undefined) ?? 'innate';
    const traditionSys = nested(sys, 'tradition') as Record<string, unknown> | undefined;
    const tradition = String(traditionSys?.['value'] ?? '');
    const rawSlots = (nested(sys, 'slots') as Record<string, unknown> | undefined) ?? {};

    type SlotEntry = { max: number; value?: number; prepared?: Array<{ id: string | null; expended?: boolean }> };

    const entrySpells = spellItems.filter((s) => {
      const loc = nested(itemSystem(s), 'location', 'value');
      return loc === entryId;
    });

    const spellSummaries = entrySpells.map((rawSpell) => {
      const spellSys = itemSystem(rawSpell);
      const rank = Number(nested(spellSys, 'level', 'value') ?? 0);
      const rawTraits = nested(spellSys, 'traits', 'value');
      const allTraits = Array.isArray(rawTraits) ? (rawTraits as string[]) : [];
      const isCantrip = allTraits.includes('cantrip');
      const traits = allTraits.filter((t) => t !== 'cantrip');
      const actions = String(nested(spellSys, 'time', 'value') ?? '');
      const spellId = String((rawSpell as Record<string, unknown>)['id'] ?? '');
      const spellName = String((rawSpell as Record<string, unknown>)['name'] ?? '');
      const range = String(nested(spellSys, 'range', 'value') ?? '');
      const target = String(nested(spellSys, 'target', 'value') ?? '');

      const areaRaw = nested(spellSys, 'area') as Record<string, unknown> | null | undefined;
      let area = '';
      if (areaRaw && typeof areaRaw === 'object') {
        const aVal = areaRaw['value'];
        const aType = areaRaw['type'];
        if (aVal !== undefined && aVal !== '' && aVal !== 0) {
          area = `${String(aVal)}-foot${aType ? ` ${String(aType)}` : ''}`;
        }
      }

      // Description ships as raw Foundry HTML (with @UUID / @Damage / etc.
      // enricher tokens). Consumers run it through enrichDescription() from
      // @foundry-toolkit/shared/foundry-enrichers before rendering.
      const description = String(nested(spellSys, 'description', 'value') ?? '');

      let expended: boolean | undefined;
      if (mode === 'prepared') {
        const slotKey = `slot${rank.toString()}`;
        const slot = rawSlots[slotKey] as SlotEntry | undefined;
        expended =
          slot?.prepared?.find((p: { id: string | null; expended?: boolean }) => p.id === spellId)?.expended ?? false;
      }

      return { id: spellId, name: spellName, rank, isCantrip, actions, expended, traits, range, area, target, description };
    });

    // Slot state for spontaneous casters.
    let slots: Array<{ rank: number; value: number; max: number }> | undefined;
    if (mode === 'spontaneous') {
      slots = Object.entries(rawSlots)
        .map(([key, slotRaw]) => {
          const slot = slotRaw as SlotEntry;
          return {
            rank: parseInt(key.replace('slot', ''), 10),
            value: slot.value ?? 0,
            max: slot.max,
          };
        })
        .filter((s) => !isNaN(s.rank) && s.max > 0)
        .sort((a, b) => a.rank - b.rank);
    }

    return {
      id: entryId,
      name: entryName,
      mode,
      tradition,
      spells: spellSummaries,
      ...(slots !== undefined ? { slots } : {}),
      ...(mode === 'focus' && focusPoints !== null ? { focusPoints } : {}),
    };
  });

  return { actorId: actor.id, entries };
}

// ─── cast-spell ────────────────────────────────────────────────────────

// Calls entry.cast(spell, { rank }) via the spellcasting entry item on
// the actor. The DamageModifierDialog and CheckModifiersDialog are
// already suppressed globally by prompt-intercept.ts, so they never
// block the cast flow. If a PickAThingPrompt fires (e.g. variable
// spell targets) it is relayed to any connected WebSocket client.

async function castSpellAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const entryId = params['entryId'];
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new Error('cast-spell: params.entryId is required');
  }
  const spellId = params['spellId'];
  if (typeof spellId !== 'string' || spellId.length === 0) {
    throw new Error('cast-spell: params.spellId is required');
  }
  const rank = params['rank'];
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0) {
    throw new Error('cast-spell: params.rank must be a non-negative integer');
  }

  const pf2eActor = actor as Pf2eActorWithSpells;
  if (!pf2eActor.spellcasting) {
    throw new Error(`cast-spell: actor ${actor.id} has no spellcasting ability`);
  }

  const entry = pf2eActor.spellcasting.get(entryId);
  if (!entry) {
    throw new Error(`cast-spell: spellcasting entry '${entryId}' not found on actor ${actor.id}`);
  }

  const spell = actor.items.get(spellId);
  if (!spell) {
    throw new Error(`cast-spell: spell item '${spellId}' not found on actor ${actor.id}`);
  }

  console.info(
    `Foundry API Bridge | cast-spell: actorId=${actor.id.slice(0, 8)} entryId=${entryId.slice(0, 8)} spellId=${spellId.slice(0, 8)} rank=${rank.toString()}`,
  );

  try {
    await entry.cast(spell as unknown as Pf2eSpellItem, { rank });
  } catch (error) {
    console.error(
      `Foundry API Bridge | cast-spell failed: actorId=${actor.id.slice(0, 8)} spellId=${spellId.slice(0, 8)}`,
      error,
    );
    throw error;
  }

  return { ok: true };
}

// ─── Router ────────────────────────────────────────────────────────────

export async function invokeActorActionHandler(
  params: InvokeActorActionParams,
): Promise<InvokeActorActionResult> {
  const { actorId, action } = params;
  const actor = getFoundry().game.actors.get(actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${actorId}`);
  }

  const handler = ACTION_HANDLERS[action];
  if (!handler) {
    const known = Object.keys(ACTION_HANDLERS).join(', ');
    throw new Error(`Unknown action: ${action} (known: ${known})`);
  }

  return handler(actor, params.params ?? {});
}

// Exported for tests; the registry is otherwise an implementation
// detail of the dispatch.
export const KNOWN_ACTIONS = Object.freeze(Object.keys(ACTION_HANDLERS));

// ─── Helpers ───────────────────────────────────────────────────────────

function readNumber(root: Record<string, unknown>, path: readonly string[]): number {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return 0;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : 0;
}
