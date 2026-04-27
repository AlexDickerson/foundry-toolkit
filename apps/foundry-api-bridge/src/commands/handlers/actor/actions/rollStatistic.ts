import type { InvokeActorActionResult } from '@/commands/types';
import { extractDiceResults } from '../actorTypes';
import { getFoundry } from './types';
import type { FoundryActor } from './types';

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

export async function rollStatisticAction(
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
