import { describe, it, expect } from 'vitest';
import {
  BRIDGE_EVENT_DIALOG_REQUEST,
  BRIDGE_EVENT_PROMPT_REQUEST,
  type DialogSpec,
  type DialogResolution,
  type DialogButton,
  type DialogField,
} from './dialog.js';

describe('dialog wire types — round-trip serialization', () => {
  it('serialises and deserialises a button-only DialogSpec', () => {
    const spec: DialogSpec = {
      dialogId: 'abc-123',
      kind: 'Dialog',
      title: 'Confirm Damage',
      text: 'Roll full damage?',
      buttons: [
        { id: 'yes', label: 'Yes', isDefault: true },
        { id: 'no', label: 'No', isDefault: false },
      ],
      fields: [],
    };

    const serialised = JSON.stringify(spec);
    const restored = JSON.parse(serialised) as DialogSpec;

    expect(restored.dialogId).toBe('abc-123');
    expect(restored.kind).toBe('Dialog');
    expect(restored.title).toBe('Confirm Damage');
    expect(restored.text).toBe('Roll full damage?');
    expect(restored.buttons).toHaveLength(2);
    expect(restored.buttons[0]).toEqual<DialogButton>({ id: 'yes', label: 'Yes', isDefault: true });
    expect(restored.buttons[1]).toEqual<DialogButton>({ id: 'no', label: 'No', isDefault: false });
    expect(restored.fields).toHaveLength(0);
  });

  it('serialises and deserialises a DialogSpec with form fields', () => {
    const spec: DialogSpec = {
      dialogId: 'def-456',
      kind: 'CheckDialogPF2e',
      title: 'Roll Athletics',
      text: 'Modifier:',
      buttons: [{ id: 'roll', label: 'Roll', isDefault: true }],
      fields: [
        {
          name: 'modifier',
          type: 'number',
          label: 'Situational Modifier',
          value: 0,
        },
        {
          name: 'secret',
          type: 'checkbox',
          label: 'Secret Roll',
          value: false,
        },
        {
          name: 'rollMode',
          type: 'select',
          label: 'Roll Mode',
          value: 'publicroll',
          options: [
            { value: 'publicroll', label: 'Public' },
            { value: 'gmroll', label: 'GM Roll' },
          ],
        },
      ],
    };

    const serialised = JSON.stringify(spec);
    const restored = JSON.parse(serialised) as DialogSpec;

    expect(restored.fields).toHaveLength(3);
    const numField = restored.fields.find((f) => f.name === 'modifier');
    expect(numField).toEqual<DialogField>({
      name: 'modifier',
      type: 'number',
      label: 'Situational Modifier',
      value: 0,
    });

    const selectField = restored.fields.find((f) => f.name === 'rollMode');
    expect(selectField?.options).toHaveLength(2);
    expect(selectField?.options?.[0]).toEqual({ value: 'publicroll', label: 'Public' });
  });

  it('serialises a DialogResolution with formData', () => {
    const resolution: DialogResolution = {
      buttonId: 'roll',
      formData: {
        modifier: 2,
        secret: false,
        rollMode: 'publicroll',
      },
    };

    const serialised = JSON.stringify(resolution);
    const restored = JSON.parse(serialised) as DialogResolution;

    expect(restored.buttonId).toBe('roll');
    expect(restored.formData['modifier']).toBe(2);
    expect(restored.formData['secret']).toBe(false);
    expect(restored.formData['rollMode']).toBe('publicroll');
  });

  it('serialises a DialogSpec with null text', () => {
    const spec: DialogSpec = {
      dialogId: 'ghi-789',
      kind: 'Dialog',
      title: 'Confirm',
      text: null,
      buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
      fields: [],
    };

    const serialised = JSON.stringify(spec);
    const restored = JSON.parse(serialised) as DialogSpec;

    expect(restored.text).toBeNull();
  });
});

describe('bridge event kind constants', () => {
  it('exports correct string values', () => {
    expect(BRIDGE_EVENT_PROMPT_REQUEST).toBe('prompt-request');
    expect(BRIDGE_EVENT_DIALOG_REQUEST).toBe('dialog-request');
  });

  it('constants are distinct', () => {
    expect(BRIDGE_EVENT_PROMPT_REQUEST).not.toBe(BRIDGE_EVENT_DIALOG_REQUEST);
  });
});
