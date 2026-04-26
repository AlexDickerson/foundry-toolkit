import { describe, expect, it } from 'vitest';
import {
  aurusSnapshotSchema,
  chatLogBackfillSchema,
  chatMessageSnapshotSchema,
  globeSnapshotSchema,
  inventorySnapshotSchema,
  type AurusSnapshot,
  type ChatLogBackfill,
  type ChatMessageSnapshot,
  type GlobeSnapshot,
  type InventorySnapshot,
} from './live';

// ─── InventorySnapshot ────────────────────────────────────────────────────────

describe('inventorySnapshotSchema', () => {
  const validSnapshot: InventorySnapshot = {
    items: [
      {
        id: 'item-001',
        name: 'Potion of Healing',
        qty: 3,
        category: 'consumable',
        bulk: 0.1,
        valueCp: 10000,
        aonUrl: 'https://2e.aonprd.com/Equipment.aspx?ID=186',
        note: 'Lesser',
        carriedBy: 'Valeros',
        createdAt: '2024-03-15T10:00:00.000Z',
        updatedAt: '2024-03-15T12:30:00.000Z',
      },
      {
        id: 'item-002',
        name: 'Greatsword',
        qty: 1,
        category: 'equipment',
        bulk: 2,
        valueCp: 200,
        createdAt: '2024-03-10T08:00:00.000Z',
        updatedAt: '2024-03-10T08:00:00.000Z',
      },
    ],
    updatedAt: '2024-03-15T12:30:00.000Z',
  };

  it('round-trips a valid snapshot', () => {
    const parsed: InventorySnapshot = inventorySnapshotSchema.parse(validSnapshot);
    expect(parsed).toEqual(validSnapshot);
  });

  it('round-trips via JSON serialization', () => {
    const roundTripped = inventorySnapshotSchema.parse(JSON.parse(JSON.stringify(validSnapshot)));
    expect(roundTripped).toEqual(validSnapshot);
  });

  it('accepts an empty items array', () => {
    const empty = inventorySnapshotSchema.parse({ items: [], updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(empty.items).toHaveLength(0);
  });

  it('accepts all category values', () => {
    const categories = ['consumable', 'equipment', 'quest', 'treasure', 'other'] as const;
    for (const category of categories) {
      const parsed = inventorySnapshotSchema.parse({
        items: [{ id: 'x', name: 'Item', qty: 1, category, createdAt: 'ts', updatedAt: 'ts' }],
        updatedAt: 'ts',
      });
      expect(parsed.items[0]?.category).toBe(category);
    }
  });

  it('rejects an unknown category', () => {
    expect(() =>
      inventorySnapshotSchema.parse({
        items: [{ id: 'x', name: 'Item', qty: 1, category: 'magical', createdAt: 'ts', updatedAt: 'ts' }],
        updatedAt: 'ts',
      }),
    ).toThrow();
  });

  it('rejects a snapshot missing updatedAt', () => {
    expect(() => inventorySnapshotSchema.parse({ items: [] })).toThrow();
  });

  it('rejects an item missing required name', () => {
    expect(() =>
      inventorySnapshotSchema.parse({
        items: [{ id: 'x', qty: 1, category: 'equipment', createdAt: 'ts', updatedAt: 'ts' }],
        updatedAt: 'ts',
      }),
    ).toThrow();
  });
});

// ─── AurusSnapshot ────────────────────────────────────────────────────────────

describe('aurusSnapshotSchema', () => {
  const validSnapshot: AurusSnapshot = {
    teams: [
      {
        id: 'team-001',
        name: 'The Harrow',
        emblem: 'shield',
        color: '#c0392b',
        combatPower: 8,
        valueReclaimedCp: 450000,
        isPlayerParty: true,
        note: 'Current player party',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-03-15T12:00:00.000Z',
      },
      {
        id: 'team-002',
        name: 'Iron Fang Cavalry',
        color: '#7f8c8d',
        combatPower: 12,
        valueReclaimedCp: 820000,
        isPlayerParty: false,
        createdAt: '2024-01-15T00:00:00.000Z',
        updatedAt: '2024-03-01T09:00:00.000Z',
      },
    ],
    updatedAt: '2024-03-15T12:00:00.000Z',
  };

  it('round-trips a valid snapshot', () => {
    const parsed: AurusSnapshot = aurusSnapshotSchema.parse(validSnapshot);
    expect(parsed).toEqual(validSnapshot);
  });

  it('round-trips via JSON serialization', () => {
    const roundTripped = aurusSnapshotSchema.parse(JSON.parse(JSON.stringify(validSnapshot)));
    expect(roundTripped).toEqual(validSnapshot);
  });

  it('accepts an empty teams array', () => {
    const empty = aurusSnapshotSchema.parse({ teams: [], updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(empty.teams).toHaveLength(0);
  });

  it('rejects a team where isPlayerParty is a string instead of boolean', () => {
    expect(() =>
      aurusSnapshotSchema.parse({
        teams: [
          {
            id: 'x',
            name: 'Team',
            color: '#000',
            combatPower: 1,
            valueReclaimedCp: 0,
            isPlayerParty: 'true',
            createdAt: 'ts',
            updatedAt: 'ts',
          },
        ],
        updatedAt: 'ts',
      }),
    ).toThrow();
  });

  it('rejects a snapshot missing updatedAt', () => {
    expect(() => aurusSnapshotSchema.parse({ teams: [] })).toThrow();
  });
});

// ─── GlobeSnapshot ────────────────────────────────────────────────────────────

describe('globeSnapshotSchema', () => {
  const validSnapshot: GlobeSnapshot = {
    pins: [
      {
        id: 'pin-001',
        lng: 15.5,
        lat: -23.1,
        label: 'Absalom',
        icon: 'city',
        zoom: 4,
        note: 'The great city at the center of the world.',
        kind: 'note',
      },
      {
        id: 'pin-002',
        lng: -42.0,
        lat: 18.7,
        label: 'Breachill',
        icon: 'town',
        zoom: 6,
        note: 'Base of operations.',
        kind: 'mission',
        mission: { title: 'Clear the Citadel', status: 'active', rewardCp: 50000 },
      },
    ],
    updatedAt: '2024-03-20T18:00:00.000Z',
  };

  it('round-trips a valid snapshot', () => {
    const parsed: GlobeSnapshot = globeSnapshotSchema.parse(validSnapshot);
    expect(parsed).toEqual(validSnapshot);
  });

  it('round-trips via JSON serialization', () => {
    const roundTripped = globeSnapshotSchema.parse(JSON.parse(JSON.stringify(validSnapshot)));
    expect(roundTripped).toEqual(validSnapshot);
  });

  it('accepts a pin without an optional mission field', () => {
    const parsed = globeSnapshotSchema.parse({
      pins: [{ id: 'x', lng: 0, lat: 0, label: 'X', icon: 'dot', zoom: 3, note: '', kind: 'note' }],
      updatedAt: 'ts',
    });
    expect(parsed.pins[0]?.mission).toBeUndefined();
  });

  it('rejects an unknown kind value', () => {
    expect(() =>
      globeSnapshotSchema.parse({
        pins: [{ id: 'x', lng: 0, lat: 0, label: 'X', icon: 'dot', zoom: 3, note: '', kind: 'dungeon' }],
        updatedAt: 'ts',
      }),
    ).toThrow();
  });

  it('rejects a pin with non-numeric coordinates', () => {
    expect(() =>
      globeSnapshotSchema.parse({
        pins: [{ id: 'x', lng: 'west', lat: 0, label: 'X', icon: 'dot', zoom: 3, note: '', kind: 'note' }],
        updatedAt: 'ts',
      }),
    ).toThrow();
  });

  it('rejects a snapshot missing updatedAt', () => {
    expect(() => globeSnapshotSchema.parse({ pins: [] })).toThrow();
  });
});

// ─── ChatMessageSnapshot ──────────────────────────────────────────────────────

describe('chatMessageSnapshotSchema', () => {
  const validMessage: ChatMessageSnapshot = {
    id: 'msg-001',
    uuid: 'ChatMessage.msg-001',
    type: 1,
    author: { id: 'user-gm', name: 'GM' },
    timestamp: 1711497600000,
    flavor: 'Athletics check',
    content: '<p>Rolls Athletics!</p>',
    speaker: { alias: 'Valeros', actor: 'actor-001', scene: 'scene-001', token: 'token-001' },
    speakerOwnerIds: ['user-player1'],
    whisper: [],
    isRoll: true,
    rolls: [
      {
        formula: '1d20+7',
        total: 22,
        isCritical: true,
        isFumble: false,
        dice: [{ faces: 20, results: [{ result: 15, active: true }] }],
      },
    ],
    flags: { pf2e: { context: { type: 'skill-check' } } },
  };

  it('round-trips a valid message', () => {
    const parsed: ChatMessageSnapshot = chatMessageSnapshotSchema.parse(validMessage);
    expect(parsed).toEqual(validMessage);
  });

  it('round-trips via JSON serialization', () => {
    const roundTripped = chatMessageSnapshotSchema.parse(JSON.parse(JSON.stringify(validMessage)));
    expect(roundTripped).toEqual(validMessage);
  });

  it('accepts null for nullable fields', () => {
    const parsed = chatMessageSnapshotSchema.parse({
      ...validMessage,
      uuid: null,
      type: null,
      author: null,
      timestamp: null,
      speaker: null,
    });
    expect(parsed.uuid).toBeNull();
    expect(parsed.type).toBeNull();
    expect(parsed.author).toBeNull();
    expect(parsed.timestamp).toBeNull();
    expect(parsed.speaker).toBeNull();
  });

  it('accepts an empty speakerOwnerIds and whisper array', () => {
    const parsed = chatMessageSnapshotSchema.parse({ ...validMessage, speakerOwnerIds: [], whisper: [] });
    expect(parsed.speakerOwnerIds).toHaveLength(0);
    expect(parsed.whisper).toHaveLength(0);
  });

  it('accepts a message with no rolls (non-roll message)', () => {
    const parsed = chatMessageSnapshotSchema.parse({ ...validMessage, isRoll: false, rolls: [] });
    expect(parsed.isRoll).toBe(false);
    expect(parsed.rolls).toHaveLength(0);
  });

  it('strips unknown fields on roll objects (passthrough-lenient, not strict)', () => {
    const parsed = chatMessageSnapshotSchema.parse({
      ...validMessage,
      rolls: [{ formula: '1d6', total: 4, isCritical: false, isFumble: false, dice: [], unknownField: 'surprise' }],
    });
    expect(parsed.rolls[0]).not.toHaveProperty('unknownField');
  });

  it('rejects a message missing the required id field', () => {
    const { id: _id, ...withoutId } = validMessage;
    expect(() => chatMessageSnapshotSchema.parse(withoutId)).toThrow();
  });

  it('rejects a message missing the required content field', () => {
    const { content: _c, ...withoutContent } = validMessage;
    expect(() => chatMessageSnapshotSchema.parse(withoutContent)).toThrow();
  });

  it('rejects isRoll with wrong type', () => {
    expect(() => chatMessageSnapshotSchema.parse({ ...validMessage, isRoll: 'true' })).toThrow();
  });

  it('rejects whisper as a non-array string', () => {
    expect(() => chatMessageSnapshotSchema.parse({ ...validMessage, whisper: 'public' })).toThrow();
  });

  it('rejects a roll with a non-numeric total', () => {
    expect(() =>
      chatMessageSnapshotSchema.parse({
        ...validMessage,
        rolls: [{ formula: '1d20', total: 'high', isCritical: false, isFumble: false, dice: [] }],
      }),
    ).toThrow();
  });
});

// ─── ChatLogBackfill ──────────────────────────────────────────────────────────

describe('chatLogBackfillSchema', () => {
  const minimalMessage: ChatMessageSnapshot = {
    id: 'msg-001',
    uuid: null,
    type: null,
    author: null,
    timestamp: null,
    flavor: '',
    content: 'Hello',
    speaker: null,
    speakerOwnerIds: [],
    whisper: [],
    isRoll: false,
    rolls: [],
    flags: {},
  };

  const validBackfill: ChatLogBackfill = {
    messages: [minimalMessage],
    truncated: false,
  };

  it('round-trips a valid backfill', () => {
    const parsed: ChatLogBackfill = chatLogBackfillSchema.parse(validBackfill);
    expect(parsed).toEqual(validBackfill);
  });

  it('round-trips via JSON serialization', () => {
    const roundTripped = chatLogBackfillSchema.parse(JSON.parse(JSON.stringify(validBackfill)));
    expect(roundTripped).toEqual(validBackfill);
  });

  it('accepts an empty messages array with truncated=false', () => {
    const parsed = chatLogBackfillSchema.parse({ messages: [], truncated: false });
    expect(parsed.messages).toHaveLength(0);
    expect(parsed.truncated).toBe(false);
  });

  it('accepts truncated=true when the buffer was capped', () => {
    const parsed = chatLogBackfillSchema.parse({ messages: [], truncated: true });
    expect(parsed.truncated).toBe(true);
  });

  it('rejects a backfill missing the truncated field', () => {
    expect(() => chatLogBackfillSchema.parse({ messages: [] })).toThrow();
  });

  it('rejects a backfill where truncated is not a boolean', () => {
    expect(() => chatLogBackfillSchema.parse({ messages: [], truncated: 1 })).toThrow();
  });

  it('rejects a backfill where a message is invalid', () => {
    expect(() =>
      chatLogBackfillSchema.parse({
        messages: [{ ...minimalMessage, isRoll: 'yes' }],
        truncated: false,
      }),
    ).toThrow();
  });
});
