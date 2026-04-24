// Settings → Monsters panel: live multi-select of the PF2e compendium
// packs the Monster Browser, loot generator, and chat monster tool
// should search.
//
// Fetches three things on mount:
//   - Available packs   → foundry-mcp's /api/compendium/packs?documentType=Actor
//   - Current selection → pf2e.db `compendiumMonsterPackIds` setting (or defaults)
//   - Defaults          → the hardcoded DEFAULT_MONSTER_PACK_IDS constant
//
// Save persists the selection and invalidates the facets-index cache so
// filter panels pick up the new scope on next open. No app restart.
//
// When foundry-mcp is unreachable we surface a one-line error + a
// retry button; the rest of the settings dialog keeps working.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import type { CompendiumPackSummary } from '@foundry-toolkit/shared/types';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; packs: CompendiumPackSummary[]; defaults: string[]; saved: string[] };

export function MonsterPacksSettings() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selection, setSelection] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [packs, saved, defaults] = await Promise.all([
        window.electronAPI.compendiumListPacks('Actor'),
        window.electronAPI.compendiumGetMonsterPackIds(),
        window.electronAPI.compendiumGetDefaultMonsterPackIds(),
      ]);
      // Stable sort for display: by label, with defaults pinned to the top
      // so the most common packs are immediately visible.
      const defaultSet = new Set(defaults);
      const sorted = [...packs].sort((a, b) => {
        const aDefault = defaultSet.has(a.id) ? 0 : 1;
        const bDefault = defaultSet.has(b.id) ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        return a.label.localeCompare(b.label);
      });
      setState({ kind: 'ready', packs: sorted, defaults, saved });
      setSelection(saved);
      setSaveMessage(null);
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback((id: string) => {
    setSelection((prev) => {
      if (!prev) return prev;
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const reset = useCallback(() => {
    if (state.kind !== 'ready') return;
    setSelection([...state.defaults]);
  }, [state]);

  const save = useCallback(async () => {
    if (!selection || state.kind !== 'ready') return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const next = await window.electronAPI.compendiumSetMonsterPackIds(selection);
      setState({ ...state, saved: next });
      setSelection(next);
      setSaveMessage({ kind: 'ok', text: 'Saved. Open the Monsters tab to see the new scope.' });
    } catch (e) {
      setSaveMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, [selection, state]);

  const changed = useMemo(() => {
    if (!selection || state.kind !== 'ready') return false;
    const savedSorted = [...state.saved].sort();
    const currentSorted = [...selection].sort();
    if (savedSorted.length !== currentSorted.length) return true;
    return savedSorted.some((id, i) => id !== currentSorted[i]);
  }, [selection, state]);

  if (state.kind === 'loading') {
    return <p className="text-xs text-muted-foreground">Loading compendium packs…</p>;
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Couldn&apos;t load compendium packs: {state.message}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Is foundry-mcp running and reachable at the URL in Settings → Paths?
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const currentSelection = selection ?? [];

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Compendium packs</Label>
        <p className="pt-0.5 text-[11px] leading-snug text-muted-foreground">
          Packs to search for the Monster Browser, loot generator, and chat creature lookup. Defaults are listed first.
          Everything else from your Foundry install is available — tick any you want to include.
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        <ul className="divide-y divide-border text-xs">
          {state.packs.map((pack) => {
            const checked = currentSelection.includes(pack.id);
            const isDefault = state.defaults.includes(pack.id);
            return (
              <li key={pack.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent/40">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(pack.id)}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="flex-1 truncate">{pack.label}</span>
                  {isDefault && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      default
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground">{pack.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {currentSelection.length === 0 && (
        <p className="text-[11px] text-amber-500">
          No packs selected — saving an empty list resets the scope to defaults.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={reset} disabled={saving} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </Button>
        <Button variant="default" size="sm" onClick={() => void save()} disabled={!changed || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {saveMessage && (
        <p
          className={cn(
            'text-[11px] leading-snug',
            saveMessage.kind === 'ok' ? 'text-emerald-500' : 'text-destructive',
          )}
        >
          {saveMessage.kind === 'ok' ? '✓ ' : '✗ '}
          {saveMessage.text}
        </p>
      )}
    </div>
  );
}
