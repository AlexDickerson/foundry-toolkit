import { ipcMain, shell, dialog } from 'electron';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import type { DmToolConfig } from '../config.js';
import { listGlobePins, upsertGlobePin, deleteGlobePin, setMissionMarkdown } from '@foundry-toolkit/db/pf2e';
import type { GlobePin, MissionData } from '@foundry-toolkit/shared/types';
import { missionNoteTemplate, parseMissionNote } from '../mission-parser.js';
import { findNoteByPinId, safeFileName, stampPinId } from '../mission-notes.js';
import { pushToFoundryMcp } from '../sidecar-client.js';

export function registerGlobeHandlers(cfg: DmToolConfig, _getMainWindow: () => Electron.BrowserWindow | null): void {
  async function pushSnapshot(): Promise<void> {
    const payload = await buildExportPayload();
    await pushToFoundryMcp(
      cfg,
      '/api/live/globe',
      { pins: payload.pins, updatedAt: new Date().toISOString() },
      'globe',
    );
  }

  /** Collect every pin and, for mission pins with an Obsidian vault
   *  configured, inline the parsed MissionData (minus dmNotes — players
   *  don't get to see those). Shared by the live-sync push and manual export. */
  async function buildExportPayload(): Promise<{ exportedAt: string; pins: GlobePin[] }> {
    const pins = listGlobePins();
    const exportPins = await Promise.all(
      pins.map(async (pin): Promise<GlobePin> => {
        // Strip `note` — the player-map never opens Obsidian files, and the
        // vault-relative path leaks DM filesystem structure. Replaced with
        // an empty string to satisfy the shared type.
        const out: GlobePin = {
          id: pin.id,
          lng: pin.lng,
          lat: pin.lat,
          label: pin.label,
          icon: pin.icon,
          iconColor: pin.iconColor,
          zoom: pin.zoom,
          note: '',
          kind: pin.kind,
        };

        if (pin.kind === 'mission' && cfg.obsidianVaultPath) {
          let filePath: string | null = null;
          if (pin.note) {
            const cached = join(cfg.obsidianVaultPath, pin.note);
            if (existsSync(cached)) filePath = cached;
          }
          if (!filePath) {
            const notesDir = join(cfg.obsidianVaultPath, 'Golarion');
            filePath = findNoteByPinId(notesDir, pin.id);
          }
          if (filePath) {
            try {
              const raw = await readFile(filePath, 'utf-8');
              // Mirror the markdown into the DB so the pin row is self-
              // contained — useful for backups and for any future portal
              // feature that wants the raw text without going through
              // the DM's Obsidian vault.
              setMissionMarkdown(pin.id, raw);
              const mission = parseMissionNote(raw, pin.label || 'Mission');
              const { dmNotes: _dmNotes, ...playerSafe } = mission;
              out.mission = playerSafe as MissionData;
            } catch {
              /* note unreadable — skip mission data */
            }
          }
        }

        return out;
      }),
    );
    return { exportedAt: new Date().toISOString(), pins: exportPins };
  }

  ipcMain.handle('globePinsList', () => listGlobePins());

  ipcMain.handle('globePinsUpsert', async (_e, pin: GlobePin) => {
    upsertGlobePin(pin);
    await pushSnapshot();
  });

  ipcMain.handle('globePinsDelete', async (_e, id: string) => {
    deleteGlobePin(id);
    await pushSnapshot();
  });

  ipcMain.handle('globePinOpenNote', async (_e, pin: GlobePin): Promise<boolean> => {
    if (!cfg.obsidianVaultPath) return false;

    const notesDir = join(cfg.obsidianVaultPath, 'Golarion');
    if (!existsSync(notesDir)) await mkdir(notesDir, { recursive: true });

    let filePath: string | null = null;

    // 1. Check cached path
    if (pin.note) {
      const cached = join(cfg.obsidianVaultPath, pin.note);
      if (existsSync(cached)) filePath = cached;
    }

    // 2. Cache miss (file renamed/moved) — scan by frontmatter pin-id
    if (!filePath) {
      filePath = findNoteByPinId(notesDir, pin.id);
      if (filePath) {
        // Update the cache
        pin.note = relative(cfg.obsidianVaultPath, filePath).replace(/\\/g, '/');
        upsertGlobePin(pin);
      }
    }

    // 3. No note exists yet — create one
    if (!filePath) {
      const label = pin.label || (pin.kind === 'mission' ? 'New Mission' : 'Untitled Pin');
      const fileName = `${safeFileName(label)} ${pin.id.slice(0, 8)}.md`;
      filePath = join(notesDir, fileName);

      const content =
        pin.kind === 'mission'
          ? missionNoteTemplate(pin.id, label, pin.lat, pin.lng)
          : [
              '---',
              `pin-id: ${pin.id}`,
              'kind: note',
              '---',
              '',
              `# ${label}`,
              '',
              `Coordinates: ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`,
              '',
            ].join('\n');
      await writeFile(filePath, content, 'utf-8');

      pin.note = `Golarion/${fileName}`;
      upsertGlobePin(pin);
    }

    const uri = `obsidian://open?path=${encodeURIComponent(filePath)}`;
    await shell.openExternal(uri);
    return true;
  });

  /** Load and parse a mission pin's Obsidian note into structured MissionData.
   *  Creates the note from a template if it doesn't exist yet. */
  ipcMain.handle('globePinGetMission', async (_e, pin: GlobePin): Promise<MissionData | null> => {
    if (!cfg.obsidianVaultPath) return null;

    const notesDir = join(cfg.obsidianVaultPath, 'Golarion');
    if (!existsSync(notesDir)) await mkdir(notesDir, { recursive: true });

    let filePath: string | null = null;

    if (pin.note) {
      const cached = join(cfg.obsidianVaultPath, pin.note);
      if (existsSync(cached)) filePath = cached;
    }

    if (!filePath) {
      filePath = findNoteByPinId(notesDir, pin.id);
      if (filePath) {
        pin.note = relative(cfg.obsidianVaultPath, filePath).replace(/\\/g, '/');
        upsertGlobePin(pin);
      }
    }

    if (!filePath) {
      const label = pin.label || 'New Mission';
      const fileName = `${safeFileName(label)} ${pin.id.slice(0, 8)}.md`;
      filePath = join(notesDir, fileName);
      await writeFile(filePath, missionNoteTemplate(pin.id, label, pin.lat, pin.lng), 'utf-8');
      pin.note = `Golarion/${fileName}`;
      upsertGlobePin(pin);
    }

    const raw = await readFile(filePath, 'utf-8');
    return parseMissionNote(raw, pin.label || 'Mission');
  });

  /** Associate a pin with an existing Obsidian note chosen via file picker. */
  ipcMain.handle('globePinLinkNote', async (_e, pin: GlobePin): Promise<GlobePin | null> => {
    if (!cfg.obsidianVaultPath) return null;

    const result = await dialog.showOpenDialog({
      title: `Link note to "${pin.label || 'pin'}"`,
      defaultPath: cfg.obsidianVaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];

    const rel = relative(cfg.obsidianVaultPath, filePath);
    if (!rel || rel.startsWith('..')) return null;

    const raw = await readFile(filePath, 'utf-8');
    const stamped = stampPinId(raw, pin.id, pin.kind);
    if (stamped !== raw) {
      await writeFile(filePath, stamped, 'utf-8');
    }

    pin.note = rel.replace(/\\/g, '/');
    upsertGlobePin(pin);
    await pushSnapshot();
    return pin;
  });

  /** Export all pins (with parsed mission data) to a JSON file chosen by the user. */
  ipcMain.handle('globeExportPlayerData', async (): Promise<boolean> => {
    const payload = await buildExportPayload();

    const result = await dialog.showSaveDialog({
      title: 'Export Player Map Data',
      defaultPath: 'data.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;

    await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  });
}
