// Zod schemas for the three live-state datasets shared between dm-tool,
// foundry-mcp, and player-portal: party inventory, Aurus combat teams,
// and globe pins.
//
// Each schema exports both the runtime validator and an inferred TS type
// so every consumer derives from one source. foundry-mcp is the eventual
// authority on these routes; shape drift surfaces as TS errors across all
// consumers at the next typecheck.

import { z } from 'zod/v4';

export const partyInventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number(),
  category: z.enum(['consumable', 'equipment', 'quest', 'treasure', 'other']),
  bulk: z.number().optional(),
  valueCp: z.number().optional(),
  aonUrl: z.string().optional(),
  note: z.string().optional(),
  carriedBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

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

export const inventorySnapshotSchema = z.object({
  items: z.array(partyInventoryItemSchema),
  updatedAt: z.string(),
});

export const aurusSnapshotSchema = z.object({
  teams: z.array(aurusTeamSchema),
  updatedAt: z.string(),
});

export const globeSnapshotSchema = z.object({
  pins: z.array(globePinSchema),
  updatedAt: z.string(),
});

export type PartyInventoryItem = z.infer<typeof partyInventoryItemSchema>;
export type AurusTeam = z.infer<typeof aurusTeamSchema>;
export type GlobePin = z.infer<typeof globePinSchema>;
export type InventorySnapshot = z.infer<typeof inventorySnapshotSchema>;
export type AurusSnapshot = z.infer<typeof aurusSnapshotSchema>;
export type GlobeSnapshot = z.infer<typeof globeSnapshotSchema>;
