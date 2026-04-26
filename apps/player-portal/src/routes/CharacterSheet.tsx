import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client';
import type { PreparedActor, PreparedCharacter } from '../api/types';
import { SheetHeader } from '../components/sheet/SheetHeader';
import { SettingsDialog } from '../components/settings/SettingsDialog';
import { TabStrip } from '../components/common/TabStrip';
import type { Tab } from '../components/common/TabStrip';
import { SectionHeader } from '../components/common/SectionHeader';
import { Actions } from '../components/tabs/Actions';
import { Background } from '../components/tabs/Background';
import { Character } from '../components/tabs/Character';
import { Crafting } from '../components/tabs/Crafting';
import { Feats } from '../components/tabs/Feats';
import { Inventory } from '../components/tabs/Inventory';
import { Proficiencies } from '../components/tabs/Proficiencies';
import { Progression } from '../components/tabs/Progression';
import { Spells } from '../components/tabs/Spells';
import { useEventChannel } from '../lib/useEventChannel';
import { fromPreparedCharacter } from '../prereqs';
import { usePreferences } from '../lib/usePreferences';
import { prefetchIcons } from '../lib/prefetchIcons';
import { PromptQueue } from '../components/dialog/PromptQueue';
import type { TabId } from '../lib/tabUtils';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; suggestion?: string }
  | { kind: 'ready'; actor: PreparedCharacter };

// 'crafting' is no longer a top-level tab — its content is surfaced as a
// section within the 'inventory' tab. TabId is defined in lib/tabUtils so
// normalizeTabId() can map stale references if tab state is ever persisted.
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

export function CharacterSheet(): React.ReactElement {
  const { actorId } = useParams<{ actorId: string }>();
  const navigate = useNavigate();
  const preferences = usePreferences();
  if (!actorId) return <Navigate to="/characters" replace />;
  const onBack = (): void => {
    void navigate('/characters');
  };
  return <CharacterSheetInner actorId={actorId} onBack={onBack} preferences={preferences} />;
}

interface InnerProps {
  actorId: string;
  onBack: () => void;
  preferences: ReturnType<typeof usePreferences>;
}

function CharacterSheetInner({ actorId, onBack, preferences }: InnerProps): React.ReactElement {
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
        const preparedActor = actor as unknown as PreparedCharacter;
        setState({ kind: 'ready', actor: preparedActor });
        prefetchIcons(preparedActor);
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

  // Live-refresh when Foundry reports any state change to the active
  // actor. The subscription is always on while the sheet is mounted —
  // the server only registers the Foundry `updateActor` hook once
  // there's at least one subscriber, so the cost of an idle
  // subscription is the SSE connection itself. Payload includes
  // `changedPaths` in dot-notation so later consumers can narrow; the
  // sheet refetches on any change because every tab reads from
  // `/prepared`.
  useEventChannel<{ actorId: string; changedPaths: string[] }>('actors', (data) => {
    if (state.kind === 'ready' && data.actorId === state.actor.id) {
      reloadActor();
    }
  });

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      {state.kind === 'loading' && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">Loading character…</p>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark"
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
          {activeTab === 'character' && (
            <Character system={state.actor.system} actorId={actorId} onActorChanged={reloadActor} />
          )}
          {activeTab === 'actions' && (
            <Actions
              actions={state.actor.system.actions}
              items={state.actor.items}
              abilities={state.actor.system.abilities}
              actorId={actorId}
              onItemUsed={reloadActor}
            />
          )}
          {activeTab === 'spells' && (
            <Spells
              items={state.actor.items}
              characterLevel={state.actor.system.details.level.value}
              actorId={actorId}
              onCast={reloadActor}
              focusPoints={state.actor.system.resources.focus}
            />
          )}
          {activeTab === 'inventory' && (
            <>
              <Inventory
                items={state.actor.items}
                actorId={actorId}
                onActorChanged={reloadActor}
                investiture={state.actor.system.resources.investiture}
              />
              <div className="mt-10 border-t border-pf-border pt-6">
                <SectionHeader>Crafting</SectionHeader>
                <Crafting actorId={actorId} crafting={state.actor.system.crafting} />
              </div>
            </>
          )}
          {activeTab === 'feats' && <Feats items={state.actor.items} />}
          {activeTab === 'proficiencies' && <Proficiencies system={state.actor.system} actorId={actorId} />}
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
      {/* Relay dialogs from Foundry — mounted unconditionally so it
          subscribes to the prompt stream as long as the sheet is open. */}
      <PromptQueue />
    </main>
  );
}

function readBackgroundPath(character: PreparedCharacter): string | null {
  const raw = character.flags?.['character-creator']?.['backgroundImage'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

// Layers a semi-transparent overlay on top of the user's image so arbitrary
// artwork (dark, busy, saturated) stays readable behind the sheet content.
// Uses var(--pf-bg-overlay) so the overlay colour follows the portal theme
// toggle (light: cream parchment at 88%, dark: navy at 88%).
function buildSheetSurfaceStyle(bgPath: string | null): React.CSSProperties | undefined {
  if (!bgPath) return undefined;
  const url = bgPath.startsWith('/') ? bgPath : `/${bgPath}`;
  return {
    backgroundImage: `linear-gradient(var(--pf-bg-overlay), var(--pf-bg-overlay)), url(${url})`,
    backgroundSize: 'auto, cover',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
    backgroundAttachment: 'local, local',
  };
}
