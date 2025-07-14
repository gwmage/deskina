const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (params) => ipcRenderer.invoke('run-command', params),
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
  writeFile: (data) => ipcRenderer.invoke('writeFile', data),
  checkFileExists: (filePath) => ipcRenderer.invoke('checkFileExists', filePath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});

console.log('[Preload] window.electronAPI exposed.'); 