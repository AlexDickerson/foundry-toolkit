// Foundry's enricher system turns inline tokens like
// `@UUID[Compendium.pf2e.spells-srd.Item.abc]{Qi Blast}` into proper
// links at render time. We don't run that system client-side, so the
// tokens come through verbatim in pf2e description HTML. This module
// preprocesses the HTML and replaces the ones we care about with
// styled inline elements ahead of dangerouslySetInnerHTML.
//
// Handlers so far:
//   @UUID[...]{Label}            → styled anchor (no navigation yet)
//   @Damage[1d8[type]]{opt}      → inline bold "1d8 type"
//   @Template[emanation|...]     → italic "15-foot emanation"
//   @Check[will|against:...]     → inline bold "Will save against …"
//   [[/r 1d4 #flavor]]{opt}      → inline bold "1d4" (or the label)
//
// Unhandled tokens still render as literal text. Add handlers here as
// they become painful.

const UUID_PATTERN = /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g;
const TEMPLATE_PATTERN = /@Template\[([^\]]+)\](?:\{([^}]+)\})?/g;
const CHECK_PATTERN = /@Check\[([^\]]+)\](?:\{([^}]+)\})?/g;
const INLINE_ROLL_PATTERN = /\[\[\/(\w+)\s+([^\]]+)\]\](?:\{([^}]+)\})?/g;

// Heightening context: apply to the FIRST @Damage token in a
// description. `delta` is the number of rank steps above the spell's
// base (e.g. 3 for a cantrip auto-heightened from rank 1 to rank 4),
// and `perStep` is the dice added each step (e.g. "2d6"). Multi-
// partition damage only heightens the first partition.
export interface EnrichOptions {
  heightening?: { delta: number; perStep: string };
}

export function enrichDescription(html: string, opts?: EnrichOptions): string {
  // Flavor-intro normalisation: pf2e wraps some ancestries' /
  // classes' opening paragraph in `<p><em>…</em></p>` (book-layout
  // flair). In-app those read as unexpected italics while sibling
  // entries show as plain prose, so strip the whole-paragraph em
  // wrapper. Inline `<em>` inside text stays put.
  const normalised = stripBlockItalicWrappers(html);
  // Damage first — its content can contain nested brackets so the
  // walker-based scanner handles it cleanly before any regex passes.
  const damagePass = replaceDamageTokens(normalised, opts?.heightening);
  // If heightening was requested but no `@Damage[...]` token was
  // rewritten (common for older pf2e spells whose descriptions are
  // plain prose), fall back to a regex that targets "NdS <type>
  // damage" in the surrounding text.
  let out =
    opts?.heightening !== undefined && !damagePass.heightened
      ? heightenPlainTextDamage(damagePass.html, opts.heightening)
      : damagePass.html;
  // Inline rolls ([[/r 1d4 #flavor]]{label}) next — contained to their
  // own [[…]] delimiters so order-sensitive to sit before any single-
  // bracket regex. Most pf2e inline rolls carry an explicit label.
  out = out.replace(INLINE_ROLL_PATTERN, (_match, kind: string, content: string, label?: string) => {
    const fromFormula = content.split('#')[0]?.trim() ?? content;
    const displayLabel = label !== undefined && label.trim().length > 0 ? label : fromFormula;
    return `<span class="pf-damage" title="${escapeAttr(`[[/${kind} ${content}]]`)}">${escapeText(displayLabel)}</span>`;
  });
  // Templates (area shapes) — rendered italic since they're
  // descriptive ("15-foot emanation") rather than actionable.
  out = out.replace(TEMPLATE_PATTERN, (_match, content: string, label?: string) => {
    const displayLabel = label !== undefined && label.trim().length > 0 ? label : formatTemplateContent(content);
    return `<span class="pf-template" title="@Template[${escapeAttr(content)}]">${escapeText(displayLabel)}</span>`;
  });
  // Checks/saves. Rendered bold like damage since they're the
  // mechanical verbs of an ability.
  out = out.replace(CHECK_PATTERN, (_match, content: string, label?: string) => {
    const displayLabel = label !== undefined && label.trim().length > 0 ? label : formatCheckContent(content);
    return `<span class="pf-damage" title="@Check[${escapeAttr(content)}]">${escapeText(displayLabel)}</span>`;
  });
  // UUIDs have no nested brackets inside the `[...]` slot, so a flat
  // regex is fine and runs last so the anchor HTML it produces can't
  // be re-matched by the earlier passes.
  out = out.replace(UUID_PATTERN, (_match, uuid: string, label?: string) => {
    const displayLabel = label !== undefined && label.trim().length > 0 ? label : extractFallbackLabel(uuid);
    return `<a data-uuid="${escapeAttr(uuid)}" class="pf-uuid-link" title="${escapeAttr(uuid)}">${escapeText(displayLabel)}</a>`;
  });
  return out;
}

