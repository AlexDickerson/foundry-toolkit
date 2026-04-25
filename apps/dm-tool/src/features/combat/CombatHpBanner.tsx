// Combat-specific banner rendered above the creature stat block.
// Shows the current-turn label, round number, combatant name, and a
// color-coded HP bar. Extracted so the combat sidebar can compose it with
// the shared CreatureDetailPane without leaking combat chrome into that pane.

import { Heart } from 'lucide-react';
import type { Combatant } from '@foundry-toolkit/shared/types';

interface Props {
  combatant: Combatant;
  round: number;
}

export function CombatHpBanner({ combatant, round }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 12px',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Current turn</span>
        <span className="text-[10px] text-muted-foreground">· Round {round}</span>
      </div>
      <h2 className="truncate text-sm font-semibold">{combatant.displayName}</h2>
      <HpBar hp={combatant.hp} maxHp={combatant.maxHp} />
    </div>
  );
}

/** Returns the hex color for an HP bar based on remaining percentage. */
export function hpColor(hp: number, maxHp: number): string {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return pct > 60 ? '#4ade80' : pct > 30 ? '#facc15' : '#f87171';
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const color = hpColor(hp, maxHp);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Heart className="h-3 w-3" style={{ color }} />
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          backgroundColor: 'hsl(var(--muted))',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {hp}/{maxHp}
      </span>
    </div>
  );
}
