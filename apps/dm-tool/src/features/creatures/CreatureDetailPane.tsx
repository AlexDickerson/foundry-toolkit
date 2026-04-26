// Shared creature stat-block layout used by both the monster browser detail
// overlay and the combat tracker sidebar. Renders the two-column content area
// only: left stat column (defenses + saves + abilities) and right scrollable
// section (speed, skills, attacks, abilities, spells, portrait, AoN link).
//
// Identity chrome (name, level/rarity/size/traits, close button) and
// combat chrome (HP bar, conditions) are the responsibility of each caller.

import * as HoverCard from '@radix-ui/react-hover-card';
import { ExternalLink } from 'lucide-react';
import { cleanFoundryMarkup } from '@/lib/foundry-markup';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import type { MonsterDetail, MonsterSpellGroup, MonsterSpellInfo } from '@foundry-toolkit/shared/types';
import { formatSkills } from './monster-skills';

interface Props {
  detail: MonsterDetail;
  onOpenExternal: (url: string) => void;
}

export function CreatureDetailPane({ detail, onOpenExternal }: Props) {
  const mod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const formattedSkills = formatSkills(detail.skills);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left stat column */}
      <div className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border py-3 text-[10px]">
        <StatCell label="AC" value={String(detail.ac)} />
        <StatCell label="HP" value={String(detail.hp)} />
        <Separator className="w-8" />
        <StatCell label="Fort" value={mod(detail.fort)} />
        <StatCell label="Ref" value={mod(detail.ref)} />
        <StatCell label="Will" value={mod(detail.will)} />
        <StatCell label="Perc" value={mod(detail.perception)} />
        <Separator className="w-8" />
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
          <StatCell key={a} label={a.toUpperCase()} value={mod(detail[a])} />
        ))}
      </div>

      {/* Right scrollable content */}
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="space-y-4 p-4">
          {/* Speed, Skills, Immunities / Weaknesses / Resistances */}
          <div className="space-y-1 text-xs">
            <Stat label="Speed" value={detail.speed} />
            {formattedSkills && <Stat label="Skills" value={formattedSkills} />}
            {detail.immunities && <Stat label="Immunities" value={detail.immunities} />}
            {detail.weaknesses && <Stat label="Weaknesses" value={detail.weaknesses} />}
            {detail.resistances && <Stat label="Resistances" value={detail.resistances} />}
          </div>

          {/* Attacks */}
          {(detail.melee || detail.ranged) && (
            <>
              <Separator />
              <section>
                <SectionLabel>Attacks</SectionLabel>
                <div className="space-y-1.5 text-xs">
                  {detail.melee &&
                    cleanFoundryMarkup(detail.melee)
                      .split(';')
                      .map((a) => a.trim())
                      .filter(Boolean)
                      .map((a, i) => (
                        <div key={`m${i}`}>
                          <span className="font-semibold text-muted-foreground">Melee </span>
                          {a}
                        </div>
                      ))}
                  {detail.ranged &&
                    cleanFoundryMarkup(detail.ranged)
                      .split(';')
                      .map((a) => a.trim())
                      .filter(Boolean)
                      .map((a, i) => (
                        <div key={`r${i}`}>
                          <span className="font-semibold text-muted-foreground">Ranged </span>
                          {a}
                        </div>
                      ))}
                </div>
              </section>
            </>
          )}

          {/* Abilities */}
          {detail.abilities && (
            <>
              <Separator />
              <section>
                <SectionLabel>Abilities</SectionLabel>
                <AbilityBlock text={detail.abilities} />
              </section>
            </>
          )}

          {/* Spells */}
          {detail.spells.length > 0 && (
            <>
              <Separator />
              <section>
                <SectionLabel>Spells</SectionLabel>
                <SpellsSection groups={detail.spells} />
              </section>
            </>
          )}

          {/* Full portrait art */}
          {detail.imageUrl && (
            <>
              <Separator />
              <img src={detail.imageUrl} alt={detail.name} className="w-full rounded-md object-contain" />
            </>
          )}

          {/* Archives of Nethys link — opens in the system browser */}
          {detail.aonUrl && (
            <button
              type="button"
              onClick={() => onOpenExternal(detail.aonUrl)}
              className="flex items-center gap-1.5 self-start text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Archives of Nethys
            </button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-foreground">{label} </span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** Map PF2e cast-time values to Unicode action glyphs. */
const CAST_GLYPH: Record<string, string> = {
  '1': '◆',
  '2': '◆◆',
  '3': '◆◆◆',
  reaction: '↺',
  free: '◇',
};

function castGlyph(castTime: string): string {
  return CAST_GLYPH[castTime] ?? castTime;
}

function SpellsSection({ groups }: { groups: MonsterSpellGroup[] }) {
  return (
    <div className="space-y-3 text-xs">
      {groups.map((group, gi) => {
        const parts: string[] = [];
        if (group.tradition) parts.push(group.tradition);
        if (group.dc) parts.push(`DC ${group.dc.toString()}`);
        if (group.attack !== undefined) parts.push(`+${group.attack.toString()} attack`);
        const subtitle = parts.join(' ');

        return (
          <div key={gi}>
            <p className="font-semibold text-foreground/90">
              {group.entryName}
              {subtitle && <span className="ml-1 font-normal text-muted-foreground">({subtitle})</span>}
            </p>
            <div className="mt-1 space-y-1">
              {group.ranks.map((rankRow) => {
                const rankLabel = rankRow.rank === 0 ? 'Cantrips' : `Rank ${rankRow.rank.toString()}`;
                return (
                  <div key={rankRow.rank} className="flex flex-wrap items-baseline gap-1 pl-3">
                    <span className="shrink-0 text-muted-foreground">{rankLabel}:</span>
                    {rankRow.spells.map((spell, si) => (
                      <SpellChip key={si} spell={spell} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SpellChip({ spell }: { spell: MonsterSpellInfo }) {
  const label = spell.usesPerDay !== undefined ? `${spell.name} (${spell.usesPerDay.toString()}/day)` : spell.name;

  return (
    <HoverCard.Root openDelay={300} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span className="cursor-default rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground/90 transition-colors hover:border-border hover:bg-muted">
          {label}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={4}
          avoidCollisions
          collisionPadding={8}
          className="z-50 flex w-72 flex-col rounded-md border border-border bg-popover text-xs shadow-md"
          style={{ maxHeight: 'min(420px, 70vh)' }}
        >
          {/* Sticky header */}
          <div className="shrink-0 border-b border-border/50 px-3 pb-1.5 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-foreground">{spell.name}</span>
              {spell.rank === 0 ? (
                <span className="rounded bg-accent px-1 py-0.5 text-[10px] font-medium">Cantrip</span>
              ) : (
                <span className="rounded bg-accent px-1 py-0.5 text-[10px] font-medium tabular-nums">
                  Rank {spell.rank}
                </span>
              )}
              {spell.castTime && <span className="ml-auto text-muted-foreground">{castGlyph(spell.castTime)}</span>}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 overflow-y-auto px-3 pb-3 pt-1.5">
            {spell.traits.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {spell.traits.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-border px-1 py-0.5 text-[10px] capitalize text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {(spell.range || spell.area || spell.target) && (
              <p className="mb-1.5 text-muted-foreground">
                {[
                  spell.range && `Range ${spell.range}`,
                  spell.area && `Area ${spell.area}`,
                  spell.target && `Target ${spell.target}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            {spell.description && (
              <div
                className="leading-relaxed text-foreground/80 [&_.pf-damage-heightened]:font-semibold [&_.pf-damage-heightened]:text-amber-400 [&_.pf-damage]:font-semibold [&_.pf-damage]:text-primary [&_.pf-template]:italic [&_.pf-template]:text-foreground/70 [&_.pf-uuid-link]:cursor-default [&_.pf-uuid-link]:text-primary [&_p]:my-1.5"
                dangerouslySetInnerHTML={{ __html: enrichDescription(spell.description) }}
              />
            )}
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function AbilityBlock({ text }: { text: string }) {
  const cleaned = cleanFoundryMarkup(text);
  const lines = cleaned.split('\n');

  return (
    <div className="space-y-2 text-xs leading-relaxed text-foreground/90">
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return null;
        if (/^-{3,}$/.test(line)) return <Separator key={i} />;

        // Detect ability name: optional action glyphs then Title-Case words
        // before a parenthetical trait list or a sentence continuation.
        const m = line.match(/^(◆{1,3}\s*)?([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*(?:\s+\d+)?)\s*(.*)/);
        if (m) {
          const [, actions, name, rest] = m;
          return (
            <p key={i}>
              {actions && <span className="text-foreground/50">{actions}</span>}
              <span className="font-semibold">{name}</span>
              {rest && ` ${rest}`}
            </p>
          );
        }

        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
