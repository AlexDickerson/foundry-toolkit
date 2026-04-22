// Convenience re-exports. Most consumers should import from the subpath
// that matches the DB they care about — `@foundry-toolkit/db/pf2e`, `@foundry-toolkit/db/books`,
// or `@foundry-toolkit/db/maps` — to keep the dependency graph obvious.
export * from './pf2e/index.js';
export { BookDb, type ScannedFile } from './books/index.js';
export { MapDb } from './maps/index.js';
