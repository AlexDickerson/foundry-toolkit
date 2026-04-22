import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { PreparedActor, PreparedCharacter } from '../api/types';
import { SheetHeader } from '../components/layout/SheetHeader';
import { SettingsDialog } from '../components/settings/SettingsDialog';
import { TabStrip } from '../components/common/TabStrip';
import type { Tab } from '../components/common/TabStrip';
import { Actions } from '../components/tabs/Actions';
import { Background } from '../components/tabs/Background';
import { Character } from '../components/tabs/Character';
import { Feats } from '../components/tabs/Feats';
import { Inventory } from '../components/tabs/Inventory';
import { Proficiencies } from '../components/tabs/Proficiencies';
import { Progression } from '../components/tabs/Progression';
import { Spells } from '../components/tabs/Spells';
import { fromPreparedCharacter } from '../prereqs';
import type { ColorScheme } from '../lib/usePreferences';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; suggestion?: string }
  | { kind: 'ready'; actor: PreparedCharacter };

type TabId =
  | 'character'
  | 'actions'
  | 'spells'
  | 'inventory'
  | 'feats'
  | 'proficiencies'
  | 'progression'
  | 'background';

const TABS: readonly Tab<TabId>[] = [
  { id: 'character', label: 'Character' },
  { id: 'actions', label: 'Actions' },
  { id: 'spells', label: 'Spells' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'feats', label: 'Feats' },
  { id: 'proficiencies', label: 'Proficiencies' },
  { id: 'progression', label: 'Progression' },
  { id: 'background', label: 'Background' },
];

interface Props {
  actorId: string;
  onBack: () => void;
  preferences: {
    colorScheme: ColorScheme;
    setColorScheme: (scheme: ColorScheme) => void;
  };
}

export function CharacterSheet({ actorId, onBack, preferences }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<TabId>('character');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumping this triggers a fresh `/prepared` fetch — used after buy/
  // sell mutations from the Inventory tab so the sheet reflects the
  // updated item list and coin totals without a full page reload.
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getPreparedActor(actorId)
      .then((actor: PreparedActor): void => {
        if (cancelled) return;
        if (actor.type !== 'character') {
          setState({
            kind: 'error',
            message: `Actor "${actor.name}" is a ${actor.type}, not a character.`,
            suggestion: 'Pick a character actor from the list.',
          });
          return;
        }
        setState({ kind: 'ready', actor: actor as unknown as PreparedCharacter });
      })
      .catch((err: unknown): void => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const suggestion = err instanceof ApiRequestError ? err.suggestion : undefined;
        setState(suggestion !== undefined ? { kind: 'error', message, suggestion } : { kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [actorId, reloadNonce]);

  const reloadActor = (): void => {
    setReloadNonce((n) => n + 1);
  };

  return (
    <div>
      {state.kind === 'loading' && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">Loading character…</p>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            ← Actors
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-red-900">Couldn&apos;t load character</p>
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-900 hover:bg-red-100"
            >
              ← Actors
            </button>
          </div>
          <p className="mt-1 text-red-800">{state.message}</p>
          {state.suggestion !== undefined && <p className="mt-2 text-red-700">{state.suggestion}</p>}
        </div>
      )}

      {state.kind === 'ready' && (
        <div
          data-testid="sheet-surface"
          style={buildSheetSurfaceStyle(readBackgroundPath(state.actor))}
          className={readBackgroundPath(state.actor) ? '-mx-4 rounded-lg px-4 py-2' : undefined}
        >
          <SheetHeader
            character={state.actor}
            onBack={onBack}
            onSettingsOpen={(): void => {
              setSettingsOpen(true);
            }}
          />
          <TabStrip tabs={TABS} active={activeTab} onChange={setActiveTab} />
          {activeTab === 'character' && <Character system={state.actor.system} />}
          {activeTab === 'actions' && (
            <Actions
              actions={state.actor.system.actions}
              items={state.actor.items}
              abilities={state.actor.system.abilities}
            />
          )}
          {activeTab === 'spells' && (
            <Spells items={state.actor.items} characterLevel={state.actor.system.details.level.value} />
          )}
          {activeTab === 'inventory' && (
            <Inventory items={state.actor.items} actorId={actorId} onActorChanged={reloadActor} />
          )}
          {activeTab === 'feats' && <Feats items={state.actor.items} />}
          {activeTab === 'proficiencies' && <Proficiencies system={state.actor.system} />}
          {activeTab === 'progression' && (
            <Progression
              characterLevel={state.actor.system.details.level.value}
              items={state.actor.items}
              characterContext={fromPreparedCharacter(state.actor)}
            />
          )}
          {activeTab === 'background' && <Background details={state.actor.system.details} />}
        </div>
      )}
      {settingsOpen && state.kind === 'ready' && (
        <SettingsDialog
          colorScheme={preferences.colorScheme}
          onColorSchemeChange={preferences.setColorScheme}
          actorId={actorId}
          backgroundPath={readBackgroundPath(state.actor)}
          onBackgroundChanged={reloadActor}
          onClose={(): void => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function readBackgroundPath(character: PreparedCharacter): string | null {
  const raw = character.flags?.['character-creator']?.['backgroundImage'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

// Layers a cream overlay on top of the user's image so arbitrary
// artwork (dark, busy, saturated) stays readable behind the sheet
// content. The overlay hex matches `--color-pf-bg` for the Classic
// palette; since no scheme currently overrides the cream surface, this
// stays visually consistent across color schemes.
function buildSheetSurfaceStyle(bgPath: string | null): React.CSSProperties | undefined {
  if (!bgPath) return undefined;
  const url = bgPath.startsWith('/') ? bgPath : `/${bgPath}`;
  return {
    backgroundImage: `linear-gradient(rgba(248, 244, 241, 0.88), rgba(248, 244, 241, 0.88)), url(${url})`,
    backgroundSize: 'auto, cover',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
    backgroundAttachment: 'local, local',
  };
}
