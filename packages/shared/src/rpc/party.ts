// Zod schemas and inferred types for the party read-side endpoints:
//   GET /api/actors/:id/party         → PartyForMember
//   GET /api/actors/:id/party-stash   → PartyStash
//
// Consumed by apps/foundry-mcp (response validation) and apps/player-portal
// (typed fetch wrappers + useParty hook). Shared here so server + client
// can't drift silently.

import { z } from 'zod/v4';

export const partyMemberConditionSchema = z.object({
  slug: z.string(),
  /** null for binary conditions; a positive integer for conditions with
   *  degrees (e.g. frightened 2 → value: 2). */
  value: z.number().nullable(),
});

export const partyMemberShieldSchema = z.object({
  hpValue: z.number(),
  hpMax: z.number(),
  raised: z.boolean(),
  broken: z.boolean(),
});

export const partyRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  img: z.string(),
});

export const partyMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  img: z.string(),
  level: z.number(),
  hp: z.object({ value: z.number(), max: z.number(), temp: z.number() }),
  ac: z.number(),
  perceptionMod: z.number(),
  heroPoints: z.object({ value: z.number(), max: z.number() }),
  /** null when the member has no shield equipped. */
  shield: partyMemberShieldSchema.nullable(),
  conditions: z.array(partyMemberConditionSchema),
  /** true when this member's id matches the actorId that initiated the request
   *  (i.e. the character whose sheet is currently open). */
  isOwnedByUser: z.boolean(),
});

export const partyForMemberSchema = z.object({
  /** null when the given actor isn't in any party. */
  party: partyRefSchema.nullable(),
  members: z.array(partyMemberSchema),
});

// ItemSummary inline — mirrors the shape GetPreparedActorHandler produces.
// Kept separate from the actor's full prepared payload so stash consumers
// only receive item-level data without the party actor's system block.
export const partyStashItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  img: z.string(),
  system: z.record(z.string(), z.unknown()),
});

export const partyStashSchema = z.object({
  items: z.array(partyStashItemSchema),
});

export type PartyMemberCondition = z.infer<typeof partyMemberConditionSchema>;
export type PartyMemberShield = z.infer<typeof partyMemberShieldSchema>;
export type PartyRef = z.infer<typeof partyRefSchema>;
export type PartyMember = z.infer<typeof partyMemberSchema>;
export type PartyForMember = z.infer<typeof partyForMemberSchema>;
export type PartyStashItem = z.infer<typeof partyStashItemSchema>;
export type PartyStash = z.infer<typeof partyStashSchema>;
