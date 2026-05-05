interface FoundryWorld {
  id: string;
  title: string;
}

interface FoundrySystem {
  id: string;
  version: string;
}

export interface FoundryPackMetadata {
  label: string;
  type: string;
  system: string | undefined;
  packageName: string;
}

interface FoundryPackIndex {
  size: number;
}

export interface FoundryPack {
  collection: string;
  metadata: FoundryPackMetadata;
  index: FoundryPackIndex;
}

interface FoundryCollection<T> {
  size: number;
  forEach(fn: (item: T) => void): void;
}

export interface FoundryGame {
  world: FoundryWorld | undefined;
  system: FoundrySystem | undefined;
  version: string | undefined;
  journal: FoundryCollection<unknown> | undefined;
  actors: FoundryCollection<unknown> | undefined;
  items: FoundryCollection<unknown> | undefined;
  scenes: FoundryCollection<unknown> | undefined;
  packs: FoundryCollection<FoundryPack> | undefined;
}

export function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

// Compendium document loading types

interface FoundryCompendiumDocument {
  id: string;
  uuid: string;
  name: string;
}

interface FoundryCompendiumPack {
  collection: string;
  metadata: FoundryPackMetadata;
  index: FoundryPackIndex;
  getDocuments(): Promise<FoundryCompendiumDocument[]>;
}

export interface FoundryPacksCollectionFull {
  get(id: string): FoundryCompendiumPack | undefined;
  forEach(fn: (pack: FoundryCompendiumPack) => void): void;
  size: number;
}
