import { useEffect, useMemo, useRef, useState } from 'react';
import type { RemoteDataState } from '../../lib/useRemoteData';
import type { CompendiumSource } from '../../api/types';
import type { CompendiumSearchOptions } from '../../api/types';

export type SortMode = 'alpha' | 'level';
type SortDir = 'asc' | 'desc';
export interface SortState {
  mode: SortMode;
  dir: SortDir;
}

// ─── Source multi-select ────────────────────────────────────────────────

export function SourcePicker({
  sources,
  selected,
  onChange,
}: {
  sources: RemoteDataState<CompendiumSource[]>;
  selected: string[];
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return (): void => {
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const count = selected.length;
  const label =
    sources.kind === 'loading' ? 'Sources (…)' : count === 0 ? 'All sources' : `Sources (${count.toString()})`;

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);
  const filtered = useMemo(() => {
    if (sources.kind !== 'ready') return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return sources.data;
    return sources.data.filter((s) => s.title.toLowerCase().includes(needle));
  }, [sources, filter]);

  const toggle = (title: string): void => {
    const lower = title.toLowerCase();
    onChange(selectedSet.has(lower) ? selected.filter((s) => s.toLowerCase() !== lower) : [...selected, title]);
  };
  const selectAllVisible = (): void => {
    const nextLowers = new Set(selected.map((s) => s.toLowerCase()));
    const next = [...selected];
    for (const s of filtered) {
      if (!nextLowers.has(s.title.toLowerCase())) {
        next.push(s.title);
        nextLowers.add(s.title.toLowerCase());
      }
    }
    onChange(next);
  };
  const clearAll = (): void => {
    onChange([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="source-picker-trigger"
        onClick={(): void => {
          setOpen((v) => !v);
        }}
        className={[
          'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors',
          count > 0
            ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
            : 'border-pf-border bg-pf-bg text-pf-alt-dark hover:text-pf-primary',
        ].join(' ')}
      >
        {label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div
          role="listbox"
          data-testid="source-picker-panel"
          className="absolute left-0 top-full z-10 mt-1 flex max-h-72 w-80 flex-col rounded border border-pf-border bg-pf-bg shadow-lg"
        >
          <div className="flex items-center gap-1 border-b border-pf-border p-2">
            <input
              type="search"
              value={filter}
              onChange={(e): void => {
                setFilter(e.target.value);
              }}
              placeholder="Filter sources…"
              className="flex-1 rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-xs text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
              data-testid="source-picker-filter"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-pf-border px-2 py-1 text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-pf-alt-dark hover:text-pf-primary"
              data-testid="source-picker-select-all"
            >
              Select visible
            </button>
            <span className="text-pf-border">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-pf-alt-dark hover:text-pf-primary"
              data-testid="source-picker-clear"
            >
              Clear
            </button>
            <span className="ml-auto text-pf-alt">
              {sources.kind === 'ready' ? `${filtered.length.toString()} shown` : ''}
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {sources.kind === 'loading' && <li className="p-2 text-xs italic text-pf-alt">Loading sources…</li>}
            {sources.kind === 'error' && (
              <li className="p-2 text-xs text-pf-primary">Failed to load sources: {sources.message}</li>
            )}
            {sources.kind === 'ready' && filtered.length === 0 && (
              <li className="p-2 text-xs italic text-pf-alt">No sources match that filter.</li>
            )}
            {sources.kind === 'ready' &&
              filtered.map((src) => {
                const active = selectedSet.has(src.title.toLowerCase());
                return (
                  <li key={src.title}>
                    <label
                      data-source-title={src.title}
                      className={[
                        'flex cursor-pointer items-center gap-2 px-2 py-1 text-xs',
                        active ? 'bg-pf-tertiary/40' : 'hover:bg-pf-tertiary/20',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(): void => {
                          toggle(src.title);
                        }}
                        className="accent-pf-primary"
                      />
                      <span className="flex-1 truncate text-pf-text">{src.title}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-pf-alt">{src.count}</span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Sort toggle ────────────────────────────────────────────────────────

export function SortToggle({
  sort,
  onChange,
}: {
  sort: SortState;
  onChange: (mode: SortMode) => void;
}): React.ReactElement {
  const options: Array<{ value: SortMode; label: string }> = [
    { value: 'alpha', label: 'A–Z' },
    { value: 'level', label: 'Level' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Sort results"
      data-testid="feat-picker-sort"
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border text-[10px] font-semibold uppercase tracking-widest"
    >
      {options.map((opt) => {
        const active = sort.mode === opt.value;
        const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-sort-option={opt.value}
            data-sort-dir={active ? sort.dir : undefined}
            title={
              active
                ? `Sorting ${opt.label} ${sort.dir === 'asc' ? '↑' : '↓'} — click to reverse`
                : `Sort by ${opt.label}`
            }
            onClick={(): void => {
              onChange(opt.value);
            }}
            className={[
              'px-2 py-0.5 transition-colors',
              active
                ? 'bg-pf-primary text-white'
                : 'bg-pf-bg text-pf-alt-dark hover:bg-pf-tertiary/40 hover:text-pf-primary',
            ].join(' ')}
          >
            {opt.label}
            {arrow}
          </button>
        );
      })}
    </div>
  );
}

// ─── Unmet-prereq toggle ────────────────────────────────────────────────

export function UnmetToggle({
  hide,
  onChange,
}: {
  hide: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  return (
    <label
      data-testid="feat-picker-hide-unmet"
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark"
    >
      <input
        type="checkbox"
        checked={hide}
        onChange={(e): void => {
          onChange(e.target.checked);
        }}
        className="accent-pf-primary"
      />
      Hide unmet
    </label>
  );
}

// ─── Filter summary ─────────────────────────────────────────────────────

export function FilterSummary({
  filters,
}: {
  filters: Pick<CompendiumSearchOptions, 'traits' | 'maxLevel'>;
}): React.ReactElement | null {
  const parts: string[] = [];
  if (filters.traits && filters.traits.length > 0) parts.push(`traits: ${filters.traits.join(', ')}`);
  if (filters.maxLevel !== undefined) parts.push(`level ≤ ${filters.maxLevel.toString()}`);
  if (parts.length === 0) return null;
  return <p className="text-[10px] uppercase tracking-widest text-pf-alt">{parts.join(' · ')}</p>;
}
