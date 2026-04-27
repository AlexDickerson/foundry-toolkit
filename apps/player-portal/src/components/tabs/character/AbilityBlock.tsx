import type { AbilityKey, CharacterSystem } from '../../../api/types';
import { ABILITY_KEYS } from '../../../api/types';
import { t } from '../../../i18n/t';
import { formatSignedInt } from '../../../lib/format';
import { SectionHeader } from '../../common/SectionHeader';

export function AbilityBlock({
  abilities,
  keyAbility,
}: {
  abilities: CharacterSystem['abilities'];
  keyAbility: AbilityKey;
}): React.ReactElement {
  return (
    <div>
      <SectionHeader band>Ability Modifiers</SectionHeader>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_KEYS.map((ak) => {
          const a = abilities[ak];
          const isKey = ak === keyAbility;
          return (
            <li
              key={ak}
              data-attribute={ak}
              className={[
                'relative flex flex-col items-center rounded border px-2 py-3 shadow-sm',
                isKey ? 'border-pf-tertiary-dark bg-pf-tertiary/40' : 'border-pf-border bg-pf-bg',
              ].join(' ')}
            >
              {isKey && (
                <span
                  className="absolute right-1 top-1 text-[10px] font-semibold uppercase tracking-wider text-pf-primary"
                  title="Key attribute"
                >
                  KEY
                </span>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                {t(a.shortLabel)}
              </span>
              <span className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-pf-text">
                {formatSignedInt(a.mod)}
              </span>
              <span className="text-[10px] text-pf-alt">{t(a.label)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
