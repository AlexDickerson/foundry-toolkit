// Side-effect import: `import '@foundry-toolkit/shared/env-auto'` at the top
// of a Node entry point loads the monorepo root `.env` before any sibling
// import's top-level code runs (ESM evaluates dependencies depth-first).
// Use this instead of calling `loadRootEnv()` yourself when you need env
// vars visible during module initialization of other imports.
import { loadRootEnv } from './env.js';

loadRootEnv();
