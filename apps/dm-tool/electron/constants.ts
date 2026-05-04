// Centralized constants for the Electron main process.
// Keeps magic strings and numbers out of logic modules.

// --- Anthropic API -----------------------------------------------------------

// Only consumer left in dm-tool is tagger.ts (templates the model into the
// Python tagger's TOML config). Source of truth is @foundry-toolkit/shared.
export { DEFAULT_CHAT_MODEL as DEFAULT_MODEL } from '@foundry-toolkit/shared/types';

// --- Archives of Nethys ------------------------------------------------------

export const AON_ELASTICSEARCH_URL = 'https://elasticsearch.aonprd.com/aon/_search';

// --- Foundry VTT MCP --------------------------------------------------------

export const MCP_PROTOCOL_VERSION = '2025-03-26';

// --- File conventions --------------------------------------------------------

export const THUMBNAIL_SUFFIX = '.thumb.jpg';
