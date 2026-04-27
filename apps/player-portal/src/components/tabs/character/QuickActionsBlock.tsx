import { useState } from 'react';
import { createPf2eClient } from '@foundry-toolkit/pf2e-rules';
import { api } from '../../../api/client';
import type { PreparedActorItem, SpellcastingEntryItem, Strike } from '../../../api/types';
import { isCantripSpell, isActionItem, isSpellItem, isSpellcastingEntryItem } from '../../../api/types';
import { useActorAction } from '../../../lib/useActorAction';
import { useQuickActions } from '../../../lib/useQuickActions';
import {
  QuickActionPicker,
  type QuickActionOption,
  type QAStrike,
  type QAItem,
  type QASpell,
} from '../../sheet/QuickActionPicker';

export function QuickActionsBlock({
  strikes,
  items,
  characterLevel,
  focusPoints,
  actorId,
  onActorChanged,
  maxHeight,
}: {
  strikes: Strike[];
  items: PreparedActorItem[];
  characterLevel: number;
  focusPoints: { value: number; max: number };
  actorId: string;
  onActorChanged: () => void;
  maxHeight?: number;
}): React.ReactElement {
  const [selectedIds, setSelectedIds] = useQuickActions(actorId);
  const [showPicker, setShowPicker] = useState(false);

  const allOptions = buildQuickOptions(strikes, items, characterLevel);
  const selected = selectedIds
    .map((id) => allOptions.find((o) => o.id === id))
    .filter((o): o is QuickActionOption => o !== undefined);

  return (
    <div
      className="flex w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-pf-border bg-pf-bg-dark p-4"
      style={maxHeight !== undefined ? { maxHeight } : undefined}
    >
      <div className="-mx-4 -mt-4 mb-3 flex shrink-0 items-center justify-between rounded-t-lg border-b border-pf-border bg-pf-bg px-4 pb-2.5 pt-3">
        <h2 className="font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
          Quick Actions
        </h2>
        <button
          type="button"
          onClick={() => { setShowPicker(true); }}
          title="Configure quick actions"
          className="flex h-5 w-5 items-center justify-center rounded border border-pf-primary/30 text-pf-text-muted hover:bg-pf-primary/10"
          aria-label="Configure quick actions"
        >
          <PencilIcon />
        </button>
      </div>

      {selected.length === 0 ? (
        <p className="text-xs italic text-pf-text-muted">Tap the pencil to add quick actions.</p>
      ) : (
        <ul className="scrollbar-pf min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {selected.map((opt) => {
            if (opt.kind === 'strike') {
              return <StrikeQuickRow key={opt.id} option={opt} actorId={actorId} />;
            }
            if (opt.kind === 'item') {
              return <ItemQuickRow key={opt.id} option={opt} actorId={actorId} onUsed={onActorChanged} />;
            }
            return (
              <SpellQuickRow
                key={opt.id}
                option={opt}
                actorId={actorId}
                items={items}
                focusPoints={focusPoints}
                onCast={onActorChanged}
              />
            );
          })}
        </ul>
      )}

      {showPicker && (
        <QuickActionPicker
          options={allOptions}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onClose={() => { setShowPicker(false); }}
        />
      )}
    </div>
  );
}

function buildQuickOptions(
  strikes: Strike[],
  items: PreparedActorItem[],
  characterLevel: number,
): QuickActionOption[] {
  const strikeOpts: QAStrike[] = strikes
    .filter((s) => s.type === 'strike' && s.visible)
    .map((s) => ({
      kind: 'strike',
      id: `strike:${s.slug}`,
      slug: s.slug,
      label: s.label,
      img: s.item.img,
      variants: s.variants,
    }));

  const itemOpts: QAItem[] = items.filter(isActionItem).map((item) => ({
    kind: 'item',
    id: `item:${item.id}`,
    itemId: item.id,
    label: item.name,
    img: item.img,
  }));

  const spellOpts: QASpell[] = items.filter(isSpellItem).map((spell) => {
    const isCantrip = isCantripSpell(spell);
    const rank = isCantrip ? Math.ceil(characterLevel / 2) : (spell.system.level?.value ?? 1);
    return {
      kind: 'spell',
      id: `spell:${spell.id}`,
      spellId: spell.id,
      label: spell.name,
      img: spell.img,
      entryId: spell.system.location?.value ?? '',
      rank,
      isCantrip,
    };
  });

  return [...strikeOpts, ...itemOpts, ...spellOpts];
}

