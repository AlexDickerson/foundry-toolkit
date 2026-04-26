// Compact stat block pinned to the right of the combat tab. Renders the
// current actor — monsters load their stat block from the DB and compose
// CombatHpBanner with CreatureDetailPane; PCs show initiative info and
// their spells as hover chips (when a Foundry actor id is available).

import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type {
  ActorSpellcasting,
  CombatSpellEntry,
  CombatSpellSummary,
  Combatant,
  MonsterDetail,
  MonsterSpellInfo,
} from '@foundry-toolkit/shared/types';
import { CombatHpBanner } from './CombatHpBanner';
import { CreatureDetailPane, SpellChip } from '../creatures/CreatureDetailPane';

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
          {/* Compact identity row: level, rarity, size, traits */}
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
          <PcSpellsSection actorId={combatant.foundryActorId} />
        ) : (
          <p className="text-[11px] italic">Add via party picker to see spells.</p>
        )}
      </div>
    </ScrollArea>
  );
}

// ─── PC spell display ────────────────────────────────────────────────────────

function PcSpellsSection({ actorId }: { actorId: string }) {
  const [spellcasting, setSpellcasting] = useState<ActorSpellcasting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const doLoad = async () => {
      try {
        const data = await api.getActorSpellcasting(actorId);
        if (!cancelled) setSpellcasting(data);
      } catch (e) {
        console.error('getActorSpellcasting failed:', e);
        if (!cancelled) setSpellcasting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void doLoad();
    return () => {
      cancelled = true;
    };
  }, [actorId]);

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
    <div className="space-y-3">
      {spellcasting.entries.map((entry, i) => (
        <div key={entry.id}>
          {i > 0 && <Separator className="my-1" />}
          <PcSpellEntry entry={entry} />
        </div>
      ))}
    </div>
  );
}

function PcSpellEntry({ entry }: { entry: CombatSpellEntry }) {
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

  const subtitle: string[] = [];
  if (entry.tradition) subtitle.push(entry.tradition);
  if (entry.mode !== 'innate' && entry.mode !== 'ritual') subtitle.push(entry.mode);

  return (
    <div className="text-xs">
      <p className="mb-1 font-semibold text-foreground/90">
        {entry.name}
        {subtitle.length > 0 && <span className="ml-1 font-normal text-muted-foreground">({subtitle.join(', ')})</span>}
      </p>

      {cantrips.length > 0 && (
        <div className="mb-1 flex flex-wrap items-baseline gap-1 pl-3">
          <span className="shrink-0 text-muted-foreground">Cantrips:</span>
          {cantrips.map((spell) => (
            <SpellChip key={spell.id} spell={toMonsterSpellInfo(spell)} />
          ))}
        </div>
      )}

      {ranks.map((rank) => {
        const spells = byRank.get(rank) ?? [];
        const slot = entry.slots?.find((s) => s.rank === rank);
        const slotLabel = slot ? ` (${slot.value.toString()}/${slot.max.toString()})` : '';
        return (
          <div key={rank} className="mb-1 flex flex-wrap items-baseline gap-1 pl-3">
            <span className="shrink-0 text-muted-foreground">
              Rank {rank}
              {slotLabel}:
            </span>
            {spells.map((spell) => (
              <SpellChip key={spell.id} spell={toMonsterSpellInfo(spell)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Adapt a CombatSpellSummary to the MonsterSpellInfo shape expected by SpellChip.
 *  Uses nullish coalescing on every field so older api-bridge versions that
 *  pre-date the display-field additions can't crash the renderer. */
function toMonsterSpellInfo(spell: CombatSpellSummary): MonsterSpellInfo {
  return {
    name: spell.name,
    rank: spell.rank,
    castTime: spell.actions ?? '',
    range: spell.range ?? '',
    area: spell.area ?? '',
    target: spell.target ?? '',
    traits: spell.traits ?? [],
    description: spell.description ?? '',
  };
}
