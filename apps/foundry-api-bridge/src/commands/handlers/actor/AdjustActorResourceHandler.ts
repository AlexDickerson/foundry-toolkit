import type {
  ActorResourceKey,
  AdjustActorResourceParams,
  AdjustActorResourceResult,
} from '@/commands/types';

interface FoundryActor {
  id: string;
  system: Record<string, unknown>;
  update(data: Record<string, unknown>): Promise<FoundryActor>;
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
}

declare const game: FoundryGame;

interface ResourceConfig {
  /** Dot-path passed to `actor.update()`. */
  path: string;
  /** Steps under `actor.system` used to read the current value. */
  valuePath: readonly string[];
  /** Steps under `actor.system` used to read the max, or null when
   *  the resource has no natural cap (e.g. temp HP). */
  maxPath: readonly string[] | null;
}

const RESOURCES: Record<ActorResourceKey, ResourceConfig> = {
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

function readNumber(root: Record<string, unknown>, path: readonly string[]): number {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return 0;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : 0;
}

// Signed stepper against an actor's numeric resource. Writes the
// clamped result straight to the field via `actor.update()` — no
// damage pipeline, no IWR, no dying cascade. Matches the plain
// behaviour of the pf2e sheet's +/- buttons; callers that want
// full damage semantics should use a dedicated apply-damage
// command (not yet typed).
export async function adjustActorResourceHandler(
  params: AdjustActorResourceParams,
): Promise<AdjustActorResourceResult> {
  const actor = game.actors.get(params.actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${params.actorId}`);
  }

  const config = RESOURCES[params.resource];
  // Defence in depth: zod rejects unknown keys at the HTTP edge, but
  // the bridge command path has no such guard, so we check here too.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!config) {
    throw new Error(`Unknown resource: ${String(params.resource)}`);
  }

  const before = readNumber(actor.system, config.valuePath);
  const max = config.maxPath !== null ? readNumber(actor.system, config.maxPath) : null;
  const upperBound = max ?? Number.POSITIVE_INFINITY;
  const after = Math.max(0, Math.min(upperBound, before + params.delta));

  if (after !== before) {
    await actor.update({ [config.path]: after });
  }

  return {
    actorId: params.actorId,
    resource: params.resource,
    before,
    after,
    max,
  };
}
