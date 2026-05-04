import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Category rail — three-level nav: System → Category → Publisher.
// Built bottom-up: NavItem (leaf) and NavGroup (expandable) compose
// into SystemGroup which the BookBrowser route renders one of per
// system.

/** Leaf nav item — no chevron, just a clickable label + count. */
export function NavItem({
  name,
  count,
  active,
  onClick,
  indent = 0,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  indent?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between pr-3 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      style={{ paddingLeft: 12 + indent * 12 }}
    >
      <span className="truncate">{name}</span>
      <span className="ml-2 shrink-0 tabular-nums text-[10px] opacity-60">{count}</span>
    </button>
  );
}

/** Expandable nav group — chevron + label + count, with children. */
function NavGroup({
  name,
  count,
  active,
  indent,
  expanded,
  onToggle,
  onClick,
  children,
}: {
  name: string;
  count: number;
  active: boolean;
  indent: number;
  expanded: boolean;
  onToggle: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: indent * 12 }}>
        <button
          type="button"
          className="flex h-6 w-5 items-center justify-center text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'flex flex-1 items-center justify-between py-1.5 pr-3 text-left text-xs transition-colors',
            active
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <span className="truncate">{name}</span>
          <span className="ml-2 shrink-0 tabular-nums text-[10px] opacity-60">{count}</span>
        </button>
      </div>
      {expanded && children}
    </div>
  );
}

/** Top-level system group with nested category → publisher tree. */
export function SystemGroup({
  system,
  selectedSystem,
  selectedCategory,
  selectedPublisher,
  expandedKeys,
  onToggle,
  onSelect,
}: {
  system: {
    name: string;
    categories: { name: string; publishers: { name: string; count: number }[]; count: number }[];
    count: number;
  };
  selectedSystem: string | null;
  selectedCategory: string | null;
  selectedPublisher: string | null;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (sys: string | null, cat: string | null, pub: string | null) => void;
}) {
  const sysActive = selectedSystem === system.name && !selectedCategory;
  return (
    <NavGroup
      name={system.name}
      count={system.count}
      active={sysActive}
      indent={0}
      expanded={expandedKeys.has(system.name)}
      onToggle={() => onToggle(system.name)}
      onClick={() => onSelect(sysActive ? null : system.name, null, null)}
    >
      {system.categories.map((cat) => {
        const catActive = selectedSystem === system.name && selectedCategory === cat.name && !selectedPublisher;
        const hasPubs =
          cat.publishers.length > 1 || (cat.publishers.length === 1 && cat.publishers[0]!.name !== 'Unknown');
        const catKey = `${system.name}/${cat.name}`;
        return hasPubs ? (
          <NavGroup
            key={cat.name}
            name={cat.name}
            count={cat.count}
            active={catActive}
            indent={1}
            expanded={expandedKeys.has(catKey)}
            onToggle={() => onToggle(catKey)}
            onClick={() => onSelect(system.name, catActive ? null : cat.name, null)}
          >
            {cat.publishers.map((pub) => (
              <NavItem
                key={pub.name}
                name={pub.name}
                count={pub.count}
                indent={4}
                active={
                  selectedSystem === system.name && selectedCategory === cat.name && selectedPublisher === pub.name
                }
                onClick={() => {
                  const pubActive =
                    selectedSystem === system.name && selectedCategory === cat.name && selectedPublisher === pub.name;
                  onSelect(system.name, cat.name, pubActive ? null : pub.name);
                }}
              />
            ))}
          </NavGroup>
        ) : (
          <NavItem
            key={cat.name}
            name={cat.name}
            count={cat.count}
            indent={3}
            active={catActive}
            onClick={() => onSelect(system.name, catActive ? null : cat.name, null)}
          />
        );
      })}
    </NavGroup>
  );
}
