import type { PartyMember, PartyRef } from '@foundry-toolkit/shared/rpc';
import { MemberCard } from './MemberCard';

interface Props {
  party: PartyRef | null;
  members: PartyMember[];
  currentActorId: string;
}

/** Vertical sticky rail — rendered inside the pre-existing 230px left
 *  column in CharacterSheet.  Shows other party members only; the current
 *  character is excluded since they're already the focus of the sheet.
 *  Returns null when no other party members exist. */
export function PartyRail({ party, members, currentActorId }: Props): React.ReactElement | null {
  const others = members.filter((m) => m.id !== currentActorId);
  if (others.length === 0) return null;

  return (
    <div className="sticky top-6 flex max-h-[calc(100svh-3rem)] flex-col gap-2 overflow-y-auto">
      {party !== null && (
        <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-pf-text-muted">
          {party.name}
        </p>
      )}
      {others.map((m) => (
        <MemberCard key={m.id} member={m} isCurrent={false} />
      ))}
    </div>
  );
}
