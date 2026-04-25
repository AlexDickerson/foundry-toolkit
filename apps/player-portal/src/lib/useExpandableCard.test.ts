import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useExpandableCard } from './useExpandableCard';

afterEach(() => {
  cleanup();
});

describe('useExpandableCard', () => {
  it('starts collapsed by default', () => {
    const { result } = renderHook(() => useExpandableCard());
    expect(result.current.isOpen).toBe(false);
  });

  it('can start expanded', () => {
    const { result } = renderHook(() => useExpandableCard(true));
    expect(result.current.isOpen).toBe(true);
  });

  it('toggle: collapsed → expanded → collapsed', () => {
    const { result } = renderHook(() => useExpandableCard());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('open moves to expanded state', () => {
    const { result } = renderHook(() => useExpandableCard());
    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('close moves to collapsed state', () => {
    const { result } = renderHook(() => useExpandableCard(true));
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('open is idempotent', () => {
    const { result } = renderHook(() => useExpandableCard(true));
    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('close is idempotent', () => {
    const { result } = renderHook(() => useExpandableCard(false));
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
