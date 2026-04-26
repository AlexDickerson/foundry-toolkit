import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemFacets, ItemSearchParams } from '@foundry-toolkit/shared/types';

interface ItemFilterPanelProps {
  facets: ItemFacets | null;
  params: ItemSearchParams;
  onChange: (next: ItemSearchParams) => void;
}

const RARITY_OPTS = ['COMMON', 'UNCOMMON', 'RARE', 'UNIQUE'] as const;

const RARITY_BORDER: Record<string, string> = {
  COMMON: 'border-zinc-500',
  UNCOMMON: 'border-amber-500',
  RARE: 'border-blue-500',
  UNIQUE: 'border-purple-500',
};

const RARITY_FILL: Record<string, string> = {
  COMMON: 'bg-zinc-500 text-white',
  UNCOMMON: 'bg-amber-600 text-white',
  RARE: 'bg-blue-600 text-white',
  UNIQUE: 'bg-purple-600 text-white',
};

export function ItemFilterPanel({ facets, params, onChange }: ItemFilterPanelProps) {
  const toggleRarity = (rarity: string) => {
    const current = params.rarities ?? [];
    const next = current.includes(rarity) ? current.filter((r) => r !== rarity) : [...current, rarity];
    onChange({ ...params, rarities: next.length > 0 ? next : undefined });
  };

  const toggleTrait = (trait: string) => {
    const current = params.traits ?? [];
    const next = current.includes(trait) ? current.filter((t) => t !== trait) : [...current, trait];
    onChange({ ...params, traits: next.length > 0 ? next : undefined });
  };

  const toggleSource = (source: string) => {
    const current = params.sources ?? [];
    const next = current.includes(source) ? current.filter((s) => s !== source) : [...current, source];
    onChange({ ...params, sources: next.length > 0 ? next : undefined });
  };

  const toggleUsage = (cat: string) => {
    const current = params.usageCategories ?? [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    onChange({ ...params, usageCategories: next.length > 0 ? next : undefined });
  };

  const setMagical = (value: boolean | null) => {
    onChange({ ...params, isMagical: params.isMagical === value ? null : value });
  };

  const activeCount = useMemo(() => {
    let n = 0;
    if (params.rarities?.length) n += params.rarities.length;
    if (params.traits?.length) n += params.traits.length;
    if (params.sources?.length) n += params.sources.length;
    if (params.usageCategories?.length) n += params.usageCategories.length;
    if (params.isMagical != null) n += 1;
    if (params.levelMin != null || params.levelMax != null) n += 1;
    return n;
  }, [params]);

  const clearAll = () => {
    onChange({ keywords: params.keywords, sortBy: params.sortBy, sortDir: params.sortDir, limit: params.limit });
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Label
            className="text-sm tracking-wide text-foreground"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
          >
            Filters
          </Label>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>
      <Separator variant="ornate" />
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* Level range */}
          <section>
            <SectionHeader>Level</SectionHeader>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="0"
                value={params.levelMin ?? ''}
                onChange={(e) => {
                  const min = e.target.value === '' ? undefined : Number(e.target.value);
                  onChange({ ...params, levelMin: min });
                }}
                className="h-7 w-16 px-1.5 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="28"
                value={params.levelMax ?? ''}
                onChange={(e) => {
                  const max = e.target.value === '' ? undefined : Number(e.target.value);
                  onChange({ ...params, levelMax: max });
                }}
                className="h-7 w-16 px-1.5 text-xs"
              />
            </div>
          </section>

          <Separator />

          {/* Rarity */}
          <section>
            <SectionHeader count={params.rarities?.length}>Rarity</SectionHeader>
            <div className="flex flex-wrap gap-1">
              {RARITY_OPTS.map((r) => {
                const active = params.rarities?.includes(r) ?? false;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRarity(r)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                      RARITY_BORDER[r] ?? 'border-border',
                      active
                        ? (RARITY_FILL[r] ?? 'bg-primary text-primary-foreground')
                        : 'bg-background hover:bg-accent',
                    )}
                  >
                    {r.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* Magical / Mundane */}
          <section>
            <SectionHeader>Type</SectionHeader>
            <div className="flex gap-1">
              <PillButton label="Magical" active={params.isMagical === true} onClick={() => setMagical(true)} />
              <PillButton label="Mundane" active={params.isMagical === false} onClick={() => setMagical(false)} />
            </div>
          </section>

          <Separator />

          {/* Usage categories */}
          {facets && facets.usageCategories.length > 0 && (
            <>
              <CheckboxGroup
                label="Usage"
                values={facets.usageCategories}
                selected={params.usageCategories ?? []}
                onToggle={toggleUsage}
              />
              <Separator />
            </>
          )}

          {/* Traits */}
          {facets && facets.traits.length > 0 && (
            <>
              <CollapsibleCheckboxGroup
                label="Traits"
                values={facets.traits}
                selected={params.traits ?? []}
                onToggle={toggleTrait}
                initiallyExpanded
                showCount={15}
              />
              <Separator />
            </>
          )}

          {/* Sources */}
          {facets && facets.sources.length > 0 && (
            <CollapsibleCheckboxGroup
              label="Source"
              values={facets.sources}
              selected={params.sources ?? []}
              onToggle={toggleSource}
              showCount={10}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3
      className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
      style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
    >
      {children}
      {count != null && count > 0 && <span className="text-[10px] font-normal text-primary">{count}</span>}
    </h3>
  );
}

function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border border-border px-2 py-1 text-xs transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function CheckboxGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <section>
      <SectionHeader count={selected.length}>{label}</SectionHeader>
      <div className="space-y-1 pl-1">
        {values.map((v) => {
          const checked = selected.includes(v);
          const id = `filter-${label}-${v}`;
          return (
            <div key={v} className="flex items-center gap-2">
              <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(v)} />
              <label htmlFor={id} className="cursor-pointer text-xs text-foreground/90">
                {formatTraitLabel(v)}
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CollapsibleCheckboxGroup({
  label,
  values,
  selected,
  onToggle,
  initiallyExpanded = false,
  showCount = 10,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
  initiallyExpanded?: boolean;
  showCount?: number;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [showAll, setShowAll] = useState(false);
  const displayValues = showAll ? values : values.slice(0, showCount);
  const hasMore = values.length > showCount;

  return (
    <section>
      <button
        type="button"
        className="mb-1.5 flex w-full items-center justify-between"
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          {label}
        </span>
        {selected.length > 0 && <span className="text-[10px] font-normal text-primary">{selected.length}</span>}
      </button>
      {expanded && (
        <div className="space-y-1 pl-1">
          {displayValues.map((v) => {
            const checked = selected.includes(v);
            const id = `filter-${label}-${v}`;
            return (
              <div key={v} className="flex items-center gap-2">
                <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(v)} />
                <label htmlFor={id} className="cursor-pointer text-xs text-foreground/90">
                  {formatTraitLabel(v)}
                </label>
              </div>
            );
          })}
          {hasMore && (
            <button
              type="button"
              className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowAll((s) => !s)}
            >
              {showAll ? 'Show less' : `Show all ${values.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Title-case a trait/source label for display. */
function formatTraitLabel(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
