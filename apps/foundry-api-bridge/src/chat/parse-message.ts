// Extracts structured semantic data from a PF2e Foundry ChatMessage.
// Returns a discriminated union keyed on `kind` — the portal renders each
// kind with purpose-built components instead of raw PF2e HTML.
//
// Unknown message types fall through to { kind: 'raw', html } so no data is
// lost. Each branch reads defensively with optional chaining: PF2e flag shapes
// vary between system versions, so absent fields must never throw.
//
// This is a pure function: no Foundry globals, no side effects. The
// api-bridge's EventChannelController calls it from within a Foundry hook
// callback, but the function itself can be tested in isolation.
//
// Keep the ChatStructuredData type here in sync with the Zod schema in
// packages/shared/src/rpc/live.ts — the shared schema validates the wire
// payload on the receiving end (foundry-mcp → player-portal).

// ── Local input interface ──────────────────────────────────────────────────
// Mirrors the subset of FoundryChatMessage that we need; the caller
// (EventChannelController) passes the full message object.

interface ParseInputRoll {
  formula: string;
  total: number;
  isCritical?: boolean;
  isFumble?: boolean;
  dice?: Array<{ faces: number; results: Array<{ result: number; active: boolean }> }>;
}

export interface ParseInput {
  id: string;
  content?: string;
  flavor?: string;
  isRoll: boolean;
  rolls?: ParseInputRoll[];
  flags?: Record<string, unknown>;
}

// ── PF2e flag shapes ──────────────────────────────────────────────────────
// Read defensively with optional chaining throughout.

interface Pf2eDcFlags {
  value?: number;
  slug?: string;
}

interface Pf2eContextTarget {
  actor?: string;
  token?: string;
}

interface Pf2eContextFlags {
  type?: string;
  actor?: string;
  item?: string;
  dc?: Pf2eDcFlags;
  target?: Pf2eContextTarget;
}

interface Pf2eOriginFlags {
  actor?: string;
  type?: string;
}

interface Pf2eFlags {
  context?: Pf2eContextFlags;
  origin?: Pf2eOriginFlags;
  outcomePrecise?: string;
}

// ── Output types (mirror chatStructuredDataSchema in packages/shared) ─────

type ChatOutcome = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure';

interface ChatChip {
  type: 'roll-damage' | 'place-template' | 'apply-damage' | 'save' | 'shove' | 'grapple' | 'unknown';
  label: string;
  params: Record<string, unknown>;
}

interface ChatTargetResult {
  actorId?: string;
  tokenId?: string;
  name: string;
  outcome?: ChatOutcome;
}

interface ChatDamagePart {
  formula: string;
  total: number;
  damageType?: string;
}

export type ChatStructuredData =
  | { kind: 'strike-attack'; flavor: string; targets: ChatTargetResult[]; chips: ChatChip[] }
  | { kind: 'damage'; flavor: string; parts: ChatDamagePart[]; total: number; chips: ChatChip[] }
  | { kind: 'skill-check'; flavor: string; dc?: number; outcome?: ChatOutcome; chips: ChatChip[] }
  | { kind: 'saving-throw'; flavor: string; dc?: number; outcome?: ChatOutcome; chips: ChatChip[] }
  | { kind: 'spell-cast'; flavor: string; description: string; chips: ChatChip[] }
  | { kind: 'raw'; html: string };

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a Foundry ChatMessage into structured semantic data.
 *
 * Reads `flags.pf2e.context.type` to determine the message kind, then
 * extracts the relevant fields. Falls through to `{ kind: 'raw', html }`
 * for unrecognised message types so the portal can still render them.
 */