// ─── @Template / @Check formatters ─────────────────────────────────────

// "emanation|distance:15" → "15-foot emanation"
// "cone|distance:30"      → "30-foot cone"
function formatTemplateContent(content: string): string {
  const params = parsePipeParams(content);
  const type = (params['type'] ?? 'area').toLowerCase();
  const distance = params['distance'];
  return distance !== undefined ? `${distance}-foot ${type}` : type;
}

const SAVE_SLUGS = new Set(['will', 'fortitude', 'reflex']);

// pf2e descriptions embed checks inside sentence context —
//   "must succeed at a @Check[will|against:intimidation] save against your Intimidation DC"
// — so the enricher needs to render the *minimum* needed slug, not a
// fully-formed clause, or the surrounding prose duplicates it.
//
// Defaults (matching pf2e's own enricher):
//   "will|against:X"                 → "Will"
//   "athletics|dc:15"                → "DC 15 Athletics"
//   "fortitude|basic:true"           → "basic Fortitude save"
//   "fortitude|basic:true|dc:25"     → "basic DC 25 Fortitude save"
//
// We deliberately drop `against:X` — the calling prose almost always
// already reads "against the …" so echoing it would duplicate.
function formatCheckContent(content: string): string {
  const params = parsePipeParams(content);
  const slug = params['type'] ?? '';
  const pretty = capitaliseFirst(slug);
  const isSave = SAVE_SLUGS.has(slug.toLowerCase());
  const dc = params['dc'];
  const basic = params['basic'] === 'true' && isSave;

  if (basic) {
    return dc !== undefined ? `basic DC ${dc} ${pretty} save` : `basic ${pretty} save`;
  }
  if (dc !== undefined) {
    return `DC ${dc} ${pretty}`;
  }
  return pretty;
}

