// Router root for the player portal. Landing page on `/`, four top-level
// surfaces under the nav (Globe, Inventory, Leaderboard, Characters), and
// nested character-creator/sheet routes. All share the outer Layout (nav
// + main); the character routes sit inside CharactersLayout so the ported
// pf2e parchment styling applies.
//
// Auth flow:
//   - AuthGuard checks GET /api/auth/me on mount.
//   - Unauthenticated → redirect to /login?next=<current path>.
//   - Login form POSTs to /api/auth/login, then navigates to the ?next param.
//   - Sign out POSTs to /api/auth/logout then navigates to /login.

import { useCallback, useEffect, useState } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { CharactersLayout } from './components/CharactersLayout';
import { Layout } from './components/Layout';
import { CharacterCreator } from './routes/CharacterCreator';
import { CharacterSheet } from './routes/CharacterSheet';
import { Characters } from './routes/Characters';
import { Globe } from './routes/Globe';
import { Home } from './routes/Home';
import { Leaderboard } from './routes/Leaderboard';
import { Login } from './routes/Login';
import { getMe, type AuthUser } from './api/auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' };

/** Wraps all protected routes. Checks /api/auth/me and redirects to /login on 401. */
function AuthGuard({ children }: { children: (user: AuthUser, onSignOut: () => void) => React.ReactElement }): React.ReactElement {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const location = useLocation();

  const signOut = useCallback((): void => {
    setAuth({ status: 'unauthenticated' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => {
        if (!cancelled) setAuth({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!cancelled) setAuth({ status: 'unauthenticated' });
      });
    return (): void => { cancelled = true; };
  }, []);

  if (auth.status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-portal-bg text-portal-text-muted text-sm">
        Loading…
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children(auth.user, signOut);
}

/** Top-level route component that integrates the auth guard with Layout. */
function ProtectedLayout(): React.ReactElement {
  return (
    <AuthGuard>
      {(user, onSignOut) => <Layout user={user} onSignOut={onSignOut} />}
    </AuthGuard>
  );
}

const router = createBrowserRouter([
  { path: '/login', Component: Login },
  {
    path: '/',
    Component: ProtectedLayout,
    children: [
      { index: true, Component: Home },
      { path: 'globe', Component: Globe },
      { path: 'leaderboard', Component: Leaderboard },
      {
        path: 'characters',
        Component: CharactersLayout,
        children: [
          { index: true, Component: Characters },
          { path: 'new', Component: CharacterCreator },
          { path: ':actorId', Component: CharacterSheet },
        ],
      },
    ],
  },
]);

export function App(): React.ReactElement {
  return <RouterProvider router={router} />;
}
