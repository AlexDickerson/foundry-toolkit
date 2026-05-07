import type { CreateCompendiumItemParams, CreateCompendiumItemResult, CompendiumItemPayload } from '@/commands/types';

// Create a single Item document inside a world compendium pack.
//
// Foundry's preferred path for creating a doc directly in a pack is
// `pack.documentClass.create(data, {pack: pack.collection})`. We don't
// patch identity fields here — the dm-tool side strips `_id`, `_stats`,
// and embedded `_id`s on the clone path before posting, so the payload
// we receive is already a fresh document.

interface FoundryDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
}

interface DocumentClassStatic {
  create(
    data: Record<string, unknown>,
    options?: { pack?: string },
  ): Promise<FoundryDocument | FoundryDocument[]>;
}

interface FoundryPackMetadata {
  type: string;
}

interface FoundryPack {
  collection: string;
  metadata: FoundryPackMetadata;
  documentClass: DocumentClassStatic;
}

interface PacksCollection {
  get(id: string): FoundryPack | undefined;
}

interface FoundryGame {
  packs: PacksCollection | undefined;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

function buildItemData(payload: CompendiumItemPayload): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: payload.name,
    type: payload.type,
    system: payload.system,
  };
  if (payload.img !== undefined) data['img'] = payload.img;
  if (payload.flags !== undefined) data['flags'] = payload.flags;
  if (payload.effects !== undefined && payload.effects.length > 0) {
    // ActiveEffect docs ride along on Item.create as embedded documents.
    // We pass them through verbatim — the editor already validated each
    // change row's shape via the shared Zod schema.
    data['effects'] = payload.effects.map((e) => ({
      name: e.name,
      img: e.img,
      disabled: e.disabled ?? false,
      transfer: e.transfer ?? false,
      changes: e.changes ?? [],
      duration: e.duration ?? {},
    }));
  }
  return data;
}

export async function createCompendiumItemHandler(
  params: CreateCompendiumItemParams,
): Promise<CreateCompendiumItemResult> {
  const game = getGame();
  if (!game.packs) {
    throw new Error('Foundry packs collection not available');
  }

  const pack = game.packs.get(params.packId);
  if (!pack) {
    throw new Error(`Compendium pack not found: ${params.packId}`);
  }
  if (pack.metadata.type !== 'Item') {
    throw new Error(`Compendium pack is not an Item pack: ${params.packId} (type=${pack.metadata.type})`);
  }

  const data = buildItemData(params.item);
  const result = await pack.documentClass.create(data, { pack: pack.collection });
  // Foundry's `create` returns a single doc when given a single record,
  // or an array when given multiple — we always pass one. Be defensive
  // either way so a system patch that flips the shape doesn't crash us.
  const created = Array.isArray(result) ? result[0] : result;
  if (!created) {
    throw new Error(`Failed to create item in pack ${params.packId}`);
  }

  return {
    id: created.id,
    uuid: created.uuid,
    packId: pack.collection,
    name: created.name,
    type: created.type,
  };
}
