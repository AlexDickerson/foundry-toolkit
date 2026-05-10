import type { CompendiumMatch } from '@/features/characters/types';
import { useUuidHover } from '@/shared/hooks/useUuidHover';
import { FeatSlot } from '../FeatSlot';
import { PickerCard } from '../PickerCard';

export function AncestryStep({
  ancestry,
  heritage,
  ancestryFeat,
  ancestrySlugResolved,
  onPickAncestry,
  onPickHeritage,
  onPickAncestryFeat,
}: {
  ancestry: CompendiumMatch | null;
  heritage: CompendiumMatch | null;
  ancestryFeat: CompendiumMatch | null;
  ancestrySlugResolved: boolean;
  onPickAncestry: () => void;
  onPickHeritage: () => void;
  onPickAncestryFeat: () => void;
}): React.ReactElement {
  const uuidHover = useUuidHover();
  return (
    <div
      className="space-y-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <PickerCard label="Ancestry" selection={ancestry} onOpen={onPickAncestry} />
      {ancestry !== null && (
        <div className="space-y-3 border-t border-pf-border pt-4">
          <div data-creator-subpicker="heritage">
            <PickerCard
              label="Heritage"
              selection={heritage}
              onOpen={onPickHeritage}
              disabled={!ancestrySlugResolved}
              {...(ancestrySlugResolved ? {} : { disabledHint: 'Resolving ancestry…' })}
            />
          </div>
          <div data-creator-subsection="ancestry-feat">
            <FeatSlot
              label="Level 1 Ancestry Feat"
              selection={ancestryFeat}
              disabled={!ancestrySlugResolved}
              onOpen={onPickAncestryFeat}
              {...(ancestrySlugResolved ? {} : { disabledHint: 'Resolving ancestry…' })}
            />
          </div>
        </div>
      )}
      {uuidHover.popover}
    </div>
  );
}
