const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (options) => ipcRenderer.invoke('run-command', options),
  writeFile: (options) => ipcRenderer.invoke('write-file', options),
  readFile: (options) => ipcRenderer.invoke('read-file', options),
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
}); 