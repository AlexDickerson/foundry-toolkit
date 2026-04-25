// Compact stat block pinned to the right of the combat tab. Renders the
// current actor — monsters load their stat block from the DB and compose
// CombatHpBanner with CreatureDetailPane; PCs show name + HP only (no stat
// block available in the tool).

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Combatant, MonsterDetail } from '@foundry-toolkit/shared/types';
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
    <div className="flex flex-1 flex-col gap-3 p-4 text-xs text-muted-foreground">
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
      <p className="text-[11px] italic">
        PCs don&rsquo;t have a stored stat block — consult the player&rsquo;s character sheet.
      </p>
    </div>
  );
}
