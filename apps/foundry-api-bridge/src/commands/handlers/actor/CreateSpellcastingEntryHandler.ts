import type { CreateSpellcastingEntryParams, ItemResult } from '@/commands/types';

interface FoundryItem {
  id: string;
  name: string;
  type: string;
  img: string;
}

interface FoundryActor {
  id: string;
  name: string;
  createEmbeddedDocuments(embeddedName: string, data: Record<string, unknown>[]): Promise<FoundryItem[]>;
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
}

declare const game: FoundryGame;

export async function createSpellcastingEntryHandler(
  params: CreateSpellcastingEntryParams,
): Promise<ItemResult> {
  const actor = game.actors.get(params.actorId);
  if (!actor) throw new Error(`Actor not found: ${params.actorId}`);

  const entryData: Record<string, unknown> = {
    name: params.name,
    type: 'spellcastingEntry',
    system: {
      tradition: { value: params.tradition },
      prepared: { value: params.prepared, flexible: false, validItems: null },
      proficiency: { value: 1 },
      ability: { value: params.ability },
    },
  };

  const created = await actor.createEmbeddedDocuments('Item', [entryData]);
  const entry = created[0];
  if (!entry) throw new Error('createEmbeddedDocuments returned empty array for spellcastingEntry');

  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    img: entry.img,
    actorId: actor.id,
    actorName: actor.name,
  };
}
