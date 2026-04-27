import type { InvokeActorActionResult } from '@/commands/types';
import { readNumber } from './_shared';
import type { FoundryActor } from './types';

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

export async function adjustConditionAction(
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
