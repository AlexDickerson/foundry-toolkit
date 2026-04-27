import type { PartyMember, PartyRef } from '@foundry-toolkit/shared/rpc';
import { MemberCard } from './MemberCard';

interface Props {
  party: PartyRef | null;
  members: PartyMember[];
  currentActorId: string;
}

/** Vertical sticky rail — rendered inside the pre-existing 230px left
 *  column in CharacterSheet.  Returns null when the character isn't in a
 *  party so the column stays visually empty. */
export function PartyRail({ party, members, currentActorId }: Props): React.ReactElement | null {
  if (members.length === 0) return null;

  return (
    <div className="sticky top-6 flex max-h-[calc(100svh-3rem)] flex-col gap-2 overflow-y-auto">
      {party !== null && (
        <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-pf-text-muted">
          {party.name}
        </p>
      )}
      {members.map((m) => (
        <MemberCard key={m.id} member={m} isCurrent={m.id === currentActorId} />
      ))}
    </div>
  );
}
