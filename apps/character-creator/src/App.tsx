import { useState } from 'react';
import { ActorList } from './components/ActorList';
import { CharacterCreator } from './pages/CharacterCreator';
import { CharacterSheet } from './pages/CharacterSheet';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'sheet'; actorId: string };

export function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: 'list' });

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      {view.kind === 'list' && (
        <>
          <h1 className="mb-4 text-2xl font-semibold">foundry-mcp — Character Sheet</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Pick a character actor to view their proficiencies tab, or start a new draft. Pulls from{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5">/api/actors</code> and{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5">/api/actors/:id/prepared</code>.
          </p>
          <div className="mb-4">
            <button
              type="button"
              onClick={(): void => {
                setView({ kind: 'create' });
              }}
              className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark"
            >
              + Create Character
            </button>
          </div>
          <ActorList
            onSelect={(a): void => {
              setView({ kind: 'sheet', actorId: a.id });
            }}
          />
        </>
      )}
      {view.kind === 'create' && (
        <CharacterCreator
          onBack={(): void => {
            setView({ kind: 'list' });
          }}
          onFinish={(actorId): void => {
            setView({ kind: 'sheet', actorId });
          }}
        />
      )}
      {view.kind === 'sheet' && (
        <CharacterSheet
          actorId={view.actorId}
          onBack={(): void => {
            setView({ kind: 'list' });
          }}
        />
      )}
    </main>
  );
}
