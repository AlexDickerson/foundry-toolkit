import type { CharacterBiography, CharacterDetails } from '../../api/types';
import { SectionHeader } from '../common/SectionHeader';

interface Props {
  details: CharacterDetails;
}

// Background tab — pf2e system.details.biography + demographic fields.
// Read-only viewer. HTML fields (appearance, backstory, campaignNotes)
// are rendered as raw HTML because the source is our self-hosted
// Foundry; there's no untrusted-user input path into these fields.
export function Background({ details }: Props): React.ReactElement {
  const bio = details.biography;
  if (!hasAnyBackgroundContent(details)) {
    return (
      <section className="space-y-6" data-section="background-empty">
        <p className="text-sm italic text-neutral-500">
          No background details recorded for this character yet.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-6">
      <DemographicsBlock details={details} />
      <TextBlock title="Appearance" html={bio.appearance} />
      <TextBlock title="Backstory" html={bio.backstory} dataSection="backstory" />
      <PersonalityBlock bio={bio} />
      <EdictsAnathemaBlock bio={bio} />
      <SocialBlock bio={bio} />
      <TextBlock title="Campaign Notes" html={bio.campaignNotes} dataSection="campaign-notes" />
    </section>
  );
}

function hasAnyBackgroundContent(details: CharacterDetails): boolean {
  const bio = details.biography;
  const demographicValues = [
    details.gender.value,
    details.ethnicity.value,
    details.nationality.value,
    details.age.value,
    details.height.value,
    details.weight.value,
    bio.birthPlace,
  ];
  const textValues = [
    bio.appearance,
    bio.backstory,
    bio.campaignNotes,
    bio.attitude,
    bio.beliefs,
    bio.likes,
    bio.dislikes,
    bio.catchphrases,
    bio.allies,
    bio.enemies,
    bio.organizations,
  ];
  if (demographicValues.some((v) => v.trim() !== '')) return true;
  if (textValues.some((v) => v.trim() !== '')) return true;
  if (bio.edicts.length > 0 || bio.anathema.length > 0) return true;
  return false;
}

// ─── Sub-sections ──────────────────────────────────────────────────────

function DemographicsBlock({ details }: { details: CharacterDetails }): React.ReactElement | null {
  const fields: Array<[label: string, value: string]> = [
    ['Gender', details.gender.value],
    ['Ethnicity', details.ethnicity.value],
    ['Nationality', details.nationality.value],
    ['Age', details.age.value],
    ['Height', details.height.value],
    ['Weight', details.weight.value],
    ['Birthplace', details.biography.birthPlace],
  ];
  const populated = fields.filter(([, v]) => v.trim() !== '');
  if (populated.length === 0) return null;
  return (
    <div data-section="demographics">
      <SectionHeader>Demographics</SectionHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {populated.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2" data-field={label.toLowerCase()}>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</dt>
            <dd className="text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PersonalityBlock({ bio }: { bio: CharacterBiography }): React.ReactElement | null {
  const fields: Array<[label: string, value: string]> = [
    ['Attitude', bio.attitude],
    ['Beliefs', bio.beliefs],
    ['Likes', bio.likes],
    ['Dislikes', bio.dislikes],
    ['Catchphrases', bio.catchphrases],
  ];
  const populated = fields.filter(([, v]) => v.trim() !== '');
  if (populated.length === 0) return null;
  return (
    <div data-section="personality">
      <SectionHeader>Personality</SectionHeader>
      <dl className="space-y-1.5 text-sm">
        {populated.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              {label}
            </dt>
            <dd className="text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EdictsAnathemaBlock({ bio }: { bio: CharacterBiography }): React.ReactElement | null {
  if (bio.edicts.length === 0 && bio.anathema.length === 0) return null;
  return (
    <div data-section="edicts-anathema">
      <SectionHeader>Edicts &amp; Anathema</SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ListCol label="Edicts" entries={bio.edicts} />
        <ListCol label="Anathema" entries={bio.anathema} />
      </div>
    </div>
  );
}

function ListCol({ label, entries }: { label: string; entries: string[] }): React.ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <div data-list={label.toLowerCase()}>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-600">{label}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-900">
        {entries.map((e, i) => (
          <li key={`${label}-${i.toString()}`}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function SocialBlock({ bio }: { bio: CharacterBiography }): React.ReactElement | null {
  const fields: Array<[label: string, value: string]> = [
    ['Allies', bio.allies],
    ['Enemies', bio.enemies],
    ['Organizations', bio.organizations],
  ];
  const populated = fields.filter(([, v]) => v.trim() !== '');
  if (populated.length === 0) return null;
  return (
    <div data-section="social">
      <SectionHeader>Connections</SectionHeader>
      <dl className="space-y-1.5 text-sm">
        {populated.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              {label}
            </dt>
            <dd className="text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TextBlock({
  title,
  html,
  dataSection,
}: {
  title: string;
  html: string;
  dataSection?: string;
}): React.ReactElement | null {
  if (html.trim() === '') return null;
  return (
    <div data-section={dataSection ?? title.toLowerCase()}>
      <SectionHeader>{title}</SectionHeader>
      <div
        className="max-w-none text-sm leading-relaxed text-neutral-900 [&_p]:my-2 [&_p]:leading-relaxed"
        // Safe: source is our own Foundry world, not untrusted user input.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
