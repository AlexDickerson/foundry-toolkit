#!/usr/bin/env tsx
// Seed CLI: walks a directory of purchased PF2e item-card PNGs, maps each
// filename to a PF2e item slug, and upserts rows into item_art_overrides.
//
// Usage:
//   npm run seed-item-art -w apps/foundry-mcp -- --dir "/Volumes/DnD/Item Art"
//
// Options:
//   --dir <path>     Directory containing art PNGs (required)
//   --db  <path>     Path to foundry-mcp.db (default: ./data/foundry-mcp.db)
//   --url <url>      foundry-mcp base URL for compendium lookup
//                    (default: http://localhost:8765)
//
// The CLI calls GET /api/compendium/search on the running foundry-mcp server
// to resolve item names to their canonical PF2e slugs. Start foundry-mcp with
// COMPENDIUM_CACHE_PACK_IDS=pf2e.equipment-srd (and Foundry connected) before
// running for best results — cold searches fall back to the bridge and are slow.
//
// Filenames are decoded from URL-encoded form:
//   +    → space
//   %XX  → the corresponding character
//   +-+  → separates base name from variant; variant wraps in parentheses
//          e.g. Acid+Flask+-+Greater.png → "Acid Flask (Greater)"
//
// Spelling normalisation: Armour → Armor (UK→US for the one known PF2e variant)

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveDb } from '../db/live-db.js';

// ─── Filename parser ────────────────────────────────────────────────────────

/** URL-decode a PF2e art filename and return the canonical item name.
 *  Returns null if the filename is not a .png file.
 *
 *  Exported for unit tests — has no side effects. */
export function parseArtFilename(rawFilename: string): { itemName: string; originalFilename: string } | null {
  if (!rawFilename.toLowerCase().endsWith('.png')) return null;

  const withoutExt = rawFilename.slice(0, -4);

  // URL-decode: + → space, then percent-decode %XX sequences.
  const spaceDecoded = withoutExt.replace(/\+/g, ' ');
  const decoded = decodeURIComponent(spaceDecoded);

  // Normalize UK spelling variant the PF2e system uses US spelling for.
  const normalized = decoded.replace(/\bArmour\b/g, 'Armor');

  // Split on the first " - " to separate base name from variant.
  const dashIdx = normalized.indexOf(' - ');
  let itemName: string;
  if (dashIdx !== -1) {
    const base = normalized.slice(0, dashIdx).trim();
    const variant = normalized.slice(dashIdx + 3).trim();
    itemName = variant ? `${base} (${variant})` : base;
  } else {
    itemName = normalized.trim();
  }

  return { itemName, originalFilename: rawFilename };
}

/** PF2e's slug derivation: lowercase, collapse non-alphanumeric runs to a
 *  single dash, and trim leading/trailing dashes.
 *
 *  Exported for unit tests. */
export function sluggify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Compendium search ──────────────────────────────────────────────────────

interface SearchMatch {
  name: string;
  system?: { slug?: string };
}

async function lookupSlug(itemName: string, baseUrl: string): Promise<string | null> {
  const url = `${baseUrl}/api/compendium/search?q=${encodeURIComponent(itemName)}&documentType=Item&limit=10`;
  let data: { matches?: SearchMatch[] };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    data = (await res.json()) as { matches?: SearchMatch[] };
  } catch {
    return null;
  }

  if (!Array.isArray(data.matches) || data.matches.length === 0) return null;

  // Prefer an exact name match first, then a case-insensitive match.
  const lower = itemName.toLowerCase();
  const exact = data.matches.find((m) => m.name === itemName);
  const caseInsensitive = data.matches.find((m) => m.name.toLowerCase() === lower);
  const best = exact ?? caseInsensitive;

  if (!best) return null;

  // Use system.slug if present; otherwise derive it from the matched name.
  const slug = best.system?.slug ?? sluggify(best.name);
  return slug || null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let artDir: string | undefined;
  let dbPath = resolve(process.cwd(), 'data', 'foundry-mcp.db');
  let baseUrl = 'http://localhost:8765';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      artDir = resolve(args[++i]!);
    } else if (args[i] === '--db' && args[i + 1]) {
      dbPath = resolve(args[++i]!);
    } else if (args[i] === '--url' && args[i + 1]) {
      baseUrl = args[++i]!;
    }
  }

  if (!artDir) {
    process.stderr.write('Usage: seed-item-art --dir <art-directory> [--db <db-path>] [--url <foundry-mcp-url>]\n');
    process.exit(1);
  }

  // Probe the server before walking files.
  try {
    const probe = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(5_000) });
    if (!probe.ok) throw new Error(`healthz returned ${probe.status.toString()}`);
  } catch (err) {
    process.stderr.write(
      `Cannot reach foundry-mcp at ${baseUrl} — start the server (and ensure Foundry is connected for cache warm) before seeding.\n` +
        `Error: ${String(err)}\n`,
    );
    process.exit(1);
  }

  let files: string[];
  try {
    files = readdirSync(artDir).filter((f) => f.toLowerCase().endsWith('.png'));
  } catch (err) {
    process.stderr.write(`Cannot read art directory ${artDir}: ${String(err)}\n`);
    process.exit(1);
  }

  const db = new LiveDb(dbPath);

  let matched = 0;
  let skipped = 0;
  const needsReview: string[] = [];

  process.stdout.write(`Seeding ${files.length.toString()} PNG files from ${artDir}\n`);
  process.stdout.write(`  foundry-mcp: ${baseUrl}\n`);
  process.stdout.write(`  database:    ${dbPath}\n\n`);

  for (const filename of files) {
    const parsed = parseArtFilename(filename);
    if (!parsed) {
      skipped++;
      continue;
    }

    const { itemName } = parsed;
    const slug = await lookupSlug(itemName, baseUrl);

    if (slug) {
      db.setItemArtOverride(slug, filename);
      matched++;
      process.stdout.write(`  ✓ ${filename} → ${slug}\n`);
    } else {
      needsReview.push(filename);
      process.stdout.write(`  ? ${filename} → (no match for "${itemName}")\n`);
    }
  }

  db.close();

  process.stdout.write(`\n─── Summary ─────────────────────────────────────────────────────\n`);
  process.stdout.write(`  Matched:      ${matched.toString()}\n`);
  process.stdout.write(`  Skipped:      ${skipped.toString()}\n`);
  process.stdout.write(`  Needs review: ${needsReview.length.toString()}\n`);

  if (needsReview.length > 0) {
    process.stdout.write(`\nNeeds-review filenames (no matching compendium item found):\n`);
    for (const f of needsReview) {
      process.stdout.write(`  ${f}\n`);
    }
    process.stdout.write(
      `\nTips:\n` +
        `  • Typos (Occulus → Oculus): fix the filename or seed manually via the DB.\n` +
        `  • Variant codes (Briar+-+S8.png): look up the PF2e slug and run:\n` +
        `      sqlite3 <db-path> "INSERT OR REPLACE INTO item_art_overrides VALUES('<slug>','<filename>',strftime('%s','now')*1000)"\n` +
        `  • Non-SRD items may not appear unless their pack is in COMPENDIUM_CACHE_PACK_IDS.\n`,
    );
  }
}

// Only run main() when executed directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
