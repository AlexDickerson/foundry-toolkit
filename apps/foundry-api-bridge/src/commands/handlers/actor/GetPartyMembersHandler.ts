import type { GetPartyMembersParams, PartyMemberResult } from '@/commands/types';
import { PARTY_FOLDER_NAME } from '@/party-config';

interface FoundryFolder {
  id: string;
  name: string;
}

interface FoundryActorEntry {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  folder: FoundryFolder | null;
  system: Record<string, unknown>;
}

interface ActorsCollection {
  forEach(fn: (actor: FoundryActorEntry) => void): void;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

/** Safely read a numeric value at a nested dot-notation path inside an
 *  actor's `system` object.  Returns `undefined` when any key in the
 *  path is missing or the leaf is not a number. */
function getNestedNumber(obj: Record<string, unknown>, path: string): number | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' ? current : undefined;
}

export function getPartyMembersHandler(params: GetPartyMembersParams): Promise<PartyMemberResult[]> {
  const targetFolder = params.folderName ?? PARTY_FOLDER_NAME;
  const members: PartyMemberResult[] = [];

  getGame().actors.forEach((actor) => {
    // Only include player-character actors from the target folder.
    if (actor.type !== 'character') return;
    if (!actor.folder || actor.folder.name !== targetFolder) return;

    const sys = actor.system;

    // PF2e remastered: perception modifier lives at system.perception.mod.
    // Classic/pre-remaster: system.attributes.perception.value — try both.
    const initiativeMod =
      getNestedNumber(sys, 'perception.mod') ??
      getNestedNumber(sys, 'attributes.perception.value') ??
      0;

    const maxHp = getNestedNumber(sys, 'attributes.hp.max') ?? 0;

    members.push({
      id: actor.id,
      name: actor.name,
      img: actor.img ?? '',
      initiativeMod,
      maxHp,
    });
  });

  return Promise.resolve(members);
}
