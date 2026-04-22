// Zod schemas for the `/api/*` HTTP surface live in
// `@foundry-toolkit/shared/rpc` — shared with character-creator so both
// ends of the wire can speak the same contract. This file re-exports
// them so the existing `'../schemas.js'` imports in `src/http/routes/*`
// keep working.

export * from '@foundry-toolkit/shared/rpc';
