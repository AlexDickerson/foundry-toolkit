import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ACTIVE_EFFECT_MODES,
  ARMOR_CATEGORIES,
  DAMAGE_DICE,
  DAMAGE_TYPES,
  DraftValidationError,
  FREQUENCY_PER,
  RARITIES,
  SUPPORTED_TYPES,
  WEAPON_CATEGORIES,
  draftToPayload,
  emptyDraft,
  templateToDraft,
  type ActiveEffectChangeDraft,
  type ActiveEffectDraft,
  type ItemDraft,
  type ItemType,
} from './homebrew-editor-helpers';
import type { CompendiumItemTemplate } from '../../../electron/ipc/homebrew-items-clone';

const HOMEBREW_PACK_NAME = 'homebrew-items';
const HOMEBREW_PACK_LABEL = 'Homebrew Items';

type Tab = 'basic' | 'mechanical' | 'effects' | 'advanced';

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'basic', label: 'Basic' },
  { key: 'mechanical', label: 'Mechanical' },
  { key: 'effects', label: 'Effects' },
  { key: 'advanced', label: 'Advanced' },
];

interface SaveResult {
  uuid: string;
  name: string;
  packId: string;
  created: boolean;
}

interface HomebrewItemEditorModalProps {
  open: boolean;
  /** When set, the modal opens seeded from this template (clone path).
   *  When null/undefined, the modal opens empty (greenfield create). */
  templateUuid?: string | null;
  onClose: () => void;
  onSaved?: (result: SaveResult) => void;
}

