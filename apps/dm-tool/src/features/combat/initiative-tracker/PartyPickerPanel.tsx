import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Combatant, PartyMember } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PARTY_ACTOR_NAME, isAlreadyInEncounter, togglePartySelection } from '../party-picker-utils';

export type PcInput = { name: string; initiativeMod: number; hp?: number; maxHp: number; foundryActorId?: string };

interface Props {
  existing: Combatant[];
  /** Called once with ALL chosen members so they land in one update. */
  onAdd: (pcs: PcInput[]) => void;
  onAddManually: () => void;
  onClose: () => void;
}

/** Party picker: fetches characters from the PF2e party actor and
 *  presents them as a multi-select list.  Falls back to the manual
 *  form via the "Add manually" link when Foundry is not connected or
 *  the party roster is empty. */
export function PartyPickerPanel({ existing, onAdd, onAddManually, onClose }: Props) {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listPartyMembers()
      .then((result) => {
        setMembers(result);
        setFetchStatus('ready');
      })
      .catch((e: Error) => {
        console.warn('PartyPickerPanel: failed to load party members:', e.message);
        setFetchError(e.message || 'Could not reach Foundry.');
        setFetchStatus('error');
      });
  }, []);

  const handleToggle = (id: string) => setSelected((prev) => togglePartySelection(prev, id));

  const toPcInput = (m: PartyMember): PcInput => ({
    name: m.name,
    initiativeMod: m.initiativeMod,
    hp: m.hp,
    maxHp: m.maxHp,
    foundryActorId: m.id,
  });

  const handleAddSelected = () => {
    const chosen = members.filter((m) => selected.has(m.id) && !isAlreadyInEncounter(existing, m)).map(toPcInput);
    if (chosen.length === 0) return;
    onAdd(chosen);
    setSelected(new Set());
  };

  const handleAddAll = () => {
    const fresh = members.filter((m) => !isAlreadyInEncounter(existing, m)).map(toPcInput);
    if (fresh.length === 0) return;
    onAdd(fresh);
    setSelected(new Set());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-xs font-medium text-foreground">Add from Party</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Loading */}
      {fetchStatus === 'loading' && <p className="text-xs text-muted-foreground">Loading party members…</p>}

      {/* Error */}
      {fetchStatus === 'error' && (
        <p className="text-xs text-destructive">{fetchError ?? 'Failed to load party members.'}</p>
      )}

      {/* Empty */}
      {fetchStatus === 'ready' && members.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No characters found in the &ldquo;{PARTY_ACTOR_NAME}&rdquo; party roster.
        </p>
      )}

      {/* Member list */}
      {fetchStatus === 'ready' && members.length > 0 && (
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
          }}
        >
          {members.map((m) => {
            const sel = selected.has(m.id);
            const added = isAlreadyInEncounter(existing, m);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleToggle(m.id)}
                disabled={added}
                title={added ? 'Already in this encounter' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border/40 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-accent/40',
                  sel && 'bg-accent/60',
                  added && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                    sel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground',
                  )}
                >
                  {sel && (
                    <svg viewBox="0 0 8 8" className="h-2.5 w-2.5 fill-current">
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="flex-1 truncate font-medium">{m.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  Init {m.initiativeMod >= 0 ? '+' : ''}
                  {m.initiativeMod} · HP {m.maxHp}
                  {added && <span className="ml-1.5 text-primary">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {fetchStatus === 'ready' && members.length > 0 && (
          <>
            <Button size="sm" onClick={handleAddSelected} disabled={selected.size === 0}>
              {selected.size > 0 ? `Add (${selected.size.toString()})` : 'Add'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddAll}>
              Add all
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={onAddManually}
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Add manually
        </button>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
