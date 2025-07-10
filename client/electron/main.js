const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Main Process] Preload script path: ${preloadPath}`);

  // Create the browser window.
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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
ipcMain.handle('run-command', async (event, { command, args }) => {
  return new Promise((resolve, reject) => {
    console.log(`[Main Process] Executing command: ${command} with args: ${args.join(' ')}`);

    const child = spawn(command, args, {
      shell: true, // Use shell to properly handle commands like 'npm' or 'code' on Windows
      encoding: 'utf8'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      console.log(`[Main Process] Command exited with code ${code}`);
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        // Even if there's an error, stdout might contain useful info
        resolve({ success: false, error: stderr, output: stdout });
      }
    });

    child.on('error', (err) => {
      console.error('[Main Process] Failed to start subprocess.', err);
      reject({ success: false, error: err.message });
    });
  });
}); 