export function HomebrewItemEditorModal({ open, templateUuid, onClose, onSaved }: HomebrewItemEditorModalProps) {
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft());
  const [tab, setTab] = useState<Tab>('basic');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedJson, setAdvancedJson] = useState('');
  const [advancedDirty, setAdvancedDirty] = useState(false);

  // Reset / load template every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab('basic');
    setAdvancedDirty(false);

    if (!templateUuid) {
      const fresh = emptyDraft();
      setDraft(fresh);
      setAdvancedJson(JSON.stringify(fresh.systemRaw, null, 2));
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .getCompendiumItemTemplate(templateUuid)
      .then((template: CompendiumItemTemplate) => {
        if (cancelled) return;
        const seeded = templateToDraft(template);
        setDraft(seeded);
        setAdvancedJson(JSON.stringify(seeded.systemRaw, null, 2));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(`Failed to load template: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateUuid]);

  const update = useCallback(<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);

    // Apply advanced-tab JSON edits before payload conversion. The
    // advanced tab edits `systemRaw`, which `draftToPayload` overlays
    // editor fields on top of, so users see the merged result.
    let workingDraft = draft;
    if (advancedDirty) {
      try {
        const parsed: unknown = JSON.parse(advancedJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Advanced JSON must be an object');
        }
        workingDraft = { ...draft, systemRaw: parsed as Record<string, unknown> };
      } catch (e) {
        setError(`Advanced JSON invalid: ${(e as Error).message}`);
        return;
      }
    }

    let payload;
    try {
      payload = draftToPayload(workingDraft);
    } catch (e) {
      setError(e instanceof DraftValidationError ? e.message : `Validation failed: ${(e as Error).message}`);
      return;
    }

    setSaving(true);
    try {
      const pack = await api.ensureHomebrewItemPack({
        name: HOMEBREW_PACK_NAME,
        label: HOMEBREW_PACK_LABEL,
      });
      const created = await api.createHomebrewItem({ packId: pack.id, item: payload });
      onSaved?.({ uuid: created.uuid, name: created.name, packId: created.packId, created: pack.created });
      onClose();
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [draft, advancedDirty, advancedJson, onSaved, onClose]);

  const traitsString = useMemo(() => draft.traits.join(', '), [draft.traits]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="grid max-h-[90vh] w-full max-w-3xl grid-rows-[auto_auto_1fr_auto] gap-4">
        <DialogHeader>
          <DialogTitle>{templateUuid ? 'Edit homebrew item (from template)' : 'New homebrew item'}</DialogTitle>
          <DialogDescription>
            Lands in <span className="font-mono">world.homebrew-items</span>. The pack is created on first save.
          </DialogDescription>
        </DialogHeader>

        <TabBar current={tab} onChange={setTab} />

        <ScrollArea className="min-h-0 pr-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading template…</div>
          ) : (
            <div className="space-y-4">
              {tab === 'basic' && <BasicTab draft={draft} update={update} traitsString={traitsString} />}
              {tab === 'mechanical' && <MechanicalTab draft={draft} update={update} />}
              {tab === 'effects' && <EffectsTab draft={draft} update={update} />}
              {tab === 'advanced' && (
                <AdvancedTab
                  json={advancedJson}
                  onChange={(v) => {
                    setAdvancedJson(v);
                    setAdvancedDirty(true);
                  }}
                />
              )}
            </div>
          )}
        </ScrollArea>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <DialogFooter className="flex flex-row items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save to Foundry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            'px-3 py-1.5 text-sm transition-colors',
            current === t.key
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Basic tab
// ---------------------------------------------------------------------------

interface DraftUpdater {
  <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]): void;
}

function BasicTab({ draft, update, traitsString }: { draft: ItemDraft; update: DraftUpdater; traitsString: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Name *" className="sm:col-span-2">
        <Input value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Sword of Test" />
      </Field>

      <Field label="Type">
        <select
          className={selectClasses}
          value={draft.type}
          onChange={(e) => update('type', e.target.value as ItemType)}
        >
          {SUPPORTED_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Rarity">
        <select
          className={selectClasses}
          value={draft.rarity}
          onChange={(e) => update('rarity', e.target.value as ItemDraft['rarity'])}
        >
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Level">
        <Input type="number" value={draft.level} onChange={(e) => update('level', Number(e.target.value) || 0)} />
      </Field>

      <Field label="Bulk">
        <Input value={draft.bulk} onChange={(e) => update('bulk', e.target.value)} placeholder="-, L, 1, 2…" />
      </Field>

      <Field label="Traits (comma-separated)" className="sm:col-span-2">
        <Input
          value={traitsString}
          onChange={(e) =>
            update(
              'traits',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0),
            )
          }
          placeholder="magical, evocation, invested…"
        />
      </Field>

      <Field label="Price" className="sm:col-span-2">
        <div className="grid grid-cols-4 gap-2">
          {(['pp', 'gp', 'sp', 'cp'] as const).map((coin) => (
            <div key={coin}>
              <Input
                type="number"
                value={draft.price[coin]}
                onChange={(e) => update('price', { ...draft.price, [coin]: Number(e.target.value) || 0 })}
              />
              <div className="mt-0.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                {coin}
              </div>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Source">
        <Input
          value={draft.source}
          onChange={(e) => update('source', e.target.value)}
          placeholder="Pathfinder Player Core"
        />
      </Field>

      <Field label="Image URL">
        <Input value={draft.img} onChange={(e) => update('img', e.target.value)} placeholder="systems/pf2e/icons/…" />
      </Field>

      <Field label="Description" className="sm:col-span-2">
        <textarea
          className={textareaClasses}
          rows={6}
          value={draft.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="HTML allowed."
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mechanical tab
// ---------------------------------------------------------------------------

function MechanicalTab({ draft, update }: { draft: ItemDraft; update: DraftUpdater }) {
  return (
    <div className="space-y-4">
      <PerTypeSection draft={draft} update={update} />
      <Separator />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Charges / uses</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Uses (current)">
          <Input
            type="number"
            value={draft.uses.value}
            onChange={(e) => update('uses', { ...draft.uses, value: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Uses (max)">
          <Input
            type="number"
            value={draft.uses.max}
            onChange={(e) => update('uses', { ...draft.uses, max: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <Separator />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frequency</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max per period">
          <Input
            type="number"
            value={draft.frequency.max}
            onChange={(e) => update('frequency', { ...draft.frequency, max: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Period">
          <select
            className={selectClasses}
            value={draft.frequency.per}
            onChange={(e) =>
              update('frequency', { ...draft.frequency, per: e.target.value as ItemDraft['frequency']['per'] })
            }
          >
            {FREQUENCY_PER.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Separator />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        PF2e RuleElements (system.rules) — JSON array
      </h3>
      <textarea
        className={textareaClasses}
        rows={6}
        value={draft.rulesJson}
        onChange={(e) => update('rulesJson', e.target.value)}
        placeholder='[{"key": "FlatModifier", "selector": "ac", "value": 1}]'
      />
    </div>
  );
}

function PerTypeSection({ draft, update }: { draft: ItemDraft; update: DraftUpdater }) {
  switch (draft.type) {
    case 'weapon':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weapon</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Damage die">
              <select
                className={selectClasses}
                value={draft.weapon.damageDie}
                onChange={(e) =>
                  update('weapon', { ...draft.weapon, damageDie: e.target.value as ItemDraft['weapon']['damageDie'] })
                }
              >
                {DAMAGE_DICE.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="# of dice">
              <Input
                type="number"
                value={draft.weapon.damageDice}
                onChange={(e) => update('weapon', { ...draft.weapon, damageDice: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Damage type">
              <select
                className={selectClasses}
                value={draft.weapon.damageType}
                onChange={(e) => update('weapon', { ...draft.weapon, damageType: e.target.value })}
              >
                {DAMAGE_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                className={selectClasses}
                value={draft.weapon.category}
                onChange={(e) =>
                  update('weapon', { ...draft.weapon, category: e.target.value as ItemDraft['weapon']['category'] })
                }
              >
                {WEAPON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Group" className="col-span-2">
              <Input
                value={draft.weapon.group}
                onChange={(e) => update('weapon', { ...draft.weapon, group: e.target.value })}
                placeholder="sword, axe, bow…"
              />
            </Field>
          </div>
        </div>
      );
    case 'armor':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Armor</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                className={selectClasses}
                value={draft.armor.category}
                onChange={(e) =>
                  update('armor', { ...draft.armor, category: e.target.value as ItemDraft['armor']['category'] })
                }
              >
                {ARMOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Group">
              <Input
                value={draft.armor.group}
                onChange={(e) => update('armor', { ...draft.armor, group: e.target.value })}
              />
            </Field>
            <Field label="AC bonus">
              <Input
                type="number"
                value={draft.armor.acBonus}
                onChange={(e) => update('armor', { ...draft.armor, acBonus: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Strength req.">
              <Input
                type="number"
                value={draft.armor.strength}
                onChange={(e) => update('armor', { ...draft.armor, strength: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Dex cap">
              <Input
                type="number"
                value={draft.armor.dexCap}
                onChange={(e) => update('armor', { ...draft.armor, dexCap: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Check penalty">
              <Input
                type="number"
                value={draft.armor.checkPenalty}
                onChange={(e) => update('armor', { ...draft.armor, checkPenalty: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Speed penalty" className="col-span-2">
              <Input
                type="number"
                value={draft.armor.speedPenalty}
                onChange={(e) => update('armor', { ...draft.armor, speedPenalty: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        </div>
      );
    case 'shield':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shield</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Hardness">
              <Input
                type="number"
                value={draft.shield.hardness}
                onChange={(e) => update('shield', { ...draft.shield, hardness: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="HP max">
              <Input
                type="number"
                value={draft.shield.hpMax}
                onChange={(e) => update('shield', { ...draft.shield, hpMax: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="AC bonus">
              <Input
                type="number"
                value={draft.shield.acBonus}
                onChange={(e) => update('shield', { ...draft.shield, acBonus: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        </div>
      );
    case 'consumable':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consumable</h3>
          <Field label="Consumable type">
            <Input
              value={draft.consumable.consumableType}
              onChange={(e) => update('consumable', { ...draft.consumable, consumableType: e.target.value })}
              placeholder="potion / scroll / talisman / …"
            />
          </Field>
        </div>
      );
    case 'equipment':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equipment</h3>
          <Field label="Usage">
            <Input
              value={draft.equipment.usage}
              onChange={(e) => update('equipment', { ...draft.equipment, usage: e.target.value })}
              placeholder="held-in-one-hand / worn-armor / …"
            />
          </Field>
        </div>
      );
    case 'treasure':
      return (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Treasure</h3>
          <Field label="Category">
            <Input
              value={draft.treasure.category}
              onChange={(e) => update('treasure', { ...draft.treasure, category: e.target.value })}
              placeholder="gem / currency / art-object / …"
            />
          </Field>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Effects tab
// ---------------------------------------------------------------------------

function EffectsTab({ draft, update }: { draft: ItemDraft; update: DraftUpdater }) {
  const setEffects = (next: ActiveEffectDraft[]) => update('effects', next);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Foundry ActiveEffects — `transfer: true` copies the effect onto an actor when the item is granted.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setEffects([
              ...draft.effects,
              {
                name: 'New effect',
                disabled: false,
                transfer: false,
                changes: [],
                durationRounds: 0,
              },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add effect
        </Button>
      </div>
      {draft.effects.length === 0 && (
        <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No effects defined.
        </div>
      )}
      {draft.effects.map((effect, idx) => (
        <EffectCard
          key={idx}
          effect={effect}
          onChange={(next) => {
            const copy = [...draft.effects];
            copy[idx] = next;
            setEffects(copy);
          }}
          onRemove={() => setEffects(draft.effects.filter((_, i) => i !== idx))}
        />
      ))}
    </div>
  );
}

function EffectCard({
  effect,
  onChange,
  onRemove,
}: {
  effect: ActiveEffectDraft;
  onChange: (next: ActiveEffectDraft) => void;
  onRemove: () => void;
}) {
  const setChanges = (next: ActiveEffectChangeDraft[]) => onChange({ ...effect, changes: next });

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={effect.name} onChange={(e) => onChange({ ...effect, name: e.target.value })} />
        </Field>
        <Field label="Duration (rounds)">
          <Input
            type="number"
            value={effect.durationRounds}
            onChange={(e) => onChange({ ...effect, durationRounds: Number(e.target.value) || 0 })}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={effect.disabled}
            onChange={(e) => onChange({ ...effect, disabled: e.target.checked })}
          />
          Disabled
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={effect.transfer}
            onChange={(e) => onChange({ ...effect, transfer: e.target.checked })}
          />
          Transfer to actor on grant
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Changes</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setChanges([...effect.changes, { key: '', mode: 2, value: '0', priority: 20 }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add change
          </Button>
        </div>
        {effect.changes.map((c, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_120px_100px_70px_auto] items-center gap-2">
            <Input
              value={c.key}
              placeholder="system.bonuses.damage.bonus"
              onChange={(e) => {
                const next = [...effect.changes];
                next[idx] = { ...c, key: e.target.value };
                setChanges(next);
              }}
            />
            <select
              className={selectClasses}
              value={c.mode}
              onChange={(e) => {
                const next = [...effect.changes];
                next[idx] = { ...c, mode: Number(e.target.value) };
                setChanges(next);
              }}
            >
              {ACTIVE_EFFECT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <Input
              value={c.value}
              placeholder="value"
              onChange={(e) => {
                const next = [...effect.changes];
                next[idx] = { ...c, value: e.target.value };
                setChanges(next);
              }}
            />
            <Input
              type="number"
              value={c.priority}
              placeholder="prio"
              onChange={(e) => {
                const next = [...effect.changes];
                next[idx] = { ...c, priority: Number(e.target.value) || 0 };
                setChanges(next);
              }}
            />
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setChanges(effect.changes.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remove effect
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced tab
// ---------------------------------------------------------------------------

function AdvancedTab({ json, onChange }: { json: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Raw <span className="font-mono">system</span> object. Editor-managed fields (level, traits, price, bulk,
        description, source, per-type fields, frequency, uses, rules) are overlaid on top of this on save — anything
        else round-trips untouched.
      </p>
      <textarea
        className={cn(textareaClasses, 'h-72 font-mono text-xs')}
        value={json}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field shell + shared input classes
// ---------------------------------------------------------------------------

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const selectClasses =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs transition-[colors,box-shadow] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary/50';

const textareaClasses =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[colors,box-shadow] placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary/50';
