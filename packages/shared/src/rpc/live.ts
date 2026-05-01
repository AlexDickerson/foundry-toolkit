// Zod schemas for the live-state datasets shared between dm-tool, foundry-mcp,
// and player-portal: Aurus combat teams and globe pins.
//
// Each schema exports both the runtime validator and an inferred TS type so
// every consumer derives from one source. foundry-mcp is the authority on
// these routes; shape drift surfaces as TS errors across all consumers at the
// next typecheck.
//
// Party inventory has been retired: players now read the Party actor's stash
// directly from Foundry via getPartyStash. See packages/shared/src/rpc/party.ts.

import { z } from 'zod/v4';

export const aurusTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  emblem: z.string().optional(),
  color: z.string(),
  combatPower: z.number(),
  valueReclaimedCp: z.number(),
  isPlayerParty: z.boolean(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Globe pins pushed from dm-tool. foundry-mcp is a pass-through — it
// doesn't inspect `mission` beyond storing it. Mission data is shaped +
// DM-scrubbed before the push, see dm-tool's globe.ts.
export const globePinSchema = z.object({
  id: z.string(),
  lng: z.number(),
  lat: z.number(),
  label: z.string(),
  icon: z.string(),
  iconColor: z.string().optional(),
  zoom: z.number(),
  note: z.string(),
  kind: z.enum(['note', 'mission']),
  mission: z.record(z.string(), z.unknown()).optional(),
});

export const aurusSnapshotSchema = z.object({
  teams: z.array(aurusTeamSchema),
  updatedAt: z.string(),
});

export const globeSnapshotSchema = z.object({
  pins: z.array(globePinSchema),
  updatedAt: z.string(),
});

export type AurusTeam = z.infer<typeof aurusTeamSchema>;
export type GlobePin = z.infer<typeof globePinSchema>;
export type AurusSnapshot = z.infer<typeof aurusSnapshotSchema>;
export type GlobeSnapshot = z.infer<typeof globeSnapshotSchema>;

// ── Chat relay wire types ──────────────────────────────────────────────────
// Mirrors the output of serializeChatMessage() in foundry-api-bridge, plus
// the speakerOwnerIds field added in PR 1. PR 2 uses these to type the
// filtered SSE stream and backfill route; PR 3 uses them in the portal.

export const chatSpeakerSchema = z.object({
  alias: z.string().optional(),
  actor: z.string().optional(),
  scene: z.string().optional(),
  token: z.string().optional(),
});

export const chatRollDieResultSchema = z.object({
  result: z.number(),
  active: z.boolean(),
});

export const chatRollDiceTermSchema = z.object({
  faces: z.number(),
  results: z.array(chatRollDieResultSchema),
});

export const chatRollSchema = z.object({
  formula: z.string(),
  total: z.number(),
  isCritical: z.boolean(),
  isFumble: z.boolean(),
  dice: z.array(chatRollDiceTermSchema),
});

// ── Structured chat-message data ─────────────────────────────────────────────
// Parsed semantic structure extracted from flags.pf2e.* by the api-bridge.
// The portal renders these directly instead of raw PF2e HTML when present.
// Unknown message types fall through to { kind: 'raw', html } so nothing is
// lost. Not all four message types may be present in a given session — the
// portal falls back to the HTML render for any message that lacks `structured`.

export const chatChipTypeSchema = z.enum([
  'roll-damage',
  'place-template',
  'apply-damage',
  'save',
  'shove',
  'grapple',
  'unknown',
]);

export const chatChipSchema = z.object({
  type: chatChipTypeSchema,
  label: z.string(),
  params: z.record(z.string(), z.unknown()),
});

export const chatTargetResultSchema = z.object({
  actorId: z.string().optional(),
  tokenId: z.string().optional(),
  name: z.string(),
  outcome: z.enum(['criticalSuccess', 'success', 'failure', 'criticalFailure']).optional(),
  total: z.number().optional(),
  ac: z.number().optional(),
});

export const chatDamagePartSchema = z.object({
  formula: z.string(),
  total: z.number(),
  damageType: z.string().optional(),
});

export const chatStructuredDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('strike-attack'),
    flavor: z.string(),
    targets: z.array(chatTargetResultSchema),
    chips: z.array(chatChipSchema),
  }),
  z.object({
    kind: z.literal('damage'),
    flavor: z.string(),
    parts: z.array(chatDamagePartSchema),
    total: z.number(),
    chips: z.array(chatChipSchema),
  }),
  z.object({
    kind: z.literal('skill-check'),
    flavor: z.string(),
    dc: z.number().optional(),
    outcome: z.enum(['criticalSuccess', 'success', 'failure', 'criticalFailure']).optional(),
    chips: z.array(chatChipSchema),
  }),
  z.object({
    kind: z.literal('saving-throw'),
    flavor: z.string(),
    dc: z.number().optional(),
    outcome: z.enum(['criticalSuccess', 'success', 'failure', 'criticalFailure']).optional(),
    chips: z.array(chatChipSchema),
  }),
  z.object({
    kind: z.literal('spell-cast'),
    flavor: z.string(),
    description: z.string(),
    chips: z.array(chatChipSchema),
  }),
  z.object({
    kind: z.literal('raw'),
    html: z.string(),
  }),
]);

// All nullable fields match the ?? null / ?? [] fallbacks in serializeChatMessage.
export const chatMessageSnapshotSchema = z.object({
  id: z.string(),
  uuid: z.string().nullable(),
  type: z.union([z.number(), z.string()]).nullable(),
  author: z.object({ id: z.string(), name: z.string() }).nullable(),
  timestamp: z.number().nullable(),
  flavor: z.string(),
  content: z.string(),
  speaker: chatSpeakerSchema.nullable(),
  speakerOwnerIds: z.array(z.string()),
  whisper: z.array(z.string()),
  isRoll: z.boolean(),
  rolls: z.array(chatRollSchema),
  flags: z.record(z.string(), z.unknown()),
  // Structured semantic data extracted from flags.pf2e.* by the api-bridge.
  // Optional: absent for messages before this feature, or when the api-bridge
  // emits a kind the portal doesn't yet recognise. Falls back to raw HTML.
  structured: chatStructuredDataSchema.optional(),
});

export const chatLogBackfillSchema = z.object({
  messages: z.array(chatMessageSnapshotSchema),
  truncated: z.boolean(),
});

export type ChatSpeaker = z.infer<typeof chatSpeakerSchema>;
export type ChatRoll = z.infer<typeof chatRollSchema>;
export type ChatChipType = z.infer<typeof chatChipTypeSchema>;
export type ChatChip = z.infer<typeof chatChipSchema>;
export type ChatTargetResult = z.infer<typeof chatTargetResultSchema>;
export type ChatDamagePart = z.infer<typeof chatDamagePartSchema>;
export type ChatStructuredData = z.infer<typeof chatStructuredDataSchema>;
export type ChatMessageSnapshot = z.infer<typeof chatMessageSnapshotSchema>;
export type ChatLogBackfill = z.infer<typeof chatLogBackfillSchema>;
