// Live-state snapshot shapes. Canonical definitions now live in
// packages/shared/src/rpc/live.ts alongside their Zod schemas so that
// dm-tool, foundry-mcp, and this server all derive from one source.
//
// These are type-only re-exports — TypeScript erases them at compile
// time, so the NodeNext-compiled server has no runtime dependency on
// @foundry-toolkit/shared.
export type {
  AurusSnapshot,
  AurusTeam,
  GlobePin,
  GlobeSnapshot,
  InventorySnapshot,
  PartyInventoryItem,
} from '@foundry-toolkit/shared/rpc';
