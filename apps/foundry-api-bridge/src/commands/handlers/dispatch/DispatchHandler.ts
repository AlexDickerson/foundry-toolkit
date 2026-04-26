// Layer 0 — generic Foundry dispatcher.
//
// Accepts { class, id, method, args } and dispatches to:
//   game[collection].get(id)[method](...args)
//
// Supported classes and their collection mappings are declared in
// CLASS_TO_COLLECTION.  To extend, add a new entry there — no other change
// required.
//
// Marshaling:
//   Inbound  — args of shape { __doc, id } are resolved to live documents.
//   Outbound — Document returns serialized via .toObject(); others pass through.
//
// Errors propagate to the caller unchanged (no swallowing).

import type { DispatchParams, DispatchResult } from '@/commands/types';

// ─── Collection resolver ────────────────────────────────────────────────────

/**
 * Maps Foundry / PF2e class names → world collection names (the property
 * accessed via game[collection]).  Extend this table to add new document
 * types; no other changes are required in the dispatcher.
 */
const CLASS_TO_COLLECTION: Readonly<Record<string, string>> = {
  Actor: 'actors',
  CharacterPF2e: 'actors',
  NPCPF2e: 'actors',
  VehiclePF2e: 'actors',
  HazardPF2e: 'actors',
  FamiliarPF2e: 'actors',
  Item: 'items',
  JournalEntry: 'journal',
};

const SUPPORTED_CLASSES = Object.keys(CLASS_TO_COLLECTION).join(', ');

function resolveCollection(className: string): string {
  const collection = CLASS_TO_COLLECTION[className];
  if (collection === undefined) {
    throw new Error(`Dispatcher: unsupported class '${className}'. Supported: ${SUPPORTED_CLASSES}`);
  }
  return collection;
}

// ─── Inbound arg marshaling ──────────────────────────────────────────────────

interface DocRef {
  __doc: string;
  id: string;
}

function isDocRef(arg: unknown): arg is DocRef {
  if (typeof arg !== 'object' || arg === null) return false;
  const obj = arg as Record<string, unknown>;
  return typeof obj['__doc'] === 'string' && typeof obj['id'] === 'string';
}

function unmarshalArg(arg: unknown, gameObj: Record<string, unknown>): unknown {
  if (!isDocRef(arg)) return arg;

  const collection = CLASS_TO_COLLECTION[arg.__doc];
  if (collection === undefined) {
    console.warn(
      `Foundry API Bridge | Dispatch: DocRef has unknown class '${arg.__doc}' — passing arg through unchanged`,
    );
    return arg;
  }

  const coll = gameObj[collection];
  if (coll == null || typeof (coll as { get?: unknown }).get !== 'function') {
    console.warn(
      `Foundry API Bridge | Dispatch: collection '${collection}' unavailable for DocRef — passing arg through`,
    );
    return arg;
  }

  return (coll as { get: (id: string) => unknown }).get(arg.id);
}

function unmarshalArgs(args: unknown[], gameObj: Record<string, unknown>): unknown[] {
  return args.map((a) => unmarshalArg(a, gameObj));
}

// ─── Dot-path method resolver ────────────────────────────────────────────────
//
// Path syntax:
//   'applyDamage'                            → target.applyDamage
//   'saves.fortitude.roll'                   → target.saves.fortitude.roll
//   'system.actions[@slug:my-sword].rollDamage'
//     → target.system.actions.find(a =>
//         a.slug === 'my-sword' ||
//         a.item?.slug === 'my-sword' ||
//         a.item?.name === 'my-sword'
//       ).rollDamage
//
// The LAST segment is the method name; all prior segments traverse properties.

// Matches 'actions[@slug:my-sword]' — array element lookup by slug.
const ARRAY_SLUG_RE = /^(.+)\[@slug:(.+)\]$/;
// Matches 'variants[0]' — array element lookup by numeric index.
const ARRAY_INDEX_RE = /^(.+)\[(\d+)\]$/;

