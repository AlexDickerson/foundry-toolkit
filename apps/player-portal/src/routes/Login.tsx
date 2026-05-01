import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/auth';

export function Login(): React.ReactElement {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      await login(username, password);
      void navigate(next, { replace: true });
    } catch {
      setError('Invalid username or password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-portal-bg">
      <div className="w-full max-w-sm rounded-lg border border-portal-border bg-portal-surface p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-portal-text">Player Portal</h1>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-portal-text">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => { setUsername(e.target.value); }}
              className="w-full rounded border border-portal-border bg-portal-bg px-3 py-2 text-sm text-portal-text placeholder-portal-text-muted focus:border-portal-accent focus:outline-none"
              placeholder="alice"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-portal-text">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              className="w-full rounded border border-portal-border bg-portal-bg px-3 py-2 text-sm text-portal-text placeholder-portal-text-muted focus:border-portal-accent focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error !== null && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-portal-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60 hover:opacity-90"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
