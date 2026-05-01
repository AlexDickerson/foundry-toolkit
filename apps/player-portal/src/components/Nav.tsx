import { NavLink, useNavigate } from 'react-router-dom';
import { logout, type AuthUser } from '../api/auth';

const tabs = [
  { to: '/', label: 'Home', end: true },
  { to: '/globe', label: 'Globe' },
  { to: '/leaderboard', label: 'Aurus' },
  { to: '/characters', label: 'Characters' },
];

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user: AuthUser | null;
  onSignOut: () => void;
}

export function Nav({ theme, onToggleTheme, user, onSignOut }: Props) {
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    try {
      await logout();
    } catch {
      // best-effort; clear client state regardless
    }
    onSignOut();
    void navigate('/login');
  }

  return (
    <nav className="flex flex-shrink-0 items-center border-b border-portal-border bg-portal-surface shadow-sm">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end ?? false}
          className={({ isActive }) =>
            [
              'inline-flex items-center px-5 py-3 text-sm font-medium tracking-wide',
              'border-b-2 transition-colors duration-150 no-underline',
              isActive
                ? 'border-portal-accent text-portal-text'
                : 'border-transparent text-portal-text-muted hover:text-portal-text',
            ].join(' ')
          }
        >
          {tab.label}
        </NavLink>
      ))}

      {/* Right-side controls */}
      <div className="ml-auto flex items-center gap-3 px-3">
        {user !== null && (
          <>
            <span className="text-xs text-portal-text-muted">{user.username}</span>
            <button
              type="button"
              onClick={() => { void handleSignOut(); }}
              className="rounded border border-portal-border px-2.5 py-1 text-xs font-medium text-portal-text-muted transition-colors hover:border-portal-accent hover:text-portal-text"
            >
              Sign out
            </button>
          </>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-8 w-8 items-center justify-center rounded text-portal-text-muted transition-colors hover:text-portal-text"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </nav>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