export function parseChatMessage(m: ParseInput): ChatStructuredData {
  const pf2e = extractPf2eFlags(m.flags);
  const contextType = pf2e?.context?.type;
  const originType = pf2e?.origin?.type;

  if (contextType === 'attack-roll') return parseStrikeAttack(m, pf2e);
  if (contextType === 'damage-roll') return parseDamage(m, pf2e);
  if (contextType === 'skill-check') return parseRollCheck('skill-check', m, pf2e);
  if (contextType === 'saving-throw' || contextType === 'flat-check') {
    return parseRollCheck('saving-throw', m, pf2e);
  }
  if (originType === 'spell') return parseSpellCast(m);

  return { kind: 'raw', html: m.content ?? '' };
}

// ── Per-kind parsers ──────────────────────────────────────────────────────

function parseStrikeAttack(m: ParseInput, pf2e: Pf2eFlags | null): ChatStructuredData {
  const ctxTarget = pf2e?.context?.target;
  const outcome = extractOutcome(pf2e);

  const targets: ChatTargetResult[] = [];
  if (ctxTarget?.actor !== undefined) {
    const t: ChatTargetResult = { name: '' };
    t.actorId = ctxTarget.actor;
    if (ctxTarget.token !== undefined) t.tokenId = ctxTarget.token;
    if (outcome !== undefined) t.outcome = outcome;
    targets.push(t);
  }

  return {
    kind: 'strike-attack',
    flavor: stripHtml(m.flavor ?? ''),
    targets,
    chips: [{ type: 'roll-damage', label: 'Roll Damage', params: {} }],
  };
}

function parseDamage(m: ParseInput, _pf2e: Pf2eFlags | null): ChatStructuredData {
  const rolls = m.rolls ?? [];
  const parts = extractDamageParts(rolls);
  const total = rolls.reduce((sum, r) => sum + r.total, 0);

  return {
    kind: 'damage',
    flavor: stripHtml(m.flavor ?? ''),
    parts,
    total,
    chips: [{ type: 'apply-damage', label: 'Apply Damage', params: {} }],
  };
}

function parseRollCheck(
  kind: 'skill-check' | 'saving-throw',
  m: ParseInput,
  pf2e: Pf2eFlags | null,
): ChatStructuredData {
  const data: {
    kind: 'skill-check' | 'saving-throw';
    flavor: string;
    chips: ChatChip[];
    dc?: number;
    outcome?: ChatOutcome;
  } = {
    kind,
    flavor: stripHtml(m.flavor ?? ''),
    chips: [],
  };
  const dc = extractDc(pf2e);
  if (dc !== undefined) data.dc = dc;
  const outcome = extractOutcome(pf2e);
  if (outcome !== undefined) data.outcome = outcome;
  return data;
}

function parseSpellCast(m: ParseInput): ChatStructuredData {
  return {
    kind: 'spell-cast',
    flavor: stripHtml(m.flavor ?? ''),
    description: m.content ?? '',
    chips: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function extractPf2eFlags(flags: Record<string, unknown> | undefined): Pf2eFlags | null {
  const pf2e = flags?.['pf2e'];
  if (typeof pf2e !== 'object' || pf2e === null) return null;
  return pf2e;
}

function extractOutcome(pf2e: Pf2eFlags | null): ChatOutcome | undefined {
  const o = pf2e?.outcomePrecise;
  if (
    o === 'criticalSuccess' ||
    o === 'success' ||
    o === 'failure' ||
    o === 'criticalFailure'
  ) {
    return o;
  }
  return undefined;
}

function extractDc(pf2e: Pf2eFlags | null): number | undefined {
  const val = pf2e?.context?.dc?.value;
  return typeof val === 'number' ? val : undefined;
}

function extractDamageParts(rolls: ParseInputRoll[]): ChatDamagePart[] {
  return rolls.map((r) => {
    const typeMatch = /\[([^\]]+)\]/.exec(r.formula);
    const part: ChatDamagePart = { formula: r.formula, total: r.total };
    const damageType = typeMatch?.[1];
    if (damageType !== undefined) part.damageType = damageType;
    return part;
  });
}

// Strip HTML tags so flavor text stored in structured data is plain text.
// PF2e flavor fields are often `<strong>Strike</strong>: Longsword` etc.
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
