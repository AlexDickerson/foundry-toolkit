// Helper shared by DumpCompendiumPackHandler and GetCompendiumDocumentHandler.
//
// Foundry Actor documents carry a `prototypeToken.texture.src` field that
// holds the token artwork URL — distinct from the portrait `img` shown on
// the character sheet. The bridge surfaces both so downstream UIs (e.g.
// dm-tool's Monster Detail pane) can render a token thumbnail separately
// from the portrait. Item documents don't have a prototype token and
// return `undefined`, which the serializer drops from the wire payload.
//
// The document types seen here come from Foundry's live runtime, so we
// read defensively rather than trust any interface. Any deviation (a
// missing field, a non-string src) collapses cleanly to `undefined`.
export function extractTokenImg(doc: unknown): string | undefined {
  const serialized = serializeFull(doc);
  if (!serialized) return undefined;
  const prototypeToken = getObject(serialized, 'prototypeToken');
  if (!prototypeToken) return undefined;
  const texture = getObject(prototypeToken, 'texture');
  if (!texture) return undefined;
  const src = texture['src'];
  return typeof src === 'string' && src.length > 0 ? src : undefined;
}

// Foundry documents expose `toObject(source?: boolean)`; passing `false`
// returns the runtime/derived form which is what the rest of the
// compendium pipeline already uses. We defensively guard against docs
// without a `toObject` (e.g. plain index entries — shouldn't happen on
// these paths, but cheap insurance).
function serializeFull(doc: unknown): Record<string, unknown> | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const toObject = (doc as { toObject?: unknown }).toObject;
  if (typeof toObject !== 'function') return undefined;
  try {
    const serialized = (toObject as (source?: boolean) => unknown).call(doc, false);
    return serialized && typeof serialized === 'object' ? (serialized as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function getObject(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}
