/**
 * Canonical character-sheet tab IDs.
 *
 * 'crafting' was removed as a standalone tab; its content is now rendered as
 * a section within the 'inventory' tab.
 * 'proficiencies' and 'background' were merged into 'details'.
 * Any serialised reference to old IDs is redirected by {@link normalizeTabId}.
 */
export type TabId =
  | 'character'
  | 'actions'
  | 'spells'
  | 'inventory'
  | 'feats'
  | 'details'
  | 'progression';

// Compile-time guard: the literal array must cover every TabId exactly.
const VALID_TABS = new Set<string>(
  [
    'character',
    'actions',
    'spells',
    'inventory',
    'feats',
    'details',
    'progression',
  ] satisfies TabId[],
);

/** Removed tab IDs and the canonical tab they redirect to. */
const LEGACY_REDIRECTS: Readonly<Record<string, TabId>> = {
  crafting: 'inventory',
  proficiencies: 'details',
  background: 'details',
};

/**
 * Normalize a raw tab-id string to a valid {@link TabId}.
 *
 * - Valid IDs are returned unchanged.
 * - Removed IDs (e.g. `'crafting'`) map to their designated replacement.
 * - Anything unrecognised falls back to `'character'`.
 */
export function normalizeTabId(raw: string): TabId {
  if (VALID_TABS.has(raw)) return raw as TabId;
  const redirect = LEGACY_REDIRECTS[raw];
  if (redirect !== undefined) return redirect;
  return 'character';
}
