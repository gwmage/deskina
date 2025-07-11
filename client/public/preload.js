const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  runCommand: (params) => ipcRenderer.invoke('run-command', params),
  writeFile: (params) => ipcRenderer.invoke('writeFile', params),
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
  checkFileExists: (filePath) => ipcRenderer.invoke('checkFileExists', filePath),
}); 