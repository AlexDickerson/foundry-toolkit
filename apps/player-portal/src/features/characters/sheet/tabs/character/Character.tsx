import { useEffect, useRef, useState } from 'react';
import type { CharacterSystem, PreparedActorItem } from '@/features/characters/types';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { AbilityBlock } from './AbilityBlock';
import { ConditionsRow, ShieldTile } from './ConditionsBlock';
import { IWRBlock } from './IWRBlock';
import { QuickActionsBlock } from './QuickActionsBlock';
import { SkillsBlock } from './SkillsBlock';
import { StatsBlock } from './StatsBlock';

interface Props {
  system: CharacterSystem;
  actorId: string;
  items: PreparedActorItem[];
  characterLevel: number;
  /** Fired after any server-acknowledged mutation from this tab — long
   *  rest, HP adjust, hero-point adjust — so the parent can refetch
   *  `/prepared` and redraw. */
  onActorChanged: () => void;
}

// Character landing tab — ability scores, headline defensive/offensive
// stats, hero points, speeds, languages, traits. Ported in structure
// from pf2e's static/templates/actors/character/tabs/character.hbs, but
// read-only (no input widgets) and Tailwind-styled.
export function Character({ system, actorId, items, characterLevel, onActorChanged }: Props): React.ReactElement {
  const keyAbility = system.details.keyability.value;
  const skillsCardRef = useRef<HTMLDivElement>(null);
  const [qaMaxHeight, setQaMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = skillsCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height + 34;
      setQaMaxHeight(h);
    });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);

  return (
    <section className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4">
      <AbilityBlock abilities={system.abilities} keyAbility={keyAbility} />

      <StatsBlock system={system} actorId={actorId} />

      <div className="flex items-start gap-4 !rounded-none !border-0 !bg-transparent !p-0">
        <div ref={skillsCardRef} className="min-w-0 flex-1 rounded-lg border border-pf-border bg-pf-bg-dark p-4">
          <SkillsBlock skills={system.skills} actorId={actorId} condensed />
        </div>
        <QuickActionsBlock
          strikes={system.actions}
          items={items}
          characterLevel={characterLevel}
          focusPoints={system.resources.focus}
          actorId={actorId}
          onActorChanged={onActorChanged}
          {...(qaMaxHeight !== undefined ? { maxHeight: qaMaxHeight } : {})}
        />
      </div>

      <IWRBlock
        immunities={system.attributes.immunities}
        weaknesses={system.attributes.weaknesses}
        resistances={system.attributes.resistances}
      />

      <div data-section="conditions">
        <SectionHeader band>Conditions</SectionHeader>
        <div className="space-y-3">
          <ConditionsRow
            dying={system.attributes.dying}
            wounded={system.attributes.wounded}
            doomed={system.attributes.doomed}
            actorId={actorId}
            onActorChanged={onActorChanged}
          />
          {system.attributes.shield.itemId !== null && <ShieldTile shield={system.attributes.shield} />}
        </div>
      </div>
    </section>
  );
}
