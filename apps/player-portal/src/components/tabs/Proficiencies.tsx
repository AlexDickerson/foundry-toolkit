import type {
  CharacterSystem,
  ClassDC,
  MartialProficiency,
  Modifier,
  ProficiencyRank,
} from '../../api/types';
import { t } from '../../i18n/t';
import { formatSignedInt } from '../../lib/format';
import { ATTACK_LABEL_KEY, DEFENSE_LABEL_KEY } from '../../lib/pf2e-maps';
import { ModifierTooltip } from '../common/ModifierTooltip';
import { RankChip } from '../common/RankChip';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  system: CharacterSystem;
}

// Proficiencies tab — attack proficiencies, defense proficiencies,
// spellcasting, and class DCs. Skills have moved to the Character tab.
export function Proficiencies({ system }: Props): React.ReactElement {
  const attacks = filterVisible(system.proficiencies.attacks);
  const defenses = filterVisible(system.proficiencies.defenses);
  const classDCs = Object.values(system.proficiencies.classDCs);
  const showSpellcasting = system.proficiencies.spellcasting.rank > 0;

  return (
    <section className="space-y-6">
      <SectionHeader>{t('PF2E.Actor.Character.Proficiency.Attack.Title')}</SectionHeader>
      <ProficiencyGrid>
        {attacks.map(([slug, prof]) => (
          <MartialRow
            key={`atk-${slug}`}
            slug={slug}
            prof={prof}
            label={resolveMartialLabel(slug, prof.label, ATTACK_LABEL_KEY)}
          />
        ))}
      </ProficiencyGrid>

      <SectionHeader>{t('PF2E.Actor.Character.Proficiency.Defense.Title')}</SectionHeader>
      <ProficiencyGrid>
        {defenses.map(([slug, prof]) => (
          <MartialRow
            key={`def-${slug}`}
            slug={slug}
            prof={prof}
            label={resolveMartialLabel(slug, prof.label, DEFENSE_LABEL_KEY)}
          />
        ))}
      </ProficiencyGrid>

      {showSpellcasting && (
        <>
          <SectionHeader>{t('PF2E.Item.Spell.Plural')}</SectionHeader>
          <ProficiencyGrid>
            <MartialRow
              slug="spellcasting"
              prof={{
                rank: system.proficiencies.spellcasting.rank,
                value: 0,
                breakdown: '',
              }}
              label="Spellcasting"
              spanFull
            />
          </ProficiencyGrid>
        </>
      )}

      {classDCs.length > 0 && (
        <>
          <SectionHeader>{t('PF2E.Actor.Character.ClassDC.Plural')}</SectionHeader>
          <ProficiencyGrid>
            {classDCs.map((classDC) => (
              <ClassDCRow key={classDC.slug} classDC={classDC} spanFull={classDCs.length === 1} />
            ))}
          </ProficiencyGrid>
        </>
      )}
    </section>
  );
}

// ─── Section helpers ───────────────────────────────────────────────────

function ProficiencyGrid({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</ul>;
}

// ─── Row renderers ─────────────────────────────────────────────────────

function MartialRow({
  slug,
  prof,
  label,
  spanFull,
}: {
  slug: string;
  prof: MartialProficiency;
  label: string;
  spanFull?: boolean;
}): React.ReactElement {
  return (
    <li
      className={[
        'flex items-center gap-3 rounded border border-pf-border bg-pf-bg px-3 py-2 shadow-sm',
        spanFull === true ? 'sm:col-span-2' : '',
      ].join(' ')}
      data-slug={slug}
      title={prof.breakdown}
    >
      <Modifier value={prof.value} />
      <span className="flex-1 truncate text-sm text-pf-text">{label}</span>
      <RankChip rank={prof.rank} />
    </li>
  );
}

function ClassDCRow({ classDC, spanFull }: { classDC: ClassDC; spanFull: boolean }): React.ReactElement {
  return (
    <li
      className={[
        'group relative flex items-center gap-3 rounded border border-pf-border bg-pf-bg px-3 py-2 shadow-sm',
        spanFull ? 'sm:col-span-2' : '',
      ].join(' ')}
    >
      <span className="inline-flex w-8 justify-end font-mono text-sm tabular-nums text-pf-text">{classDC.dc}</span>
      <span className="flex-1 truncate text-sm text-pf-text">{classDC.label}</span>
      <RankChip rank={classDC.rank} />
      <ModifierTooltip title={classDC.label} breakdown={classDC.breakdown} modifiers={classDC.modifiers} />
    </li>
  );
}

function Modifier({ value }: { value: number }): React.ReactElement {
  return (
    <span className="inline-flex w-8 justify-end font-mono text-sm tabular-nums text-pf-secondary">
      {formatSignedInt(value)}
    </span>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function filterVisible<T extends { visible?: boolean; rank: ProficiencyRank }>(
  map: Record<string, T>,
): Array<[string, T]> {
  return Object.entries(map).filter(([, p]) => p.visible !== false);
}

function resolveMartialLabel(slug: string, fallback: string | undefined, keyMap: Record<string, string>): string {
  const key = keyMap[slug];
  if (key !== undefined) return t(key);
  if (fallback !== undefined) return t(fallback);
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Swallow the unused-import warning for `Modifier` (we only import the
// type, shadowed below by a component of the same name). Safe because the
// type isn't used outside ModifierTooltip props and TS erases it at runtime.
export type _ReexportForTsCheck = Modifier;
