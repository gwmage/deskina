const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const { TextDecoder } = require('util');

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Main Process] Preload script path: ${preloadPath}`);

  // Create the browser window.
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Deskina Client', // Set the window title
    webPreferences: {
      nodeIntegration: false, // is default value after Electron v5
      contextIsolation: true, // protect against prototype pollution
      enableRemoteModule: false, // turn off remote
      preload: preloadPath, // use a preload script
    },
  });

  // Remove the application menu
  win.setMenu(null);

  // and load the index.html of the app.
  // win.loadFile("index.html");
  const startUrl = isDev
    ? 'http://localhost:3002'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  win.loadURL(startUrl);

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] Failed to load URL: ${validatedURL}. Error: ${errorCode}, ${errorDescription}`);
  });

  // Open the DevTools.
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// Handle the 'run-command' event from the renderer process
ipcMain.handle('run-command', async (event, params) => {
  // Robustly handle missing 'args'. If params.args is null or undefined, default to an empty array.
  const command = params.command;
  const args = params.args || [];

  console.log(`[Main] Received run-command: ${command}${args.length > 0 ? ' with args: ' + args.join(' ') : ''}`);

  return new Promise((resolve) => {
    // Use shell: true to better handle commands like 'dir' on Windows, which are shell built-ins.
    exec(`${command} ${args.join(' ')}`, { shell: true, encoding: 'buffer' }, (error, stdout, stderr) => {
      const outputDecoder = new TextDecoder('utf-8');
      const errorDecoder = new TextDecoder(getWindowsEncoding());

      const decodedStdout = outputDecoder.decode(stdout);
      const decodedStderr = errorDecoder.decode(stderr);

      if (error) {
        console.error(`[Main] exec error for command '${command}': ${error.message}`);
        resolve({
          success: false,
          stdout: decodedStdout,
          stderr: `EXEC ERROR: ${error.message}\n\nSTDERR:\n${decodedStderr}`,
        });
        return;
      }
      resolve({
        success: true,
        stdout: decodedStdout,
        stderr: decodedStderr,
      });
    });
  });
});

ipcMain.handle('readFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error(`[Main Process] Failed to read file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('writeFile', async (event, { filePath, content }) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    console.log(`[Main Process] Successfully wrote to file: ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error(`[Main Process] Failed to write to file: ${filePath}`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('checkFileExists', async (event, filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return { exists: true };
  } catch {
    return { exists: false };
  }
});

function getWindowsEncoding() {
  // This function is needed to avoid a bug in the TextDecoder constructor
  // when running on Windows. The default encoding for Windows is 'cp1252'.
  // We need to explicitly set it to 'utf-8' for TextDecoder to work correctly.
  // This is a workaround for a known issue in Electron.
  // See: https://github.com/electron/electron/issues/21407
  return 'utf-8';
} 