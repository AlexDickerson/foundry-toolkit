import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, cleanup, renderHook } from '@testing-library/react';
import { getShopMode, setShopMode, useShopMode } from './useShopMode';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('useShopMode', () => {
  it('defaults to disabled / sellRatio 0.5', () => {
    const { result } = renderHook(() => useShopMode());
    expect(result.current.enabled).toBe(false);
    expect(result.current.sellRatio).toBe(0.5);
  });

  it('setEnabled updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useShopMode());
    act(() => {
      result.current.setEnabled(true);
    });
    expect(result.current.enabled).toBe(true);
    expect(getShopMode().enabled).toBe(true);
  });

  it('setSellRatio clamps to [0, 1]', () => {
    const { result } = renderHook(() => useShopMode());
    act(() => {
      result.current.setSellRatio(1.5);
    });
    expect(result.current.sellRatio).toBe(1);
    act(() => {
      result.current.setSellRatio(-0.2);
    });
    expect(result.current.sellRatio).toBe(0);
  });

  it('external setShopMode triggers a re-render in subscribed hooks', () => {
    let renders = 0;
    function Probe(): null {
      useShopMode();
      renders += 1;
      return null as unknown as null;
    }
    render(<Probe />);
    expect(renders).toBeGreaterThanOrEqual(1);
    const before = renders;
    act(() => {
      setShopMode({ enabled: true });
    });
    expect(renders).toBeGreaterThan(before);
    expect(getShopMode().enabled).toBe(true);
  });
});

describe('window.__shopMode programmatic API', () => {
  it('is exposed for the DM-side integration to flip', () => {
    const api = (window as unknown as { __shopMode?: { set: typeof setShopMode; get: typeof getShopMode } })
      .__shopMode;
    expect(api).toBeDefined();
    api?.set({ enabled: true, sellRatio: 0.25 });
    expect(api?.get()).toEqual({ enabled: true, sellRatio: 0.25 });
  });
});
