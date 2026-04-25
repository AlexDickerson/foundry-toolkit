/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEscapeToClose } from './useEscapeToClose';

afterEach(() => {
  document.body.innerHTML = '';
});

function fireEscapeOn(target: EventTarget): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('useEscapeToClose', () => {
  it('calls onClose when Escape is pressed and isOpen is true', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, true));

    fireEscapeOn(document);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when isOpen is false', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, false));

    fireEscapeOn(document);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the listener after unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeToClose(onClose, true));

    unmount();
    fireEscapeOn(document);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the listener when isOpen flips to false', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }: { open: boolean }) => useEscapeToClose(onClose, open), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    fireEscapeOn(document);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-attaches the listener when isOpen flips back to true', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }: { open: boolean }) => useEscapeToClose(onClose, open), {
      initialProps: { open: false },
    });

    rerender({ open: true });
    fireEscapeOn(document);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the latest onClose callback without re-registering the listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useEscapeToClose(cb, true), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    fireEscapeOn(document);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when Escape originates from an <input>', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, true));

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEscapeOn(input);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when Escape originates from a <textarea>', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, true));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    fireEscapeOn(textarea);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when Escape originates from a contenteditable element', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, true));

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    fireEscapeOn(div);

    expect(onClose).not.toHaveBeenCalled();
  });
});
