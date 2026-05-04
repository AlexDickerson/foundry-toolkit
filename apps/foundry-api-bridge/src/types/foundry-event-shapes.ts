// Shared Foundry VTT global type shims.
// Handler *Types.ts files previously each declared their own copy of these interfaces.

export interface FoundryDiceTerm {
  faces?: number;
  number?: number;
  results?: Array<{ result: number }>;
}

export interface FoundryD20Roll {
  total: number;
  formula: string;
  terms: FoundryDiceTerm[];
  isCritical: boolean;
  isFumble: boolean;
}

export interface FoundryDamageRoll {
  total: number;
  formula: string;
  terms: FoundryDiceTerm[];
}

export interface RollDialogConfig {
  configure: boolean;
}

export interface RollMessageConfig {
  create: boolean;
}

// Superset of the FoundryRoll shapes in itemTypes.ts (required terms) and
// tableTypes.ts (no terms). tableTypes only needs {total, formula}.
export interface FoundryRoll {
  total: number;
  formula: string;
  terms?: FoundryDiceTerm[];
  isCritical?: boolean;
  isFumble?: boolean;
}

// ── Item / Actor shapes ────────────────────────────────────────────────────

export interface ActorItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system?: Record<string, unknown>;
  toMessage?(args?: Record<string, unknown>): Promise<unknown>;
}

export type FoundryItem = ActorItem;

export interface ActorItemsCollection {
  contents?: ActorItem[];
  get(id: string): ActorItem | undefined;
}

export type FoundryItemsCollection = ActorItemsCollection;

// Superset of FoundryActor across actorTypes.ts, itemTypes.ts, and
// actor/actions/types.ts. PF2e-specific methods are optional.
export interface FoundryActor {
  id: string;
  uuid?: string;
  name: string;
  type?: string;
  img?: string;
  folder?: { id: string; name: string } | null;
  items?: ActorItemsCollection;
  system?: Record<string, unknown>;
  update?(data: Record<string, unknown>): Promise<FoundryActor>;
  delete?(): Promise<FoundryActor>;
  toObject?(source?: boolean): Record<string, unknown>;
  transferItemToActor?(targetActor: FoundryActor, item: ActorItem, quantity: number): Promise<unknown>;
  increaseCondition?(slug: string): Promise<unknown>;
  decreaseCondition?(slug: string): Promise<unknown>;
  getStatistic?(slug: string): unknown;
}

export interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
  forEach?(fn: (actor: FoundryActor) => void): void;
}

// ── Pack shapes ────────────────────────────────────────────────────────────

// Superset of FoundryPack from actorTypes.ts (simple, with getDocument) and
// worldTypes.ts (with index, richer metadata).
export interface FoundryPack {
  collection: string;
  metadata: {
    type?: string;
    label?: string;
    system?: string;
    packageName?: string;
  };
  index?: { size: number };
  getDocument?(id: string): Promise<FoundryActor | null>;
}

export interface PacksCollection {
  get(id: string): FoundryPack | undefined;
  forEach?(fn: (pack: FoundryPack) => void): void;
  size?: number;
}

// ── Scene / Token shapes ───────────────────────────────────────────────────

// Superset of FoundryToken from sceneTypes.ts (display-only, optional fields)
// and tokenTypes.ts (CRUD, required fields). Handler files that need strict
// required fields extend this interface locally.
export interface FoundryToken {
  id: string;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  elevation?: number;
  rotation?: number;
  hidden?: boolean;
  texture?: { src: string };
  disposition?: number;
  actor?: {
    id: string;
    system?: {
      attributes?: {
        hp?: { value: number; max: number };
        ac?: { value: number };
      };
    };
    statuses?: Set<string>;
  } | null;
  update?(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<FoundryToken>;
  delete?(): Promise<FoundryToken>;
}

export interface FoundryTokensCollection {
  get(id: string): FoundryToken | undefined;
  contents?: FoundryToken[];
}

// Superset of FoundryScene from sceneTypes.ts (full detail with notes, walls,
// etc.) and tokenTypes.ts (slim CRUD surface with embedded document methods).
export interface FoundryScene {
  id: string;
  name: string;
  active?: boolean;
  img?: string;
  background?: { src?: string };
  width?: number;
  height?: number;
  grid?: {
    size?: number;
    type?: number;
    units?: string;
    distance?: number;
  };
  darkness?: number;
  notes?: { contents: unknown[] };
  walls?: { contents: unknown[] };
  lights?: { contents: unknown[] };
  tiles?: { contents: unknown[] };
  drawings?: { contents: unknown[] };
  regions?: { contents: unknown[] };
  tokens?: { contents: FoundryToken[] };
  createEmbeddedDocuments?(type: string, data: Record<string, unknown>[]): Promise<unknown[]>;
  deleteEmbeddedDocuments?(type: string, ids: string[]): Promise<unknown[]>;
  activate?(): Promise<FoundryScene>;
}

// Superset of FoundryScenesCollection from sceneTypes.ts (get, active, forEach)
// and tokenTypes.ts (get, active — no forEach).
export interface FoundryScenesCollection {
  get(id: string): FoundryScene | undefined;
  active: FoundryScene | null;
  forEach?(fn: (scene: FoundryScene) => void): void;
}

// ── Game global shim ──────────────────────────────────────────────────────

// Base Foundry game global shape covering the actors + packs slice.
// Handler files that need combat, tables, journal, etc. declare domain-specific
// extensions locally. The `declare const game: FoundryGame` idiom in each
// handler file narrows this to whatever properties the handler actually reads.
export interface FoundryGame {
  actors?: ActorsCollection & {
    documentClass?: {
      create(data: Record<string, unknown>): Promise<FoundryActor>;
      createDocuments(data: Record<string, unknown>[]): Promise<FoundryActor[]>;
    };
  };
  packs?: PacksCollection;
  scenes?: FoundryScenesCollection;
  messages?: { contents: Array<{ id: string; isRoll?: boolean }> };
  pf2e?: {
    actions?: Record<string, ((options: Record<string, unknown>) => Promise<unknown>) | undefined>;
  };
}
