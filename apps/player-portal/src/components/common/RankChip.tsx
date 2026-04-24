import type { ProficiencyRank } from '../../api/types';
import { t } from '../../i18n/t';
import { RANK_BG, RANK_I18N_KEY } from '../../lib/pf2e-maps';

interface Props {
  rank: ProficiencyRank;
  className?: string;
}

// Fixed-width label chip in the pf2e rank palette. Used in every proficiency
// row (skill, save, martial, class DC).
export function RankChip({ rank, className }: Props): React.ReactElement {
  const bg = RANK_BG[rank];
  return (
    <span
      className={[
        'inline-flex h-5 w-20 shrink-0 items-center justify-center',
        'rounded-sm text-[10px] font-medium uppercase tracking-wider text-white',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] border border-black/50',
        bg,
        className ?? '',
      ].join(' ')}
      data-rank={rank}
    >
      {t(RANK_I18N_KEY[rank])}
    </span>
  );
}
