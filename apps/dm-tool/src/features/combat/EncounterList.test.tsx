/** @vitest-environment happy-dom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Encounter } from '@foundry-toolkit/shared/types';
import { EncounterList } from './EncounterList';

function mkEncounter(id: string, name: string): Encounter {
  return {
    id,
    name,
    combatants: [],
    turnIndex: 0,
    round: 1,
    loot: [],
    allowInventedItems: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const ENC_A = mkEncounter('enc-1', 'Goblin Ambush');
const ENC_B = mkEncounter('enc-2', 'Dragon Fight');

function renderList(onDelete = vi.fn()) {
  render(
    <EncounterList
      encounters={[ENC_A, ENC_B]}
      activeId="enc-1"
      loading={false}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onDelete={onDelete}
    />,
  );
  return { onDelete };
}

describe('EncounterList — delete confirmation modal', () => {
  it('does not call onDelete immediately when the trash button is clicked', () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goblin Ambush' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens a dialog showing the encounter name when the trash button is clicked', () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goblin Ambush' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/goblin ambush/i)).toBeTruthy();
  });

  it('calls onDelete with the correct encounter id when the user confirms', () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goblin Ambush' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith('enc-1');
  });

  it('does not call onDelete when the user cancels', () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goblin Ambush' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('dismisses the dialog after the user confirms', () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goblin Ambush' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('enc-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the correct encounter name for a second encounter', () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Dragon Fight' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/dragon fight/i)).toBeTruthy();
  });
});
