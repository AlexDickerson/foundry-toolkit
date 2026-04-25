import { useNavigate } from 'react-router-dom';
import { ActorList } from '../components/ActorList';

export function Characters(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <h1 className="mb-4 text-2xl font-semibold">Characters</h1>
      <p className="mb-6 text-sm text-pf-text-muted">
        Pick a character actor to view their sheet, or start a new draft. Pulls from{' '}
        <code className="rounded bg-pf-bg-dark px-1 py-0.5">/api/mcp/actors</code>.
      </p>
      <div className="mb-4">
        <button
          type="button"
          onClick={(): void => {
            void navigate('/characters/new');
          }}
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark"
        >
          + Create Character
        </button>
      </div>
      <ActorList
        onSelect={(a): void => {
          void navigate(`/characters/${a.id}`);
        }}
      />
    </main>
  );
}
