import { Outlet } from 'react-router-dom';
import { usePortalTheme } from '@/shared/hooks/usePortalTheme';
import { Nav } from './Nav';

interface Props {
  onSignOut: () => void;
}

export function Layout({ onSignOut }: Props) {
  const [theme, toggleTheme] = usePortalTheme();
  return (
    <div
      data-portal-theme={theme}
      className="flex h-screen w-screen flex-col bg-portal-bg"
    >
      <Nav theme={theme} onToggleTheme={toggleTheme} onSignOut={onSignOut} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
