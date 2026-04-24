import type {
  CharacterSystem,
  ClassDC,
  MartialProficiency,
  Modifier,
  ProficiencyRank,
  SkillStatistic,
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

// Proficiencies tab — a direct port of the data shape consumed by
// pf2e's static/templates/actors/character/tabs/proficiencies.hbs.
// Renders the sections the Foundry sheet renders, in order:
//   1. Core skills (acrobatics, arcana, ...; excluding lore)
//   2. Lore skills (ones with `.lore = true`, came from embedded items)
//   3. Attack proficiencies (simple/martial/advanced/unarmed + custom)
//   4. Defense proficiencies (unarmored/light/medium/heavy/barding)
//   5. Spellcasting (omitted when rank is 0)
//   6. Class DCs (one per class; most characters have exactly one)
export function Proficiencies({ system }: Props): React.ReactElement {
  const skills = Object.values(system.skills);
  const coreSkills = skills.filter((s) => !s.lore);
  const loreSkills = skills.filter((s) => s.lore);

  const attacks = filterVisible(system.proficiencies.attacks);
  const defenses = filterVisible(system.proficiencies.defenses);
  const classDCs = Object.values(system.proficiencies.classDCs);
  const showSpellcasting = system.proficiencies.spellcasting.rank > 0;

  return (
    <section className="space-y-6">
      <SectionHeader>{t('PF2E.CoreSkillsHeader')}</SectionHeader>
      <ProficiencyGrid>
        {coreSkills.map((skill) => (
          <SkillRow key={skill.slug} skill={skill} />
        ))}
      </ProficiencyGrid>

      {loreSkills.length > 0 && (
        <>
          <SectionHeader>{t('PF2E.LoreSkillsHeader')}</SectionHeader>
          <ProficiencyGrid>
            {loreSkills.map((skill) => (
              <SkillRow key={skill.slug} skill={skill} spanFull />
            ))}
          </ProficiencyGrid>
        </>
      )}

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

function SkillRow({ skill, spanFull }: { skill: SkillStatistic; spanFull?: boolean }): React.ReactElement {
  return (
    <li
      className={[
        'group relative flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2',
        spanFull === true ? 'sm:col-span-2' : '',
      ].join(' ')}
      data-statistic={skill.slug}
    >
      <Modifier value={skill.value} />
      <span className="flex-1 truncate text-sm text-neutral-900">{renderLabel(skill.label, skill.lore === true)}</span>
      <RankChip rank={skill.rank} />
      <ModifierTooltip title={skill.label} breakdown={skill.breakdown} modifiers={skill.modifiers} />
    </li>
  );
}

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
        'flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2',
        spanFull === true ? 'sm:col-span-2' : '',
      ].join(' ')}
      data-slug={slug}
      title={prof.breakdown}
    >
      <Modifier value={prof.value} />
      <span className="flex-1 truncate text-sm text-neutral-900">{label}</span>
      <RankChip rank={prof.rank} />
    </li>
  );
}

function ClassDCRow({ classDC, spanFull }: { classDC: ClassDC; spanFull: boolean }): React.ReactElement {
  return (
    <li
      className={[
        'group relative flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2',
        spanFull ? 'sm:col-span-2' : '',
      ].join(' ')}
    >
      <span className="inline-flex w-8 justify-end font-mono text-sm tabular-nums text-neutral-900">{classDC.dc}</span>
      <span className="flex-1 truncate text-sm text-neutral-900">{classDC.label}</span>
      <RankChip rank={classDC.rank} />
      <ModifierTooltip title={classDC.label} breakdown={classDC.breakdown} modifiers={classDC.modifiers} />
    </li>
  );
}

function Modifier({ value }: { value: number }): React.ReactElement {
  return (
    <span className="inline-flex w-8 justify-end font-mono text-sm tabular-nums text-emerald-900">
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

function renderLabel(label: string, isLore: boolean): string {
  // Lore labels are free text set by the user ("Tanning Lore"), not i18n
  // keys. Core skill labels are keys like "PF2E.AbilitySkillCore.acrobatics".
  return isLore ? label : t(label);
}

function resolveMartialLabel(slug: string, fallback: string | undefined, keyMap: Record<string, string>): string {
  // Attack/defense proficiency labels aren't on the payload. Resolve via
  // the canonical PF2E.Actor.Character.Proficiency.* keys from en.json.
  // Unmapped slugs (user-added custom proficiencies) humanise the slug.
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
