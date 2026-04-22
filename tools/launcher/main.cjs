'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { readFile, rm } = require('node:fs/promises');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

// Start from the launcher's own directory; git finds the repo from there. This
// way the launcher resolves the full worktree list whether it's run from the
// main checkout or from any linked worktree.
const launcherDir = __dirname;

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

async function listWorktrees() {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
    cwd: launcherDir,
    windowsHide: true,
  });
  const out = [];
  let current = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) out.push(current);
      current = { path: line.slice('worktree '.length).trim() };
    } else if (!current) {
      continue;
    } else if (line.startsWith('branch ')) {
      current.branch = line
        .slice('branch '.length)
        .replace(/^refs\/heads\//, '')
        .trim();
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }
  if (current) out.push(current);
  return out.filter((w) => !w.bare);
}

async function enumerate() {
  let worktrees;
  try {
    worktrees = await listWorktrees();
  } catch (err) {
    return [{ name: 'error', path: launcherDir, isMain: false, apps: [], error: String(err) }];
  }
  const primaryPath = worktrees[0]?.path;
  const out = [];
  for (const wt of worktrees) {
    out.push({
      name: wt.branch || path.basename(wt.path),
      path: wt.path,
      isMain: wt.path === primaryPath,
      apps: await readDevScripts(wt.path),
    });
  }
  return out;
}

function spawnWindowsTerminal(cwd, commandAfter, title) {
  const args = ['-w', '0', 'nt', '-d', cwd];
  if (title) args.push('--title', title);
  if (commandAfter) args.push('cmd', '/k', commandAfter);
  // shell: false so Node/CreateProcess handles arg quoting. With shell: true,
  // spaces in title or cwd get split by cmd.exe and wt sees garbled flags.
  const child = spawn('wt', args, { detached: true, stdio: 'ignore', windowsHide: true });
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

async function forceRemoveWithFallback(worktreePath) {
  // git's own --force handles the common "dirty tree" case.
  let gitErr = '';
  try {
    await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: launcherDir,
      windowsHide: true,
    });
    return { ok: true };
  } catch (err) {
    gitErr = (err.stderr || err.message || '').toString().trim();
  }
  // Fallback for Windows: `git worktree remove` often bails with "Directory
  // not empty" when node_modules has locked handles or long paths it can't
  // clear. Nuke the directory ourselves with retries, then prune git's
  // admin files so the worktree registration goes away too.
  try {
    await rm(worktreePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (rmErr) {
    return {
      ok: false,
      error: `git worktree remove --force failed (${gitErr}); fs.rm also failed: ${rmErr.message}`,
    };
  }
  try {
    await execFileAsync('git', ['worktree', 'prune'], { cwd: launcherDir, windowsHide: true });
    return { ok: true };
  } catch (pruneErr) {
    const stderr = (pruneErr.stderr || pruneErr.message || '').toString().trim();
    return { ok: false, error: `Directory removed but 'git worktree prune' failed: ${stderr}` };
  }
}

async function deleteWorktree(worktreePath, { force = false } = {}) {
  // Resolve the main worktree up front so we can refuse to delete it even if
  // the caller lies. `git worktree list` returns the main checkout first.
  let primaryPath;
  try {
    const wts = await listWorktrees();
    primaryPath = wts[0]?.path;
  } catch (err) {
    return { ok: false, error: `Could not list worktrees: ${err.message || err}` };
  }
  if (!worktreePath || worktreePath === primaryPath) {
    return { ok: false, error: 'Refusing to delete the main worktree.' };
  }
  if (force) {
    return forceRemoveWithFallback(worktreePath);
  }
  try {
    await execFileAsync('git', ['worktree', 'remove', worktreePath], { cwd: launcherDir, windowsHide: true });
    return { ok: true };
  } catch (err) {
    const stderr = (err.stderr || err.message || '').toString().trim();
    // Any failure from the non-force attempt becomes a force-confirm prompt.
    // git bails on dirty trees ("use --force"), on Windows rmdir races
    // ("Directory not empty"), and various other states — all are safe to
    // retry with the force path, which handles the filesystem fallback.
    return { ok: false, needsForce: true, error: stderr || 'git worktree remove failed' };
  }
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
  ipcMain.handle('delete-worktree', (_e, p, opts) => deleteWorktree(p, opts));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
