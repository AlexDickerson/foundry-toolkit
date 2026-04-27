import type { InvokeActorActionResult } from '@/commands/types';
import { readNumber } from './_shared';
import type { FoundryActor } from './types';

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

export async function adjustResourceAction(
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