function resolvePath(target: object, path: string): (...args: unknown[]) => unknown {
  const segments = path.split('.');
  const methodName = segments.pop();

  if (!methodName) {
    throw new Error(`Dispatcher: empty method path`);
  }

  let current: unknown = target;

  for (const segment of segments) {
    const slugMatch = ARRAY_SLUG_RE.exec(segment);
    const indexMatch = slugMatch === null ? ARRAY_INDEX_RE.exec(segment) : null;

    if (slugMatch !== null) {
      // Array-element lookup by slug: 'actions[@slug:my-sword]'
      const prop = slugMatch[1] as string;
      const slug = slugMatch[2] as string;

      const arr = (current as Record<string, unknown>)[prop];
      if (!Array.isArray(arr)) {
        throw new Error(`Dispatcher: '${prop}' is not an array (segment '${segment}')`);
      }

      current = arr.find((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const obj = item as Record<string, unknown>;
        if (obj['slug'] === slug) return true;
        const child = obj['item'] as Record<string, unknown> | undefined;
        return child?.['slug'] === slug || child?.['name'] === slug;
      });

      if (current == null) {
        throw new Error(`Dispatcher: no element with slug '${slug}' found in '${prop}'`);
      }
    } else if (indexMatch !== null) {
      // Array-element lookup by numeric index: 'variants[0]'
      const prop = indexMatch[1] as string;
      const idx = parseInt(indexMatch[2] as string, 10);

      const arr = (current as Record<string, unknown>)[prop];
      if (!Array.isArray(arr)) {
        throw new Error(`Dispatcher: '${prop}' is not an array (segment '${segment}')`);
      }
      current = arr[idx];
      if (current == null) {
        throw new Error(`Dispatcher: no element at index ${idx.toString()} in '${prop}'`);
      }
    } else {
      // Plain property traversal
      if (typeof current !== 'object' || current === null) {
        throw new Error(`Dispatcher: cannot traverse '${segment}' — value is not an object`);
      }
      current = (current as Record<string, unknown>)[segment];
      if (current == null) {
        throw new Error(`Dispatcher: property '${segment}' not found`);
      }
    }
  }

  if (typeof current !== 'object' || current === null) {
    throw new Error(`Dispatcher: cannot call '${methodName}' — resolved context is not an object`);
  }

  const fn = (current as Record<string, unknown>)[methodName];
  if (typeof fn !== 'function') {
    throw new Error(`Dispatcher: '${methodName}' is not a function (got ${typeof fn})`);
  }

  return (fn as (...a: unknown[]) => unknown).bind(current);
}

// ─── Outbound result marshaling ──────────────────────────────────────────────

function marshalResult(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['toObject'] === 'function') {
      return (obj['toObject'] as () => unknown)();
    }
  }
  return raw;
}

// ─── Foundry global ─────────────────────────────────────────────────────────

declare const game: Record<string, unknown>;

// ─── Handler ────────────────────────────────────────────────────────────────

export async function dispatchHandler(params: DispatchParams): Promise<DispatchResult> {
  const { class: className, id, method, args = [] } = params;

  // Log at the boundary.  Do NOT log full args — they can contain large
  // document payloads or secrets.
  console.info(
    `Foundry API Bridge | Dispatch: class=${className} id=${id.slice(0, 8)} method=${method}`,
  );

  const collection = resolveCollection(className);
  const coll = game[collection];

  if (coll == null || typeof (coll as { get?: unknown }).get !== 'function') {
    throw new Error(`Dispatcher: collection '${collection}' not available on game`);
  }

  const doc = (coll as { get: (id: string) => unknown }).get(id);
  if (doc == null) {
    throw new Error(`Dispatcher: ${className} document not found (id '${id}')`);
  }

  const unmarshaledArgs = unmarshalArgs(args, game);

  let raw: unknown;
  try {
    const fn = resolvePath(doc, method);
    raw = await fn(...unmarshaledArgs);
  } catch (error) {
    console.error(
      `Foundry API Bridge | Dispatch error: class=${className} id=${id.slice(0, 8)} method=${method}`,
      error,
    );
    throw error;
  }

  const result = marshalResult(raw);
  const wasDocument = result !== raw && raw != null;
  console.info(
    `Foundry API Bridge | Dispatch result: method=${method} wasDocument=${String(wasDocument)}`,
  );

  return { result };
}
