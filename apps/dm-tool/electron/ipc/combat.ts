// Encounter/combat-tracker CRUD. No sidecar push — encounters live DM-side
// only; players aren't meant to see the stat blocks or HP totals in here.

import { ipcMain } from 'electron';
import type {
  Encounter,
  LootItem,
  PartyMember,
  PlayerActorDetail,
  PushEncounterResult,
} from '@foundry-toolkit/shared/types';
import type { PreparedActor } from '@foundry-toolkit/shared/foundry-api';
import { generateEncounterLoot, type LootMonster } from '@foundry-toolkit/ai/loot';
import type { DmToolConfig } from '../config.js';
import { deleteEncounter, listEncounters, upsertEncounter } from '@foundry-toolkit/db/pf2e';
import { getPreparedCompendium } from '../compendium/singleton.js';
import { tryParseJson } from '../util.js';
import { pushEncounterActorsToFoundry } from '../encounter-push.js';
import { pcActorToDetail } from '../compendium/pc-actor.js';

export function registerCombatHandlers(cfg: DmToolConfig): void {
  ipcMain.handle('encountersList', (): Encounter[] => listEncounters());
  ipcMain.handle('encountersUpsert', (_e, enc: Encounter): void => upsertEncounter(enc));
  ipcMain.handle('encountersDelete', (_e, id: string): void => deleteEncounter(id));
  ipcMain.handle(
    'generateEncounterLoot',
    async (_e, args: { encounter: Encounter; partyLevel: number; apiKey: string }): Promise<LootItem[]> => {
      if (!args?.apiKey || args.apiKey.trim().length === 0) {
        throw new Error('Anthropic API key is not set. Add one in Settings.');
      }

      // Pull canonical stat rows via the prepared compendium (foundry-mcp)
      // for every monster in the encounter. Missing entries are skipped —
      // same behaviour as the old SQLite path. Fetches in parallel so a
      // large encounter doesn't serialise the network round-trips.
      const prepared = getPreparedCompendium();
      const rows = await Promise.all(
        args.encounter.combatants.map(async (c) => {
          if (c.kind !== 'monster' || !c.monsterName) return null;
          return prepared.getMonsterRowByName(c.monsterName);
        }),
      );
      const monsters: LootMonster[] = rows.flatMap((row) =>
        row
          ? [
              {
                name: row.name,
                level: row.level,
                traits: tryParseJson<string[]>(row.traits, []),
              },
            ]
          : [],
      );

      // buildLootShortlist pulls a random-80 level-range sample via
      // `api.searchCompendium({ minLevel, maxLevel, limit: 500 })` and
      // shuffles client-side. The prepared layer owns both the network
      // fetch and the shuffle — see electron/compendium/prepared.ts.
      const shortlist = await prepared.buildLootShortlist(args.partyLevel);

      return generateEncounterLoot({
        apiKey: args.apiKey,
        encounter: args.encounter,
        partyLevel: args.partyLevel,
        monsters,
        shortlist,
      });
    },
  );
  ipcMain.handle('pushEncounterToFoundry', async (_e, encounterId: string): Promise<PushEncounterResult> => {
    if (!cfg.foundryMcpUrl) {
      throw new Error('Foundry MCP URL is not configured. Set it in Settings → Paths.');
    }
    const enc = listEncounters().find((x) => x.id === encounterId);
    if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
    return pushEncounterActorsToFoundry(enc, cfg.foundryMcpUrl);
  });

  ipcMain.handle('listPartyMembers', async (): Promise<PartyMember[]> => {
    if (!cfg.foundryMcpUrl) {
      console.info('listPartyMembers: foundryMcpUrl not configured — returning empty list');
      return [];
    }
    const base = cfg.foundryMcpUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/actors/party`);
    if (!res.ok) {
      throw new Error(`Party fetch failed: HTTP ${res.status.toString()}`);
    }
    return res.json() as Promise<PartyMember[]>;
  });

  ipcMain.handle('getPlayerActorDetail', async (_e, actorId: string): Promise<PlayerActorDetail | null> => {
    if (!cfg.foundryMcpUrl) {
      console.info('getPlayerActorDetail: foundryMcpUrl not configured', { actorId });
      return null;
    }
    const base = cfg.foundryMcpUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/actors/${encodeURIComponent(actorId)}/prepared`);
    if (!res.ok) {
      console.warn('getPlayerActorDetail: fetch failed', { actorId, status: res.status });
      return null;
    }
    const actor = (await res.json()) as PreparedActor;
    return pcActorToDetail(actor);
  });
}
