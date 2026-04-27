import { Trash2 } from 'lucide-react';
import type { Combatant } from '@foundry-toolkit/shared/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { HpEditor } from './HpEditor';

interface Props {
  combatant: Combatant;
  index: number;
  isCurrent: boolean;
  onSetCurrent: () => void;
  onPatch: (patch: Partial<Combatant>) => void;
  onRemove: () => void;
}

export function CombatantRow({ combatant, index, isCurrent, onSetCurrent, onPatch, onRemove }: Props) {
  return (
    <li
      onClick={onSetCurrent}
      className={cn(
        'group flex items-center gap-3 border-b border-border/40 px-3 py-2 text-xs transition-colors hover:bg-accent/30',
        isCurrent && 'bg-primary/10',
      )}
      style={{ cursor: 'pointer' }}
    >
      <span
        className="shrink-0 tabular-nums"
        style={{
          width: 18,
          color: isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          fontWeight: isCurrent ? 600 : 400,
        }}
      >
        {isCurrent ? '▶' : `${index + 1}.`}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* size attribute sizes the input to its text length; width: auto
            overrides the default w-full so empty space in the row still
            propagates clicks up to the <li> setCurrent handler. +1 padding
            character so the caret doesn't clip on the right. */}
        <Input
          value={combatant.displayName}
          onChange={(e) => onPatch({ displayName: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          size={Math.max(4, combatant.displayName.length + 1)}
          style={{ width: 'auto' }}
          className="h-6 border-transparent bg-transparent px-1 text-xs font-medium hover:border-input focus:border-input"
        />
        <div className="mt-0.5 flex items-center gap-1 pl-1 text-[10px] text-muted-foreground">
          <span className="uppercase">{combatant.kind}</span>
          <span>·</span>
          <span>
            Init mod {combatant.initiativeMod >= 0 ? '+' : ''}
            {combatant.initiativeMod}
          </span>
        </div>
      </div>

      <label
        className="flex flex-col items-center gap-0.5"
        onClick={(e) => e.stopPropagation()}
        style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))' }}
      >
        INIT
        <Input
          type="number"
          value={combatant.initiative ?? ''}
          onChange={(e) => onPatch({ initiative: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
          className="h-7 w-14 px-1 text-center text-xs tabular-nums"
        />
      </label>

      <HpEditor combatant={combatant} onPatch={onPatch} />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${combatant.displayName}`}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
