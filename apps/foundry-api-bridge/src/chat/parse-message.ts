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
// Fields can be absent (optional) OR explicitly null — both variants appear
// in real Foundry messages depending on message type and world state.

interface Pf2eDcFlags {
  value?: number;
  visible?: boolean;
}

interface Pf2eContextTarget {
  actor?: string;
  token?: string;
}

interface Pf2eContextFlags {
  type?: string;
  actor?: string;
  item?: string;
  // null when no DC is set or not applicable (e.g. uncontested attack rolls)
  dc?: Pf2eDcFlags | null;
  // null when no target is set; actor/token are Foundry Document UUIDs
  // ("Actor.xxx" / "Scene.xxx.Token.yyy")
  target?: Pf2eContextTarget | null;
  // Degree of success: set when Foundry can determine it (DC + roll known)
  outcome?: string | null;
}

interface Pf2eOriginFlags {
  actor?: string;
  type?: string;
}

interface Pf2eFlags {
  context?: Pf2eContextFlags;
  origin?: Pf2eOriginFlags;
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
  // 'spell-cast' appears in context.type; origin.type === 'spell' is a fallback
  // for spell messages that lack an explicit context type.
  if (contextType === 'spell-cast' || originType === 'spell') return parseSpellCast(m);

  return { kind: 'raw', html: m.content ?? '' };
}

// ── Per-kind parsers ──────────────────────────────────────────────────────

function parseStrikeAttack(m: ParseInput, pf2e: Pf2eFlags | null): ChatStructuredData {
  const ctxTarget = pf2e?.context?.target;
  // outcome is in context.outcome (null when no target/AC to compare against)
  const outcome = extractOutcome(pf2e);

  const targets: ChatTargetResult[] = [];
  // ctxTarget is null (explicit) or absent when no target was selected
  if (ctxTarget != null && ctxTarget.actor !== undefined) {
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

function parseDamage(m: ParseInput, pf2e: Pf2eFlags | null): ChatStructuredData {
  const rolls = m.rolls ?? [];
  const parts = extractDamageParts(rolls);
  const total = rolls.reduce((sum, r) => sum + r.total, 0);
  const outcome = extractOutcome(pf2e);

  const result: {
    kind: 'damage';
    flavor: string;
    parts: ChatDamagePart[];
    total: number;
    chips: ChatChip[];
    outcome?: ChatOutcome;
  } = {
    kind: 'damage',
    flavor: stripHtml(m.flavor ?? ''),
    parts,
    total,
    chips: [{ type: 'apply-damage', label: 'Apply Damage', params: {} }],
  };
  if (outcome !== undefined) result.outcome = outcome;
  return result;
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
  // PF2e spell-cast messages have an empty flavor field; the spell name is
  // in the content HTML inside the first <h3> element. The <h3> also contains
  // a <span class="action-glyph"> with the action-cost icon — strip those
  // before extracting plain text so the name doesn't include the glyph number.
  const content = m.content ?? '';
  const h3Match = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(content);
  let spellName: string;
  if (h3Match?.[1] !== undefined) {
    const h3Text = h3Match[1].replace(/<span[^>]*class="action-glyph"[^>]*>[\s\S]*?<\/span>/gi, '');
    spellName = stripHtml(h3Text);
  } else {
    spellName = stripHtml(m.flavor ?? '');
  }

  return {
    kind: 'spell-cast',
    flavor: spellName,
    description: content,
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
  // Outcome lives at flags.pf2e.context.outcome (not outcomePrecise).
  // null means Foundry could not determine it yet (e.g. no target AC known).
  const o = pf2e?.context?.outcome;
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
  // dc can be null (no DC set) — treat null the same as absent.
  const dc = pf2e?.context?.dc;
  if (dc == null) return undefined;
  const val = dc.value;
  return typeof val === 'number' ? val : undefined;
}

function extractDamageParts(rolls: ParseInputRoll[]): ChatDamagePart[] {
  return rolls.map((r) => {
    // PF2e formats damage as "2d6 slashing" or "2 * (1d6 + 6) bludgeoning" —
    // the damage type is the last word in the formula (never a bare number).
    const lastWord = /(\w+)\s*$/.exec(r.formula.trim())?.[1];
    const part: ChatDamagePart = { formula: r.formula, total: r.total };
    if (lastWord !== undefined && !/^\d+$/.test(lastWord)) {
      part.damageType = lastWord;
    }
    return part;
  });
}

// Strip HTML tags so flavor text stored in structured data is plain text.
// PF2e flavor fields are often `<h4><strong>Strike</strong></h4>...` etc.
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
