'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const worktreesDir = path.join(repoRoot, '.claude', 'worktrees');

async function readDevScripts(rootPath) {
  try {
    const raw = await readFile(path.join(rootPath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    return Object.keys(pkg.scripts || {})
      .filter((s) => s.startsWith('dev:'))
      .sort()
      .map((s) => ({ script: s, label: s.slice(4) }));
  } catch {
    return [];
  }
}

async function enumerate() {
  const roots = [{ name: 'main', path: repoRoot, isMain: true }];
  try {
    const entries = await readdir(worktreesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        roots.push({ name: e.name, path: path.join(worktreesDir, e.name), isMain: false });
      }
    }
  } catch {
    /* worktrees dir may not exist */
  }
  const out = [];
  for (const root of roots) {
    out.push({ ...root, apps: await readDevScripts(root.path) });
  }
  return out;
}

function spawnWindowsTerminal(cwd, commandAfter, title) {
  const args = ['-w', '0', 'nt', '-d', cwd];
  if (title) args.push('--title', title);
  if (commandAfter) args.push('cmd', '/k', commandAfter);
  const child = spawn('wt', args, { detached: true, stdio: 'ignore', shell: true });
  child.on('error', (err) => console.error('wt spawn failed:', err));
  child.unref();
}

function launch(worktreePath, script) {
  const title = `${path.basename(worktreePath)} · ${script}`;
  spawnWindowsTerminal(worktreePath, `npm run ${script}`, title);
}

function openTerminal(worktreePath) {
  spawnWindowsTerminal(worktreePath, null, path.basename(worktreePath));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'foundry-toolkit launcher',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('enumerate', () => enumerate());
  ipcMain.handle('launch', (_e, wt, script) => launch(wt, script));
  ipcMain.handle('open-folder', (_e, p) => shell.openPath(p));
  ipcMain.handle('open-terminal', (_e, p) => openTerminal(p));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
