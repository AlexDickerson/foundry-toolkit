import { useCallback, useEffect, useState } from 'react';

// Character sheet user preferences, persisted to localStorage so they
// survive reloads. Currently just the color scheme; add more fields
// alongside as the settings dialog grows.

// Swatch colors are intentionally absent — the SettingsDialog renders each
// button with data-color-scheme set so var(--color-pf-primary) resolves live
// from CSS. Adding a new theme: add a block to color-schemes.css + one entry here.
export const COLOR_SCHEMES = [
  { id: 'classic', label: 'Classic' },
  { id: 'arcane', label: 'Arcane' },
  { id: 'verdant', label: 'Verdant' },
  { id: 'frost', label: 'Frost' },
] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number]['id'];

const STORAGE_KEY = 'character-creator:color-scheme';
const DEFAULT_SCHEME: ColorScheme = 'classic';

function isColorScheme(value: unknown): value is ColorScheme {
  return typeof value === 'string' && COLOR_SCHEMES.some((s) => s.id === value);
}

function readStored(): ColorScheme {
  if (typeof window === 'undefined') return DEFAULT_SCHEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isColorScheme(raw) ? raw : DEFAULT_SCHEME;
  } catch {
    // localStorage can throw in Safari private mode, sandboxed iframes, etc.
    return DEFAULT_SCHEME;
  }
}

export function usePreferences(): {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
} {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(readStored);

  // Reflect the scheme onto <html data-color-scheme="..."> so the CSS
  // overrides in styles/color-schemes.css cascade into every component.
  // Classic now has its own CSS block, so we always setAttribute.
  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', colorScheme);
  }, [colorScheme]);

  const setColorScheme = useCallback((scheme: ColorScheme): void => {
    setColorSchemeState(scheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, scheme);
    } catch {
      // ignore — non-persistent fallback still works for the session
    }
  }, []);

  return { colorScheme, setColorScheme };
}
