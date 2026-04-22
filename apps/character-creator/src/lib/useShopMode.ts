import { useEffect, useState } from 'react';

// Shop mode state shared between the Inventory tab's debug panel and
// whatever external DM-side integration eventually drives it. The
// store lives in localStorage so a reload keeps the mode on, and
// exposes a programmatic `window.__shopMode.set({...})` API for the
// DM client to flip the flag remotely.

export interface ShopModeState {
  enabled: boolean;
  // Fraction of an item's price that the player receives when selling.
  // 0.5 is the pf2e baseline; rolled lower by haggle, up by lore.
  sellRatio: number;
}

const STORAGE_KEY = 'shopMode';
const CHANGE_EVENT = 'shopmode:change';

const DEFAULT_STATE: ShopModeState = {
  enabled: false,
  sellRatio: 0.5,
};

function readState(): ShopModeState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ShopModeState>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_STATE.enabled,
      sellRatio:
        typeof parsed.sellRatio === 'number' && Number.isFinite(parsed.sellRatio)
          ? clampRatio(parsed.sellRatio)
          : DEFAULT_STATE.sellRatio,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(next: ShopModeState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private-browsing / quota errors — the in-memory state is still
    // valid for this session, so just silently skip persistence.
  }
  window.dispatchEvent(new CustomEvent<ShopModeState>(CHANGE_EVENT, { detail: next }));
}

function clampRatio(r: number): number {
  if (r < 0) return 0;
  if (r > 1) return 1;
  return r;
}

// External API surface for the DM-side integration. Calling this
// updates localStorage and dispatches the change event, so every
// subscribed hook instance re-renders immediately.
export function setShopMode(patch: Partial<ShopModeState>): ShopModeState {
  const current = readState();
  const next: ShopModeState = {
    enabled: patch.enabled ?? current.enabled,
    sellRatio: patch.sellRatio !== undefined ? clampRatio(patch.sellRatio) : current.sellRatio,
  };
  writeState(next);
  return next;
}

export function getShopMode(): ShopModeState {
  return readState();
}

// Attach the programmatic API to `window` so the eventual DM-side
// bridge (BroadcastChannel, websocket handler, etc.) can drive it
// without depending on this module's imports.
if (typeof window !== 'undefined') {
  const globalTarget = window as unknown as { __shopMode?: { set: typeof setShopMode; get: typeof getShopMode } };
  globalTarget.__shopMode = { set: setShopMode, get: getShopMode };
}

export function useShopMode(): ShopModeState & {
  setEnabled: (v: boolean) => void;
  setSellRatio: (r: number) => void;
} {
  const [state, setState] = useState<ShopModeState>(() => readState());

  useEffect(() => {
    const onChange = (e: Event): void => {
      const detail = (e as CustomEvent<ShopModeState | undefined>).detail;
      setState(detail ?? readState());
    };
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY) setState(readState());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return (): void => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    ...state,
    setEnabled: (v: boolean): void => {
      setShopMode({ enabled: v });
    },
    setSellRatio: (r: number): void => {
      setShopMode({ sellRatio: r });
    },
  };
}
