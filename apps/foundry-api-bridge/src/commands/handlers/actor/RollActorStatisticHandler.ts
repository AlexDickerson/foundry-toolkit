import type {
  Pf2eRollMode,
  RollActorStatisticParams,
  RollActorStatisticResult,
} from '@/commands/types';
import { extractDiceResults } from './actorTypes';
import type { FoundryD20Roll } from './actorTypes';

interface RolledMessage {
  id: string;
}

interface Pf2eStatistic {
  /** Unified roll entry point. Returns the Roll object — and, when
   *  `createMessage: true`, creates a chat card as a side effect. */
  roll(args: {
    skipDialog?: boolean;
    createMessage?: boolean;
    rollMode?: Pf2eRollMode;
  }): Promise<FoundryD20Roll | null>;
}

interface Pf2eActor {
  id: string;
  /** PF2e unified statistic accessor. Supports perception, saves,
   *  and every skill slug. Returns null when the statistic isn't
   *  defined on this actor (e.g. loot actors). */
  getStatistic?: (slug: string) => Pf2eStatistic | null;
}

interface ActorsCollection {
  get(id: string): Pf2eActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
  messages?: { contents: Array<{ id: string; isRoll?: boolean }> };
}

declare const game: FoundryGame;

// Click-to-roll for any PF2e `Statistic` (Perception, saves, skills).
// Uses the unified `actor.getStatistic(slug).roll()` path so one
// handler covers every check the character sheet can surface.
//
// Chat dialog is skipped — if we want a modifier prompt later we'll
// surface an SPA-side picker and pass the resolved DC/traits through
// here explicitly. `createMessage` is true so the roll card actually
// lands in the Foundry chat log for players watching.
export async function rollActorStatisticHandler(
  params: RollActorStatisticParams,
): Promise<RollActorStatisticResult> {
  const actor = game.actors.get(params.actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${params.actorId}`);
  }

  if (typeof actor.getStatistic !== 'function') {
    throw new Error(
      `Actor ${params.actorId} doesn't expose getStatistic — is this a pf2e system actor?`,
    );
  }

  const statistic = actor.getStatistic(params.statistic);
  if (!statistic) {
    throw new Error(`Statistic "${params.statistic}" not available on actor ${params.actorId}`);
  }

  const roll = await statistic.roll({
    skipDialog: true,
    createMessage: true,
    rollMode: params.rollMode,
  });

  if (!roll) {
    throw new Error(`Roll for "${params.statistic}" returned no result (cancelled?)`);
  }

  const dice = extractDiceResults(roll.terms);
  const result: RollActorStatisticResult = {
    statistic: params.statistic,
    total: roll.total,
    formula: roll.formula,
    dice,
  };
  if (roll.isCritical) result.isCritical = true;
  if (roll.isFumble) result.isFumble = true;

  // Best-effort: match the just-created chat message so callers can
  // cite it (e.g. a live sheet can highlight the row). We don't
  // require the messages collection — if it's missing, just omit.
  const lastMessage = game.messages?.contents.at(-1);
  if (lastMessage?.isRoll === true) {
    result.chatMessageId = lastMessage.id;
  }

  return result;
}
