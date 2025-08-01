const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (args) => ipcRenderer.invoke('run-command', args),
  readFile: (args) => ipcRenderer.invoke('readFile', args),
  editFile: (args) => ipcRenderer.invoke('editFile', args),
  createScript: (args) => ipcRenderer.invoke('createScript', args),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir')
});

console.log('[Preload] window.electronAPI exposed.'); 