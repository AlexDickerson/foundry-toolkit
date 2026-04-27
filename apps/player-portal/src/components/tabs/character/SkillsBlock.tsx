import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import { api } from '../../../api/client';
import type { CharacterSystem, SkillStatistic } from '../../../api/types';
import { t } from '../../../i18n/t';
import { formatSignedInt } from '../../../lib/format';
import { useActorAction } from '../../../lib/useActorAction';
import { RankChip } from '../../common/RankChip';
import { SectionHeader } from '../../common/SectionHeader';

export function SkillsBlock({
  skills,
  actorId,
  condensed = false,
}: {
  skills: CharacterSystem['skills'];
  actorId: string;
  condensed?: boolean;
}): React.ReactElement {
  const allSkills = Object.values(skills);
  const coreSkills = allSkills.filter((s) => !s.lore);
  const loreSkills = allSkills.filter((s) => s.lore);

  return (
    <div>
      <SectionHeader band>Skills</SectionHeader>
      <ul className={condensed ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
        {coreSkills.map((skill) => (
          <SkillItem key={skill.slug} skill={skill} actorId={actorId} condensed={condensed} />
        ))}
      </ul>
      {loreSkills.length > 0 && (
        <ul className={condensed ? 'mt-1 grid grid-cols-2 gap-1' : 'mt-2 grid grid-cols-1 gap-2'}>
          {loreSkills.map((skill) => (
            <SkillItem key={skill.slug} skill={skill} actorId={actorId} condensed={condensed} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SkillItem({
  skill,
  actorId,
  condensed = false,
}: {
  skill: SkillStatistic;
  actorId: string;
  condensed?: boolean;
}): React.ReactElement {
  const roll = useActorAction({
    run: () => createPf2eClient(api.dispatch).character(actorId).rollSkill(skill.slug),
  });

  return (
    <li className="rounded border border-pf-border shadow-sm" data-statistic={skill.slug}>
      <button
        type="button"
        className={[
          'flex w-full items-center rounded bg-pf-bg hover:border-pf-tertiary-dark hover:bg-pf-tertiary/40 disabled:opacity-50',
          condensed ? 'gap-1.5 px-1.5 py-1' : 'gap-2 px-3 py-2',
        ].join(' ')}
        onClick={() => {
          roll.trigger();
        }}
        disabled={roll.state === 'pending'}
      >
        <span className="inline-flex w-8 justify-end font-mono text-sm font-semibold tabular-nums text-pf-text">
          {formatSignedInt(skill.value)}
        </span>
        <span className="flex-1 truncate text-sm text-pf-text">
          {skill.lore === true ? skill.label : t(skill.label)}
        </span>
        <RankChip rank={skill.rank} condensed={condensed} />
      </button>
    </li>
  );
}
