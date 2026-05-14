import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, type AuthUser } from '@/features/auth/api';
import { VariantRulesModal } from '@/features/variant-rules/VariantRulesModal';

const tabs = [
  { to: '/', label: 'Home', end: true },
  { to: '/globe', label: 'Globe' },
  { to: '/books', label: 'Books' },
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
  const [houseRulesOpen, setHouseRulesOpen] = useState(false);

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

        {/* House Rules (variant rules) */}
        <button
          type="button"
          onClick={(): void => setHouseRulesOpen(true)}
          aria-label="House Rules"
          title="House Rules"
          className="flex h-8 w-8 items-center justify-center rounded text-portal-text-muted transition-colors hover:text-portal-text"
        >
          <GearIcon />
        </button>

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

      {houseRulesOpen && <VariantRulesModal onClose={(): void => setHouseRulesOpen(false)} />}
    </nav>
  );
}

function GearIcon(): React.ReactElement {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
