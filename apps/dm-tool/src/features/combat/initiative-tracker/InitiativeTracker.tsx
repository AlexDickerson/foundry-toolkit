import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Dice5, Skull, UploadCloud, UserPlus } from 'lucide-react';
import type { Combatant, Encounter, PushEncounterResult } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { buildMonsterCombatant, reserveMonsterName, rollD20, sortedCombatants } from '../util';
import { PushResultDialog } from '../PushResultDialog';
import { isAlreadyInEncounter } from '../party-picker-utils';
import { CombatantRow } from './CombatantRow';
import { type PcInput, PartyPickerPanel } from './PartyPickerPanel';
import { AddPcPanel } from './AddPcPanel';

interface Props {
  encounter: Encounter;
  onChange: (next: Encounter) => Promise<void>;
  /** Called when the user wants to add a monster. Receives an async callback
   *  that accepts a monster name and adds it to the current encounter. The
   *  caller is expected to navigate to the Monsters tab and invoke the
   *  callback when the user picks. */
  onRequestMonster: (addByName: (name: string) => Promise<void>) => void;
}

export function InitiativeTracker({ encounter, onChange, onRequestMonster }: Props) {
  const [addMode, setAddMode] = useState<'none' | 'party' | 'pc-manual'>('none');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushEncounterResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const monsterCount = encounter.combatants.filter((c) => c.kind === 'monster').length;

  const handlePushToFoundry = useCallback(async () => {
    if (pushing || monsterCount === 0) return;
    setPushing(true);
    setPushError(null);
    try {
      const result = await api.pushEncounterToFoundry(encounter.id);
      setPushResult(result);
    } catch (e) {
      setPushError((e as Error).message || 'Push failed.');
    } finally {
      setPushing(false);
    }
  }, [encounter.id, monsterCount, pushing]);

  const order = sortedCombatants(encounter.combatants);
  const currentId = order[encounter.turnIndex]?.id ?? null;

  const update = useCallback((next: Partial<Encounter>) => onChange({ ...encounter, ...next }), [encounter, onChange]);

  const updateCombatant = useCallback(
    (id: string, patch: Partial<Combatant>) =>
      update({
        combatants: encounter.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }),
    [encounter.combatants, update],
  );

  const removeCombatant = useCallback(
    (id: string) => {
      // Keep turnIndex pointed at "the same actor" if possible — otherwise
      // clamp it so we don't point past the end of the list.
      const removedIdx = order.findIndex((c) => c.id === id);
      const remaining = encounter.combatants.filter((c) => c.id !== id);
      let nextTurn = encounter.turnIndex;
      if (removedIdx !== -1 && removedIdx < encounter.turnIndex) nextTurn -= 1;
      nextTurn = Math.max(0, Math.min(nextTurn, remaining.length - 1));
      return update({ combatants: remaining, turnIndex: Math.max(0, nextTurn) });
    },
    [encounter.combatants, encounter.turnIndex, order, update],
  );

  const rollMonsters = useCallback(() => {
    const rolled = encounter.combatants.map((c) =>
      c.kind === 'monster' ? { ...c, initiative: rollD20(c.initiativeMod) } : c,
    );
    return update({ combatants: rolled, turnIndex: 0, round: 1 });
  }, [encounter.combatants, update]);

  const clearInitiative = useCallback(
    () =>
      update({
        combatants: encounter.combatants.map((c) => ({ ...c, initiative: null })),
        turnIndex: 0,
        round: 1,
      }),
    [encounter.combatants, update],
  );

  const nextTurn = useCallback(() => {
    if (order.length === 0) return;
    const next = encounter.turnIndex + 1;
    if (next >= order.length) return update({ turnIndex: 0, round: encounter.round + 1 });
    return update({ turnIndex: next });
  }, [encounter.round, encounter.turnIndex, order.length, update]);

  const prevTurn = useCallback(() => {
    if (order.length === 0) return;
    const prev = encounter.turnIndex - 1;
    if (prev < 0) return update({ turnIndex: Math.max(0, order.length - 1), round: Math.max(1, encounter.round - 1) });
    return update({ turnIndex: prev });
  }, [encounter.round, encounter.turnIndex, order.length, update]);

  const setCurrent = useCallback(
    (id: string) => {
      const idx = order.findIndex((c) => c.id === id);
      if (idx >= 0) return update({ turnIndex: idx });
    },
    [order, update],
  );

  const addMonsterByName = useCallback(
    async (name: string) => {
      let detail;
      try {
        detail = await api.monstersGetDetail(name);
      } catch (e) {
        console.error(`monstersGetDetail failed for "${name}":`, e);
        return;
      }
      if (!detail) return;
      const { existing, next } = reserveMonsterName(encounter.combatants, name);
      const combatant = buildMonsterCombatant(name, next, detail);
      return update({ combatants: [...existing, combatant] });
    },
    [encounter.combatants, update],
  );

  /** Add one or more PCs in a single update so all land in the same
   *  combatants array — calling this in a loop would lose all but the
   *  last because each call closes over the same stale snapshot.
   *
   *  Defensively skips PCs already in the encounter (matched by
   *  foundryActorId, then displayName) so a UI bug or double-click can't
   *  add a duplicate. */
  const addPcs = useCallback(
    (pcs: ReadonlyArray<PcInput>) => {
      const fresh = pcs.filter(
        (pc) => !isAlreadyInEncounter(encounter.combatants, { id: pc.foundryActorId ?? '', name: pc.name }),
      );
      if (fresh.length === 0) return;
      const newCombatants: Combatant[] = fresh.map((pc) => ({
        id: crypto.randomUUID(),
        kind: 'pc',
        displayName: pc.name,
        initiativeMod: pc.initiativeMod,
        initiative: null,
        hp: pc.hp ?? pc.maxHp,
        maxHp: pc.maxHp,
        foundryActorId: pc.foundryActorId,
      }));
      return update({ combatants: [...encounter.combatants, ...newCombatants] });
    },
    [encounter.combatants, update],
  );

  // Single-PC convenience wrapper kept for the manual AddPcPanel.
  const addPc = useCallback((pc: { name: string; initiativeMod: number; maxHp: number }) => addPcs([pc]), [addPcs]);

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* Header: encounter name + turn controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Input
          value={encounter.name}
          onChange={(e) => update({ name: e.target.value })}
          className="h-7 max-w-xs text-sm font-semibold"
        />
        <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
          Round {encounter.round}
        </span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => void prevTurn()} disabled={order.length === 0}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Prev
        </Button>
        <Button size="sm" onClick={() => void nextTurn()} disabled={order.length === 0}>
          Next
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Secondary toolbar: roll / clear / push */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid hsl(var(--border))',
          fontSize: 12,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => void rollMonsters()}
          disabled={encounter.combatants.length === 0}
        >
          <Dice5 className="mr-1 h-3.5 w-3.5" />
          Roll monsters
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void clearInitiative()}
          disabled={encounter.combatants.length === 0}
        >
          Clear
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handlePushToFoundry()}
          disabled={pushing || monsterCount === 0}
          title={
            monsterCount === 0
              ? 'Add monster combatants first'
              : 'Create a Foundry actor for each monster in a folder named after the encounter'
          }
        >
          <UploadCloud className="mr-1 h-3.5 w-3.5" />
          {pushing ? 'Pushing…' : 'Push to Foundry'}
        </Button>
        <div style={{ flex: 1 }} />
        <span className="text-[11px]">
          {encounter.combatants.length} combatant{encounter.combatants.length === 1 ? '' : 's'}
        </span>
      </div>
      {pushError && (
        <div
          style={{
            padding: '6px 12px',
            fontSize: 11,
            color: 'hsl(var(--destructive))',
            background: 'hsl(var(--destructive) / 0.1)',
            borderBottom: '1px solid hsl(var(--destructive) / 0.4)',
          }}
        >
          {pushError}
        </div>
      )}
      {pushResult && <PushResultDialog result={pushResult} onClose={() => setPushResult(null)} />}

      {/* Initiative list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {order.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'hsl(var(--muted-foreground))',
              fontSize: 13,
            }}
          >
            No combatants yet. Add monsters or PCs below.
          </div>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {order.map((c, i) => (
              <CombatantRow
                key={c.id}
                combatant={c}
                index={i}
                isCurrent={c.id === currentId}
                onSetCurrent={() => void setCurrent(c.id)}
                onPatch={(patch) => void updateCombatant(c.id, patch)}
                onRemove={() => void removeCombatant(c.id)}
              />
            ))}
          </ol>
        )}
      </div>

      {/* Add toolbar */}
      <div
        style={{
          borderTop: '1px solid hsl(var(--border))',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {addMode === 'none' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" onClick={() => onRequestMonster(addMonsterByName)}>
              <Skull className="mr-1 h-3.5 w-3.5" />
              Add monster…
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddMode('party')}>
              <UserPlus className="mr-1 h-3.5 w-3.5" />
              Add PC
            </Button>
          </div>
        )}
        {addMode === 'party' && (
          <PartyPickerPanel
            existing={encounter.combatants}
            onAdd={(pcs) => void addPcs(pcs)}
            onAddManually={() => setAddMode('pc-manual')}
            onClose={() => setAddMode('none')}
          />
        )}
        {addMode === 'pc-manual' && (
          <AddPcPanel
            onAdd={(pc) => {
              void addPc(pc);
            }}
            onClose={() => setAddMode('none')}
          />
        )}
      </div>
    </div>
  );
}