// Split "type|key:value|key:value" into a Record. The first segment is
// allowed to be a bare slug (no colon) and lands under `type`; any
// second colon in a value is preserved intact, so compound options
// like `options:area-effect,inflicts:frightened` survive.
function parsePipeParams(raw: string): Record<string, string> {
  const parts = raw.split('|');
  const out: Record<string, string> = {};
  const first = parts[0];
  if (first !== undefined && !first.includes(':')) {
    out['type'] = first.trim();
    parts.shift();
  }
  for (const p of parts) {
    const idx = p.indexOf(':');
    if (idx > 0) {
      out[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    }
  }
  return out;
}

function capitaliseFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── @Damage ───────────────────────────────────────────────────────────

function replaceDamageTokens(
  input: string,
  heightening?: { delta: number; perStep: string },
): { html: string; heightened: boolean } {
  const prefix = '@Damage[';
  let out = '';
  let i = 0;
  // Heightening applies to the FIRST @Damage token only — most pf2e
  // spells have one primary damage line plus a heightened paragraph
  // that *describes* the +Nd… delta. Subsequent damage tokens stay at
  // base (e.g. persistent conditions, splash damage, crit specs).
  let heightenedOnce = false;
  while (i < input.length) {
    const next = input.indexOf(prefix, i);
    if (next === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, next);
    const parsed = scanBalancedBrackets(input, next + prefix.length);
    if (!parsed) {
      // Malformed; emit literal opener and keep walking.
      out += prefix;
      i = next + prefix.length;
      continue;
    }
    let labelEnd = parsed.end;
    let label: string | undefined;
    if (input[parsed.end] === '{') {
      const closeIdx = input.indexOf('}', parsed.end + 1);
      if (closeIdx !== -1) {
        label = input.slice(parsed.end + 1, closeIdx);
        labelEnd = closeIdx + 1;
      }
    }

    let content = parsed.content;
    let didHeighten = false;
    if (!heightenedOnce && heightening !== undefined && heightening.delta > 0) {
      const heightened = heightenDamageContent(content, heightening.perStep, heightening.delta);
      if (heightened !== null) {
        content = heightened;
        didHeighten = true;
        heightenedOnce = true;
      }
    }

    const display = label !== undefined && label.trim().length > 0 ? label : formatDamageContent(content);
    const classes = didHeighten ? 'pf-damage pf-damage-heightened' : 'pf-damage';
    const titleAttr = didHeighten
      ? `@Damage[${escapeAttr(parsed.content)}] · heightened +${heightening?.delta.toString() ?? '0'}`
      : `@Damage[${escapeAttr(parsed.content)}]`;
    out += `<span class="${classes}" title="${escapeAttr(titleAttr)}">${escapeText(display)}</span>`;
    i = labelEnd;
  }
  return { html: out, heightened: heightenedOnce };
}

// Fallback for spell descriptions that store damage as prose ("…deals
// 3d6 fire damage…") instead of `@Damage[]` enricher tokens. We look
// for the first "NdS (type?) damage" match and rewrite the dice. The
// lookbehind-ish guard (checking that we aren't inside a `<span class=
// "pf-damage">`) isn't watertight, but @Damage-token spans won't
// survive the first pass as literal "NdS damage" either, so in
// practice the passes don't step on each other.
function heightenPlainTextDamage(input: string, heightening: { delta: number; perStep: string }): string {
  const step = parseDice(heightening.perStep);
  if (step === null) return input;
  const pattern = /(\d+)d(\d+)(\s+(?:[a-z]+\s+)?damage)/i;
  const m = pattern.exec(input);
  if (!m) return input;
  const count = Number(m[1]);
  const die = Number(m[2]);
  if (!Number.isFinite(count) || !Number.isFinite(die)) return input;
  if (die !== step.die) return input;
  const newCount = count + step.count * heightening.delta;
  const baseText = `${count.toString()}d${die.toString()}`;
  const replaced = `<span class="pf-damage pf-damage-heightened" title="${escapeAttr(`base ${baseText} · heightened +${heightening.delta.toString()}`)}">${newCount.toString()}d${die.toString()}</span>${m[3] ?? ''}`;
  return input.slice(0, m.index) + replaced + input.slice(m.index + m[0].length);
}

// Try to add `delta` copies of `perStep` dice to the first damage
// expression inside `content`. Returns a rewritten content string (e.g.
// "9d6[fire]" from "3d6[fire]" + 2d6 × 3), or null when the base /
// step don't share the same die so merging isn't safe.
function heightenDamageContent(content: string, perStep: string, delta: number): string | null {
  // Parse the first "NdS" (+ optional constant) at the start of the
  // content, tolerating a leading "(" for expressions like "(1d6+2)".
  const firstExpr = parseLeadingDice(content);
  if (firstExpr === null) return null;
  const step = parseDice(perStep);
  if (step === null) return null;
  if (firstExpr.die !== step.die) return null; // only merge same die
  const newCount = firstExpr.count + step.count * delta;
  const rebuilt =
    firstExpr.const === 0
      ? `${newCount.toString()}d${firstExpr.die.toString()}`
      : `${newCount.toString()}d${firstExpr.die.toString()}+${firstExpr.const.toString()}`;
  // Splice the rewritten dice back in. `match` is the exact text we
  // matched against so a regex-free replace keeps nested brackets
  // unharmed.
  return content.slice(0, firstExpr.start) + rebuilt + content.slice(firstExpr.end);
}

interface ParsedDice {
  count: number;
  die: number;
  const: number;
  start: number;
  end: number;
}

function parseLeadingDice(content: string): ParsedDice | null {
  // Skip a single leading "(" so expressions like "(1d6+2)[fire]"
  // still heighten — we rewrite only the dice portion and leave the
  // surrounding punctuation intact.
  const m = /^\(?(\d+)d(\d+)(?:\s*\+\s*(\d+))?/.exec(content);
  if (!m) return null;
  const count = Number(m[1]);
  const die = Number(m[2]);
  const cst = m[3] !== undefined ? Number(m[3]) : 0;
  if (!Number.isFinite(count) || !Number.isFinite(die)) return null;
  const start = content.startsWith('(') ? 1 : 0;
  return { count, die, const: cst, start, end: m[0].length };
}

function parseDice(expr: string): { count: number; die: number } | null {
  const m = /^\s*(\d+)d(\d+)\s*$/.exec(expr);
  if (!m) return null;
  const count = Number(m[1]);
  const die = Number(m[2]);
  if (!Number.isFinite(count) || !Number.isFinite(die)) return null;
  return { count, die };
}

// Starts *inside* the opening bracket and consumes until the matching
// closing bracket, tracking depth. Returns the content (exclusive of
// the outer brackets) and the index just past the closing bracket.
function scanBalancedBrackets(input: string, start: number): { end: number; content: string } | null {
  let i = start;
  let depth = 1;
  while (i < input.length && depth > 0) {
    const c = input[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    if (depth > 0) i++;
  }
  if (depth !== 0) return null;
  return { end: i + 1, content: input.slice(start, i) };
}

// "1d8[bludgeoning]"                        → "1d8 bludgeoning"
// "2d4[bludgeoning],1d6[persistent,fire]"   → "2d4 bludgeoning, 1d6 persistent fire"
// "(1d6+2)[fire]"                           → "(1d6+2) fire"
function formatDamageContent(content: string): string {
  return content
    .replace(/\[([^\]]+)\]/g, (_match, types: string) => ' ' + types.replace(/,/g, ' '))
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── @UUID fallbacks ───────────────────────────────────────────────────

function extractFallbackLabel(uuid: string): string {
  // UUIDs end in opaque IDs; there's no human name to glean without a
  // compendium round-trip. Use the type segment ("Item", "Actor", …)
  // as a weak hint so at least something sensible shows.
  const parts = uuid.split('.');
  return parts.length >= 2 ? (parts[parts.length - 2] ?? 'link') : 'link';
}

// ─── Italic-wrapper normalisation ──────────────────────────────────────

// Match `<p>` optional whitespace, `<em>` opening, content up to the
// first `</em>` (non-greedy) that doesn't contain another block
// boundary, optional whitespace, `</p>`. Replaces with `<p>…</p>` —
// the em wrapper drops but any inline emphasis inside the paragraph
// is preserved (another `<em>` inside the content would short-circuit
// the non-greedy match anyway).
const BLOCK_EM_PATTERN = /<p>\s*<em>([\s\S]*?)<\/em>\s*<\/p>/gi;

function stripBlockItalicWrappers(html: string): string {
  return html.replace(BLOCK_EM_PATTERN, (_match, inner: string) => `<p>${inner}</p>`);
}

// ─── HTML escaping ─────────────────────────────────────────────────────

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
