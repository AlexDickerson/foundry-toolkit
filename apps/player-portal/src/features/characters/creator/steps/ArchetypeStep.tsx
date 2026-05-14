import type { CompendiumMatch } from '@/features/characters/types';
import { useUuidHover } from '@/shared/hooks/useUuidHover';
import { FeatSlot } from '../FeatSlot';

// Free Archetype variant rule step. Shown only when the rule is enabled.
// Selection is optional — the player can skip to leave the slot open.
export function ArchetypeStep({
  archetypeFeat,
  onPickDedication,
}: {
  archetypeFeat: CompendiumMatch | null;
  onPickDedication: () => void;
}): React.ReactElement {
  const uuidHover = useUuidHover();

  return (
    <div
      className="space-y-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <div className="rounded border border-pf-tertiary/40 bg-pf-tertiary/10 px-4 py-3 text-sm text-pf-alt-dark">
        <p className="font-semibold text-pf-text">Free Archetype</p>
        <p className="mt-1">
          This variant rule grants each character a free archetype feat at every even level. Pick a{' '}
          <strong>Dedication feat</strong> now to claim your first slot — or skip and choose later from the character
          sheet.
        </p>
      </div>

      <FeatSlot
        label="Archetype Dedication"
        selection={archetypeFeat}
        onOpen={onPickDedication}
      />

      {archetypeFeat === null && (
        <p className="text-xs italic text-pf-alt-dark">
          Optional — you can leave this blank and pick an Archetype Dedication later from the character sheet.
        </p>
      )}

      {uuidHover.popover}
    </div>
  );
}
