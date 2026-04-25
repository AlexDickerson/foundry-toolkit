import type {
  CompendiumDocumentData,
  GetCompendiumDocumentParams,
  GetCompendiumDocumentResult,
} from '@/commands/types';
import { extractTokenImg } from './extractTokenImg';

interface FoundryDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string | null;
  // Actor-only; Item documents omit it. Typed as `unknown` so we don't
  // over-promise — `extractTokenImg` walks it defensively.
  prototypeToken?: unknown;
  toObject(source?: boolean): {
    system: Record<string, unknown>;
    /** Embedded item documents (spells, passive actions, feats, etc.).
     *  Present on Actor documents; absent on Item documents. */
    items?: Array<{
      _id?: string;
      name: string;
      type: string;
      img?: string;
      system: Record<string, unknown>;
    }>;
  };
}

interface FoundryGlobals {
  fromUuid: (uuid: string) => Promise<FoundryDocument | null | undefined>;
}

function getFoundry(): FoundryGlobals {
  return globalThis as unknown as FoundryGlobals;
}

// Resolves a compendium UUID to its full document payload. Used by the
// picker's detail panel; the normal name-match response from
// find-in-compendium is deliberately lean.
//
// We call `document.toObject(false)` so the caller gets the *source*
// data minus any transient runtime bits pf2e layers on. That's what a
// subsequent "create from compendium" path would reuse anyway.
export async function getCompendiumDocumentHandler(
  params: GetCompendiumDocumentParams,
): Promise<GetCompendiumDocumentResult> {
  const { fromUuid } = getFoundry();
  const doc = await fromUuid(params.uuid);
  if (!doc) {
    throw new Error(`Compendium document not found: ${params.uuid}`);
  }
  const tokenImg = extractTokenImg(doc);
  const raw = doc.toObject(false);
  const data: CompendiumDocumentData = {
    id: doc.id,
    uuid: doc.uuid,
    name: doc.name,
    type: doc.type,
    img: doc.img ?? '',
    system: raw.system,
  };
  // Only attach when present so item docs stay clean on the wire.
  if (tokenImg !== undefined) data.tokenImg = tokenImg;
  // Include embedded items (spells, actions, feats) for Actor documents so
  // the detail pane can display spellcasting lists and passive abilities.
  // Deliberately omitted from dumpCompendiumPackHandler — the cache warms
  // thousands of docs and items would double the memory footprint.
  if (Array.isArray(raw.items) && raw.items.length > 0) {
    data.items = raw.items.map((item) => ({
      id: item._id ?? '',
      name: item.name,
      type: item.type,
      system: item.system,
    }));
  }
  return { document: data };
}
