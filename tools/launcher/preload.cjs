'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  enumerate: () => ipcRenderer.invoke('enumerate'),
  launch: (worktreePath, script) => ipcRenderer.invoke('launch', worktreePath, script),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  openTerminal: (p) => ipcRenderer.invoke('open-terminal', p),
  deleteWorktree: (p, opts) => ipcRenderer.invoke('delete-worktree', p, opts),
});
