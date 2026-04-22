import { resolve } from 'node:path';
import { homedir } from 'node:os';

export const PORT = parseInt(process.env.PORT ?? '8765', 10);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const COMMAND_TIMEOUT_MS = 30_000;
export const FOUNDRY_DATA_DIR = process.env.FOUNDRY_DATA_DIR ?? resolve(homedir(), 'foundrydata', 'Data');

// Gates POST /api/eval. When off (the default), the route isn't registered
// at all — a request returns 404 with our envelope, indistinguishable from
// an unknown endpoint. When on, arbitrary JS runs in the Foundry page;
// only enable on trusted networks.
export const ALLOW_EVAL = process.env.ALLOW_EVAL === '1';
