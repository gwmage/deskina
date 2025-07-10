const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  /**
   * Executes a command in the main process.
   * @param {string} command The command to execute.
   * @param {string[]} args The arguments for the command.
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  runCommand: (command, args) => ipcRenderer.invoke('run-command', { command, args }),
});

console.log('[Preload] window.electron API exposed.'); 