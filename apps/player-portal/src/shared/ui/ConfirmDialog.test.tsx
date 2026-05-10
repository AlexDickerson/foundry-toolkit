import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

beforeEach(() => {
  cleanup();
});

describe('ConfirmDialog', () => {
  it('renders the message text', () => {
    const { container } = render(
      <ConfirmDialog message="Are you sure?" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="confirm-dialog-message"]')?.textContent).toBe('Are you sure?');
  });

  it('renders a custom confirm label', () => {
    const { container } = render(
      <ConfirmDialog message="Rest?" confirmLabel="Rest" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="confirm-dialog-confirm"]')?.textContent).toBe('Rest');
  });

  it('defaults confirm label to "Confirm" when not specified', () => {
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="confirm-dialog-confirm"]')?.textContent).toBe('Confirm');
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={onConfirm} onCancel={() => undefined} />,
    );
    fireEvent.click(container.querySelector('[data-testid="confirm-dialog-confirm"]')!);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => undefined} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector('[data-testid="confirm-dialog-cancel"]')!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the overlay backdrop is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => undefined} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector('[data-testid="confirm-dialog-overlay"]')!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCancel when the inner panel is clicked (stopPropagation)', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => undefined} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector('[data-testid="confirm-dialog-panel"]')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog message="?" onConfirm={() => undefined} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCancel for non-Escape key presses', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog message="?" onConfirm={() => undefined} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders an overlay backdrop element', () => {
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="confirm-dialog-overlay"]')).toBeTruthy();
  });
});
