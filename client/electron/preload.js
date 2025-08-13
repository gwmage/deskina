const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script starting...');

contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (params) => ipcRenderer.invoke('run-command', params),
  readFile: (params) => ipcRenderer.invoke('readFile', params),
  editFile: (params) => ipcRenderer.invoke('editFile', params),
  runScript: (params) => ipcRenderer.invoke('run-script', params),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});

console.log('[Preload] window.electronAPI exposed.'); 