function StrikeQuickRow({ option, actorId }: { option: QAStrike; actorId: string }): React.ReactElement {
  const damage = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, option.slug).rollDamage(false),
  });
  const crit = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, option.slug).rollDamage(true),
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className="rounded border border-pf-border bg-pf-bg px-2 py-1.5 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5">
        {imgSrc && (
          <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />
        )}
        <span className="flex-1 truncate text-[11px] font-medium text-pf-text">{option.label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {option.variants.map((v, i) => (
          <VariantAttackButton key={i} label={v.label} actorId={actorId} slug={option.slug} variantIndex={i} />
        ))}
        <button
          type="button"
          onClick={() => { damage.trigger(); }}
          disabled={damage.state === 'pending'}
          className="rounded border border-pf-border bg-pf-bg px-2 py-0.5 text-[10px] font-semibold text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
        >
          Dmg
        </button>
        <button
          type="button"
          onClick={() => { crit.trigger(); }}
          disabled={crit.state === 'pending'}
          className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
        >
          Crit
        </button>
      </div>
    </li>
  );
}

function ItemQuickRow({
  option,
  actorId,
  onUsed,
}: {
  option: QAItem;
  actorId: string;
  onUsed: () => void;
}): React.ReactElement {
  const use = useActorAction({
    run: () => api.useItem(actorId, option.itemId),
    onSuccess: onUsed,
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className="rounded border border-pf-border bg-pf-bg px-2 py-1.5 shadow-sm">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />}
          <span className="truncate text-[11px] font-medium text-pf-text">{option.label}</span>
        </div>
        <button
          type="button"
          onClick={() => { use.trigger(); }}
          disabled={use.state === 'pending'}
          className="w-12 shrink-0 rounded border border-pf-border bg-pf-bg py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </li>
  );
}

function SpellQuickRow({
  option,
  actorId,
  items,
  focusPoints,
  onCast,
}: {
  option: QASpell;
  actorId: string;
  items: PreparedActorItem[];
  focusPoints: { value: number; max: number };
  onCast: () => void;
}): React.ReactElement {
  const entry = items.find(
    (i): i is SpellcastingEntryItem => isSpellcastingEntryItem(i) && i.id === option.entryId,
  );
  const mode = entry?.system.prepared.value ?? 'prepared';
  type SlotData = { value?: number; prepared?: { id: string; expended: boolean }[] };
  const slots = entry?.system.slots as Record<string, SlotData> | undefined;
  const slotData = slots?.[`slot${option.rank.toString()}`];

  const isExpended =
    !option.isCantrip && mode === 'prepared'
      ? (slotData?.prepared?.find((p) => p.id === option.spellId)?.expended ?? false)
      : false;
  const noSlotsLeft = !option.isCantrip && mode === 'spontaneous' && (slotData?.value ?? 0) <= 0;
  const noFocus = !option.isCantrip && mode === 'focus' && focusPoints.value <= 0;
  const unavailable = isExpended || noSlotsLeft || noFocus;

  const cast = useActorAction({
    run: () =>
      createPf2eClient(api.dispatch, api.invokeActorAction)
        .spellEntry(actorId, option.entryId)
        .cast(option.spellId, option.rank),
    onSuccess: onCast,
  });
  const imgSrc = option.img ? (option.img.startsWith('/') ? option.img : `/${option.img}`) : '';
  return (
    <li className={['rounded border bg-pf-bg px-2 py-1.5 shadow-sm', unavailable ? 'border-pf-border/50 opacity-60' : 'border-pf-border'].join(' ')}>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />}
          <span className={['truncate text-[11px] font-medium', unavailable ? 'text-pf-text-muted line-through' : 'text-pf-text'].join(' ')}>
            {option.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { cast.trigger(); }}
          disabled={cast.state === 'pending' || unavailable}
          className="w-12 shrink-0 rounded border border-pf-border bg-pf-bg py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-pf-text hover:bg-pf-bg-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cast
        </button>
      </div>
    </li>
  );
}

function VariantAttackButton({
  label,
  actorId,
  slug,
  variantIndex,
}: {
  label: string;
  actorId: string;
  slug: string;
  variantIndex: number;
}): React.ReactElement {
  const roll = useActorAction({
    run: () => createPf2eClient(api.dispatch).weapon(actorId, slug).rollAttack(variantIndex),
  });
  const bonus = label.split(' ')[0];
  const color =
    variantIndex === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
    : variantIndex === 1 ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
    : 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100';
  return (
    <button
      type="button"
      onClick={() => { roll.trigger(); }}
      disabled={roll.state === 'pending'}
      title={label}
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums disabled:opacity-50 ${color}`}
    >
      {bonus}
    </button>
  );
}

function PencilIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
