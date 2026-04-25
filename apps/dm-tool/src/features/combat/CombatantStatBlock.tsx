// Compact stat block pinned to the right of the combat tab. Renders the
// current actor — monsters load their stat block from the DB and compose
// CombatHpBanner with CreatureDetailPane; PCs show name + HP + their spells
// (when a Foundry actor id is available).

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type {
  ActorSpellcasting,
  CombatSpellEntry,
  CombatSpellSummary,
  Combatant,
  MonsterDetail,
} from '@foundry-toolkit/shared/types';
import { CombatHpBanner } from './CombatHpBanner';
import { CreatureDetailPane } from '../creatures/CreatureDetailPane';

const RARITY_BADGE: Record<string, string> = {
  common: 'bg-zinc-600 text-zinc-100',
  uncommon: 'bg-amber-700 text-amber-100',
  rare: 'bg-blue-700 text-blue-100',
  unique: 'bg-purple-700 text-purple-100',
};

interface Props {
  combatant: Combatant | null;
  round: number;
}

export function CombatantStatBlock({ combatant, round }: Props) {
  const [detail, setDetail] = useState<MonsterDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!combatant || combatant.kind !== 'monster' || !combatant.monsterName) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .monstersGetDetail(combatant.monsterName)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => console.error('monstersGetDetail failed:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [combatant]);

  if (!combatant) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No current actor. Roll initiative to begin.
      </div>
    );
  }

  return (
    <>
      <CombatHpBanner combatant={combatant} round={round} />

      {combatant.kind === 'pc' ? (
        <PcBody combatant={combatant} />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading stat block…</div>
      ) : detail ? (
        <>
          {/* Compact identity row: level, rarity, size, traits — combat chrome
              kept here since CreatureDetailPane is content-only. */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid hsl(var(--border))',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              alignItems: 'center',
            }}
          >
            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              Lvl {detail.level}
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize',
                RARITY_BADGE[detail.rarity.toLowerCase()] ?? 'bg-zinc-600 text-zinc-100',
              )}
            >
              {detail.rarity}
            </span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">{detail.size}</span>
            {detail.traits.slice(0, 6).map((t) => (
              <span key={t} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] capitalize">
                {t}
              </span>
            ))}
          </div>
          <CreatureDetailPane
            detail={detail}
            onOpenExternal={(url) => {
              void api.openExternal(url);
            }}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          Stat block unavailable.
          {combatant.monsterName && (
            <>
              <br />
              <span className="text-[10px]">({combatant.monsterName})</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

function PcBody({ combatant }: { combatant: Combatant }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 p-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>
            Initiative mod {combatant.initiativeMod >= 0 ? '+' : ''}
            {combatant.initiativeMod}
            {combatant.initiative != null && (
              <>
                {' · rolled '}
                <span className="font-medium text-foreground">{combatant.initiative}</span>
              </>
            )}
          </span>
        </div>
        {combatant.foundryActorId ? (
          <SpellsSection actorId={combatant.foundryActorId} />
        ) : (
          <p className="text-[11px] italic">Add via party picker to enable spell casting.</p>
        )}
      </div>
    </ScrollArea>
  );
}

// ─── Spells section ──────────────────────────────────────────────────────────

function SpellsSection({ actorId }: { actorId: string }) {
  const [spellcasting, setSpellcasting] = useState<ActorSpellcasting | null>(null);
  const [loading, setLoading] = useState(true);
  const [castingSpellId, setCastingSpellId] = useState<string | null>(null);
  const [castError, setCastError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getActorSpellcasting(actorId);
      setSpellcasting(data);
    } catch (e) {
      console.error('getActorSpellcasting failed:', e);
      setSpellcasting(null);
    } finally {
      setLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCast = useCallback(
    async (entry: CombatSpellEntry, spell: CombatSpellSummary, rank: number) => {
      if (castingSpellId !== null) return;
      setCastingSpellId(spell.id);
      setCastError(null);
      try {
        await api.castActorSpell({ actorId, entryId: entry.id, spellId: spell.id, rank });
        // Refresh slot state after cast.
        await load();
      } catch (e) {
        console.error('castActorSpell failed:', e);
        setCastError((e as Error).message ?? 'Cast failed');
      } finally {
        setCastingSpellId(null);
      }
    },
    [actorId, castingSpellId, load],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading spells…
      </div>
    );
  }

  if (!spellcasting || spellcasting.entries.length === 0) {
    return <p className="text-[11px] italic">No spellcasting entries found.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {castError && <p className="text-[10px] text-destructive">{castError}</p>}
      {spellcasting.entries.map((entry) => (
        <SpellEntryBlock
          key={entry.id}
          entry={entry}
          castingSpellId={castingSpellId}
          onCast={(spell, rank) => void handleCast(entry, spell, rank)}
        />
      ))}
    </div>
  );
}

function SpellEntryBlock({
  entry,
  castingSpellId,
  onCast,
}: {
  entry: CombatSpellEntry;
  castingSpellId: string | null;
  onCast: (spell: CombatSpellSummary, rank: number) => void;
}) {
  if (entry.spells.length === 0) return null;

  const cantrips = entry.spells.filter((s) => s.isCantrip);
  const regular = entry.spells.filter((s) => !s.isCantrip);

  const byRank = new Map<number, CombatSpellSummary[]>();
  for (const spell of regular) {
    const arr = byRank.get(spell.rank) ?? [];
    arr.push(spell);
    byRank.set(spell.rank, arr);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  const slotByRank = new Map<number, { value: number; max: number }>();
  if (entry.slots) {
    for (const s of entry.slots) {
      slotByRank.set(s.rank, { value: s.value, max: s.max });
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Wand2 className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">{entry.name}</span>
        <span className="text-[9px] uppercase text-muted-foreground">
          {entry.tradition !== '' ? entry.tradition : entry.mode}
        </span>
        {entry.mode === 'focus' && entry.focusPoints && (
          <FocusDots value={entry.focusPoints.value} max={entry.focusPoints.max} />
        )}
      </div>

      {cantrips.length > 0 && (
        <div className="mb-1">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Cantrips</span>
          {cantrips.map((spell) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              slotState={null}
              isCasting={castingSpellId === spell.id}
              onCast={() => onCast(spell, spell.rank)}
            />
          ))}
        </div>
      )}

      {ranks.map((rank) => {
        const spells = byRank.get(rank) ?? [];
        const slotState = slotByRank.get(rank) ?? null;
        return (
          <div key={rank} className="mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Rank {rank}</span>
              {slotState !== null && (
                <span className="text-[9px] tabular-nums text-muted-foreground">
                  {slotState.value}/{slotState.max}
                </span>
              )}
            </div>
            {spells.map((spell) => (
              <SpellRow
                key={spell.id}
                spell={spell}
                slotState={slotState}
                isCasting={castingSpellId === spell.id}
                onCast={() => onCast(spell, rank)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SpellRow({
  spell,
  slotState,
  isCasting,
  onCast,
}: {
  spell: CombatSpellSummary;
  slotState: { value: number; max: number } | null;
  isCasting: boolean;
  onCast: () => void;
}) {
  const noSlotsLeft = slotState !== null && !spell.isCantrip && slotState.value <= 0;
  const isExpended = spell.expended === true;
  const disabled = isCasting || noSlotsLeft || isExpended;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded px-1 py-0.5 text-[10px]',
        isExpended && 'opacity-50',
      )}
    >
      {spell.actions && <span className="shrink-0 text-[9px] text-muted-foreground">[{spell.actions}]</span>}
      <span className={cn('flex-1 truncate', isExpended ? 'line-through text-muted-foreground' : 'text-foreground')}>
        {spell.name}
      </span>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onCast} className="h-5 px-1.5 text-[9px]">
        {isCasting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Cast'}
      </Button>
    </div>
  );
}

function FocusDots({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`Focus: ${value.toString()}/${max.toString()}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn('h-2 w-2 rounded-full border border-primary', i < value ? 'bg-primary' : 'bg-transparent')}
        />
      ))}
    </span>
  );
}
