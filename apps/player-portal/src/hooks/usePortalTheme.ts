import { useCallback, useEffect, useState } from 'react';

type PortalTheme = 'light' | 'dark';

const STORAGE_KEY = 'portal-theme';
const DEFAULT: PortalTheme = 'light';

/** Manages the portal surface theme (light/dark). Persists to localStorage.
 *  Returns [theme, toggleTheme]. Apply the theme by setting
 *  `data-portal-theme={theme}` on the Layout root element. */
export function usePortalTheme(): [PortalTheme, () => void] {
  const [theme, setTheme] = useState<PortalTheme>(
    () => (localStorage.getItem(STORAGE_KEY) as PortalTheme | null) ?? DEFAULT,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);

  return [theme, toggle];
}
