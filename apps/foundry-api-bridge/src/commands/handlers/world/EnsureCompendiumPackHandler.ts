import type { EnsureCompendiumPackParams, EnsureCompendiumPackResult } from '@/commands/types';

// Idempotent world-pack create. Mirrors find-or-create-folder's contract:
// callers (dm-tool's homebrew-item editor) invoke this on every save, and
// the first call provisions the pack while subsequent calls reuse it.
//
// Foundry composes the full pack id as `world.<name>` for any pack created
// at runtime via `CompendiumCollection.createCompendium`. We accept the
// scope-less short name and return the full id so the caller can hand it
// straight to `create-compendium-item`.

interface FoundryPackMetadata {
  label: string;
  type: string;
}

interface FoundryPack {
  collection: string;
  metadata: FoundryPackMetadata;
}

interface PacksCollection {
  get(id: string): FoundryPack | undefined;
}

interface CompendiumCollectionStatic {
  createCompendium(metadata: {
    name: string;
    label: string;
    type: string;
    packageType?: string;
  }): Promise<FoundryPack>;
}

interface FoundryGame {
  packs: PacksCollection | undefined;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

function getCompendiumCollection(): CompendiumCollectionStatic | undefined {
  return (globalThis as unknown as { CompendiumCollection?: CompendiumCollectionStatic }).CompendiumCollection;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export async function ensureCompendiumPackHandler(
  params: EnsureCompendiumPackParams,
): Promise<EnsureCompendiumPackResult> {
  const game = getGame();
  if (!game.packs) {
    throw new Error('Foundry packs collection not available');
  }

  const name = params.name.trim();
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid pack name "${name}" — expected lowercase kebab-case ([a-z0-9][a-z0-9-]*)`);
  }
  const label = params.label.trim();
  if (!label) {
    throw new Error('Pack label cannot be empty');
  }
  const type = params.type ?? 'Item';

  const fullId = `world.${name}`;
  const existing = game.packs.get(fullId);
  if (existing) {
    if (existing.metadata.type !== type) {
      throw new Error(
        `Pack ${fullId} exists but has type "${existing.metadata.type}", expected "${type}". ` +
          `Pick a different name or rename the existing pack.`,
      );
    }
    return {
      id: existing.collection,
      label: existing.metadata.label,
      type: 'Item',
      created: false,
    };
  }

  const Cls = getCompendiumCollection();
  if (!Cls) {
    throw new Error('CompendiumCollection global not available');
  }

  const created = await Cls.createCompendium({ name, label, type, packageType: 'world' });

  return {
    id: created.collection,
    label: created.metadata.label,
    type: 'Item',
    created: true,
  };
}
