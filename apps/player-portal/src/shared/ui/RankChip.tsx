import type { ProficiencyRank } from '@/features/characters/types';
import { t } from '@/shared/i18n/t';
import { RANK_BG, RANK_I18N_KEY } from '@/shared/lib/pf2e-maps';

interface Props {
  rank: ProficiencyRank;
  /** Show single-letter abbreviation (U/T/E/M/L) in a narrow chip. */
  condensed?: boolean;
  className?: string;
}

const RANK_ABBREV: Record<number, string> = { 0: 'U', 1: 'T', 2: 'E', 3: 'M', 4: 'L' };

// Fixed-width label chip in the pf2e rank palette. Used in every proficiency
// row (skill, save, martial, class DC).
export function RankChip({ rank, condensed = false, className }: Props): React.ReactElement {
  const bg = RANK_BG[rank];
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-sm',
        condensed ? 'h-5 w-6' : 'h-5 w-20',
        'text-[10px] font-medium uppercase tracking-wider text-white',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] border border-black/50',
        bg,
        className ?? '',
      ].join(' ')}
      data-rank={rank}
      title={condensed ? t(RANK_I18N_KEY[rank]) : undefined}
    >
      {condensed ? (RANK_ABBREV[rank as number] ?? '?') : t(RANK_I18N_KEY[rank])}
    </span>
  );
}
