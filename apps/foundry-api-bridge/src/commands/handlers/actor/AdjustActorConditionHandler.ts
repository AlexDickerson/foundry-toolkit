import type {
  ActorConditionKey,
  AdjustActorConditionParams,
  AdjustActorConditionResult,
} from '@/commands/types';

interface FoundryActor {
  id: string;
  system: Record<string, unknown>;
  /** PF2e-specific: bumps the condition by 1 (creates the effect at
   *  value 1 if absent). Returns the condition item or null. */
  increaseCondition?: (slug: string) => Promise<unknown>;
  /** PF2e-specific: drops the condition value by 1; removes the
   *  effect when it hits 0. */
  decreaseCondition?: (slug: string) => Promise<unknown>;
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
}

declare const game: FoundryGame;

const VALUE_PATH: Record<ActorConditionKey, readonly string[]> = {
  dying: ['attributes', 'dying', 'value'],
  wounded: ['attributes', 'wounded', 'value'],
  doomed: ['attributes', 'doomed', 'value'],
};

const MAX_PATH: Record<ActorConditionKey, readonly string[]> = {
  dying: ['attributes', 'dying', 'max'],
  wounded: ['attributes', 'wounded', 'max'],
  doomed: ['attributes', 'doomed', 'max'],
};

function readNumber(root: Record<string, unknown>, path: readonly string[]): number {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return 0;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : 0;
}

// Signed stepper for the three persistent PF2e conditions. Deltas are
// applied via repeated `increase`/`decreaseCondition` calls so the
// system's lifecycle fires — dying crossing max kills the character,
// decreasing dying past 0 leaves a wounded stack, etc.
export async function adjustActorConditionHandler(
  params: AdjustActorConditionParams,
): Promise<AdjustActorConditionResult> {
  const actor = game.actors.get(params.actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${params.actorId}`);
  }

  if (typeof actor.increaseCondition !== 'function' || typeof actor.decreaseCondition !== 'function') {
    throw new Error(
      `Actor ${params.actorId} doesn't expose PF2e condition methods — is this a pf2e system actor?`,
    );
  }

  const before = readNumber(actor.system, VALUE_PATH[params.condition]);

  if (params.delta > 0) {
    for (let i = 0; i < params.delta; i++) {
      await actor.increaseCondition(params.condition);
    }
  } else if (params.delta < 0) {
    for (let i = 0; i < -params.delta; i++) {
      await actor.decreaseCondition(params.condition);
    }
  }

  // Max can shift in the same call (dying's cap moves with doomed),
  // so re-read after the writes.
  const after = readNumber(actor.system, VALUE_PATH[params.condition]);
  const max = readNumber(actor.system, MAX_PATH[params.condition]);

  return {
    actorId: params.actorId,
    condition: params.condition,
    before,
    after,
    max,
  };
}
