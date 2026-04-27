import { useRef } from 'react';
import { Heart } from 'lucide-react';
import type { Combatant } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { hpColor } from '../CombatHpBanner';

interface Props {
  combatant: Combatant;
  onPatch: (patch: Partial<Combatant>) => void;
}

export function HpEditor({ combatant, onPatch }: Props) {
  // Track HP/maxHp at focus time so we only push to Foundry when the value
  // actually changed during this edit. Also avoids pushing the live-sync
  // round-trip back to Foundry.
  const hpOnFocus = useRef<number>(combatant.hp);
  const maxHpOnFocus = useRef<number>(combatant.maxHp);

  const pushHpIfChanged = () => {
    if (!combatant.foundryActorId) return;
    if (combatant.hp === hpOnFocus.current && combatant.maxHp === maxHpOnFocus.current) return;
    void api
      .pushActorHp(
        combatant.foundryActorId,
        combatant.hp,
        combatant.maxHp !== maxHpOnFocus.current ? combatant.maxHp : undefined,
      )
      .catch((e: Error) => {
        console.warn(`pushActorHp failed for ${combatant.displayName}:`, e.message);
      });
  };

  const color = hpColor(combatant.hp, combatant.maxHp);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
    >
      <span
        style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Heart className="h-2.5 w-2.5" style={{ color }} />
        HP
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Input
          type="number"
          value={combatant.hp}
          onChange={(e) => onPatch({ hp: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          onFocus={() => {
            hpOnFocus.current = combatant.hp;
            maxHpOnFocus.current = combatant.maxHp;
          }}
          onBlur={pushHpIfChanged}
          className="h-7 w-14 px-1 text-center text-xs tabular-nums"
        />
        <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>/</span>
        <Input
          type="number"
          value={combatant.maxHp}
          onChange={(e) => onPatch({ maxHp: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          onFocus={() => {
            hpOnFocus.current = combatant.hp;
            maxHpOnFocus.current = combatant.maxHp;
          }}
          onBlur={pushHpIfChanged}
          className="h-7 w-14 px-1 text-center text-xs tabular-nums"
        />
      </div>
    </div>
  );
}
