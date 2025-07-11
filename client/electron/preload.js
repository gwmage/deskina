const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (params) => ipcRenderer.invoke('run-command', params),
  writeFile: (params) => ipcRenderer.invoke('writeFile', params),
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
  checkFileExists: (filePath) => ipcRenderer.invoke('checkFileExists', filePath),
});

console.log('[Preload] window.electronAPI exposed.'); 