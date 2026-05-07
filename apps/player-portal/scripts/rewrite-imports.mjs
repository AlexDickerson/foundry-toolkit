#!/usr/bin/env node
// One-off: rewrite relative imports to @/ aliases for the structure refactor.
// Run from apps/player-portal: `node scripts/rewrite-imports.mjs`
// Designed to be deleted after the refactor PR lands.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Mapping table: regex captures the relative-import suffix; substitution is the new @/ path.
// Each entry matches `from '...../<suffix>'` (any number of ./ or ../) and rewrites to '@/<dest>'.
// Subpath ($1) is captured where applicable so e.g. ../api/types/character → @/features/characters/types/character.
//
// Order matters: more specific patterns (longer suffixes) come BEFORE shorter ones,
// so `components/tabs/character/X` doesn't get prematurely rewritten by the `components/tabs` rule.
const mappings = [
  // ------------- Subpaths (longer matches first) -------------
  // tabs subdirs (character/, inventory/) before tabs/ flat
  [/from ['"](?:\.\.?\/)+components\/tabs\/character(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet/tabs/character$1'"],
  [/from ['"](?:\.\.?\/)+components\/tabs\/inventory(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet/tabs/inventory$1'"],
  [/from ['"](?:\.\.?\/)+components\/tabs(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet/tabs$1'"],

  // common/ → shared/ui/
  [/from ['"](?:\.\.?\/)+components\/common\/([^'"]+)['"]/g, "from '@/shared/ui/$1'"],

  // chat/, shop/, settings/, sheet/, creator/ → features/characters/...
  [/from ['"](?:\.\.?\/)+components\/chat(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet/chat$1'"],
  [/from ['"](?:\.\.?\/)+components\/shop(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet/shop$1'"],
  [/from ['"](?:\.\.?\/)+components\/settings\/SettingsDialog['"]/g, "from '@/features/characters/sheet/SettingsDialog'"],
  [/from ['"](?:\.\.?\/)+components\/sheet(\/[^'"]*)?['"]/g, "from '@/features/characters/sheet$1'"],
  [/from ['"](?:\.\.?\/)+components\/creator(\/[^'"]*)?['"]/g, "from '@/features/characters/creator$1'"],

  // Quarantined: picker/, dialog/
  [/from ['"](?:\.\.?\/)+components\/picker(\/[^'"]*)?['"]/g, "from '@/_quarantine/picker$1'"],
  [/from ['"](?:\.\.?\/)+components\/dialog(\/[^'"]*)?['"]/g, "from '@/_quarantine/dialog$1'"],

  // Top-level component files
  [/from ['"](?:\.\.?\/)+components\/ConnectionIndicator['"]/g, "from '@/shared/ui/ConnectionIndicator'"],
  [/from ['"](?:\.\.?\/)+components\/Layout['"]/g, "from '@/app/Layout'"],
  [/from ['"](?:\.\.?\/)+components\/Nav['"]/g, "from '@/app/Nav'"],
  [/from ['"](?:\.\.?\/)+components\/CharactersLayout['"]/g, "from '@/features/characters/CharactersLayout'"],
  [/from ['"](?:\.\.?\/)+components\/ActorList['"]/g, "from '@/features/characters/ActorList'"],

  // Routes
  [/from ['"](?:\.\.?\/)+routes\/Login['"]/g, "from '@/features/auth/Login'"],
  [/from ['"](?:\.\.?\/)+routes\/Home['"]/g, "from '@/features/home/Home'"],
  [/from ['"](?:\.\.?\/)+routes\/Globe['"]/g, "from '@/features/globe/Globe'"],
  [/from ['"](?:\.\.?\/)+routes\/Leaderboard['"]/g, "from '@/features/aurus/Leaderboard'"],
  [/from ['"](?:\.\.?\/)+routes\/Characters['"]/g, "from '@/features/characters/Characters'"],
  // routes/CharacterCreator/<sub> moved to creator/<sub> (the subdir contents),
  // but routes/CharacterCreator (no subpath) was the .tsx file itself → creator/CharacterCreator.
  [/from ['"](?:\.\.?\/)+routes\/CharacterCreator\/([^'"]+)['"]/g, "from '@/features/characters/creator/$1'"],
  [/from ['"](?:\.\.?\/)+routes\/CharacterCreator['"]/g, "from '@/features/characters/creator/CharacterCreator'"],
  [/from ['"](?:\.\.?\/)+routes\/CharacterSheet['"]/g, "from '@/features/characters/sheet/CharacterSheet'"],

  // API
  [/from ['"](?:\.\.?\/)+api\/client['"]/g, "from '@/features/characters/api'"],
  [/from ['"](?:\.\.?\/)+api\/auth['"]/g, "from '@/features/auth/api'"],
  [/from ['"](?:\.\.?\/)+api\/types(\/[^'"]*)?['"]/g, "from '@/features/characters/types$1'"],

  // Top-level src dirs
  [/from ['"](?:\.\.?\/)+i18n\/t['"]/g, "from '@/shared/i18n/t'"],
  [/from ['"](?:\.\.?\/)+hooks\/usePortalTheme['"]/g, "from '@/shared/hooks/usePortalTheme'"],
  [/from ['"](?:\.\.?\/)+prereqs(\/[^'"]*)?['"]/g, "from '@/features/characters/internal/prereqs$1'"],
  [/from ['"](?:\.\.?\/)+lib\/([^'"]+)['"]/g, "from '@/_quarantine/lib/$1'"],

  // ------------- Sibling imports within OLD src/components/ -------------
  // (importers were components/X/Y.tsx, importing components/Z/W with `'../Z/W'`)
  [/from ['"](?:\.\.?\/)+common\/([^'"]+)['"]/g, "from '@/shared/ui/$1'"],
  [/from ['"](?:\.\.?\/)+picker\/([^'"]+)['"]/g, "from '@/_quarantine/picker/$1'"],
  [/from ['"](?:\.\.?\/)+picker['"]/g, "from '@/_quarantine/picker'"],
  [/from ['"](?:\.\.?\/)+dialog\/([^'"]+)['"]/g, "from '@/_quarantine/dialog/$1'"],
  [/from ['"](?:\.\.?\/)+chat\/([^'"]+)['"]/g, "from '@/features/characters/sheet/chat/$1'"],
  [/from ['"](?:\.\.?\/)+shop\/([^'"]+)['"]/g, "from '@/features/characters/sheet/shop/$1'"],
  [/from ['"](?:\.\.?\/)+settings\/SettingsDialog['"]/g, "from '@/features/characters/sheet/SettingsDialog'"],
  // Be careful with sheet/, creator/, tabs/ — these names also appear as legitimate
  // segments in NEW paths (@/features/characters/sheet/...), but the pattern requires
  // a leading ./ or ../, which only matches relative imports — alias imports start with @.
  [/from ['"](?:\.\.?\/)+sheet\/([^'"]+)['"]/g, "from '@/features/characters/sheet/$1'"],
  [/from ['"](?:\.\.?\/)+creator\/([^'"]+)['"]/g, "from '@/features/characters/creator/$1'"],
  [/from ['"](?:\.\.?\/)+tabs\/character\/([^'"]+)['"]/g, "from '@/features/characters/sheet/tabs/character/$1'"],
  [/from ['"](?:\.\.?\/)+tabs\/inventory\/([^'"]+)['"]/g, "from '@/features/characters/sheet/tabs/inventory/$1'"],
  [/from ['"](?:\.\.?\/)+tabs\/([^'"]+)['"]/g, "from '@/features/characters/sheet/tabs/$1'"],

  // ------------- Sibling imports within OLD src/api/ -------------
  // auth.ts → './client' was sibling api/client.ts
  [/from ['"]\.\/client['"]/g, "from '@/features/characters/api'"],

  // ------------- Self-references inside the moved CharacterCreator.tsx -------------
  // CharacterCreator.tsx had `'./CharacterCreator/X'` referencing its own subdir.
  [/from ['"]\.\/CharacterCreator\/([^'"]+)['"]/g, "from '@/features/characters/creator/$1'"],

  // ------------- Test fixtures (still at src/fixtures/) -------------
  [/from ['"](?:\.\.?\/)+fixtures\/([^'"]+)['"]/g, "from '@/fixtures/$1'"],

  // CSS imports in main.tsx style
  [/import ['"]\.\/styles\/index\.css['"]/g, "import '@/shared/styles/index.css'"],
  [/import ['"](?:\.\.?\/)+styles\/index\.css['"]/g, "import '@/shared/styles/index.css'"],

  // App import in main.tsx
  [/from ['"]\.\/App['"]/g, "from '@/app/App'"],
];

const root = path.resolve('src');
let totalChanges = 0;
let filesChanged = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      processFile(full);
    }
  }
}

function processFile(file) {
  const original = readFileSync(file, 'utf8');
  let updated = original;
  let fileChanges = 0;
  for (const [pattern, replacement] of mappings) {
    const before = updated;
    updated = updated.replace(pattern, replacement);
    if (before !== updated) {
      const matches = before.match(pattern);
      if (matches) fileChanges += matches.length;
    }
  }
  if (updated !== original) {
    writeFileSync(file, updated, 'utf8');
    filesChanged++;
    totalChanges += fileChanges;
    console.log(`  ${path.relative(root, file)} (${fileChanges} change${fileChanges === 1 ? '' : 's'})`);
  }
}

console.log('Rewriting imports under src/...');
walk(root);
console.log(`\n${filesChanged} file${filesChanged === 1 ? '' : 's'} updated, ${totalChanges} total replacements.`);
