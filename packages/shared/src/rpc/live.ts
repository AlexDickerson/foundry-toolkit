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
});

export const chatLogBackfillSchema = z.object({
  messages: z.array(chatMessageSnapshotSchema),
  truncated: z.boolean(),
});

export type ChatSpeaker = z.infer<typeof chatSpeakerSchema>;
export type ChatRoll = z.infer<typeof chatRollSchema>;
export type ChatMessageSnapshot = z.infer<typeof chatMessageSnapshotSchema>;
export type ChatLogBackfill = z.infer<typeof chatLogBackfillSchema>;
