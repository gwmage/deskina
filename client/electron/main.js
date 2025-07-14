const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const { TextDecoder } = require('util');
const iconv = require('iconv-lite');
const os = require('os');

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
ipcMain.handle('run-command', async (event, { command, args, cwd }) => {
  const processedArgs = (args || []).map(arg => {
    // If arg contains spaces and is not already quoted, quote it.
    if (arg.includes(' ') && !/^".*"$/.test(arg) && !/^'.*'$/.test(arg)) {
      return `"${arg}"`;
    }
    return arg;
  });

  const fullCommand = `${command} ${processedArgs.join(' ')}`;
  
  let executionCwd = cwd || os.homedir();
  // On Windows, if cwd is a drive letter like "C:", normalize it to "C:\"
  if (process.platform === 'win32' && /^[a-zA-Z]:$/.test(executionCwd)) {
    executionCwd += '\\';
  }

  // Resolve ~ to the user's home directory
  if (executionCwd === '~') {
    executionCwd = os.homedir();
  }
  
  console.log(`[Main] Executing command in ${executionCwd}: ${fullCommand}`);

  return new Promise((resolve) => {
    const options = { 
      shell: true, 
      encoding: 'buffer',
      cwd: executionCwd,
    };
    exec(fullCommand, options, (error, stdout, stderr) => {
      const shellEncoding = getShellEncoding();
      let decodedStdout;
      let decodedStderr;

      if (shellEncoding === 'cp949') {
        decodedStdout = iconv.decode(stdout, shellEncoding);
        decodedStderr = iconv.decode(stderr, shellEncoding);
      } else {
        const decoder = new TextDecoder(shellEncoding);
        decodedStdout = decoder.decode(stdout);
        decodedStderr = decoder.decode(stderr);
      }

      if (error) {
        console.error(`[Main] exec error for command '${command}': ${error.message}`);
        console.error(`[Main] Full error object:`, error);
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

ipcMain.handle('get-home-dir', async () => {
  return os.homedir();
});

function getShellEncoding() {
  return process.platform === 'win32' ? 'cp949' : 'utf-8';
} 