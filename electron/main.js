const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const iconv = require('iconv-lite');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL ||
    `file://${path.join(__dirname, '../public/index.html')}`;
  mainWindow.loadURL(startUrl);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('run-command', async (event, { command, args }) => {
  const isWindows = os.platform() === 'win32';
  
  const commandStr = `${command} ${args.map(arg => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`;
  console.log('Executing command:', commandStr);

  return new Promise((resolve) => {
    exec(commandStr, { encoding: 'binary' }, (error, stdout, stderr) => {
      const decode = (buffer) => {
        if (isWindows) {
          return iconv.decode(Buffer.from(buffer, 'binary'), 'cp949');
        }
        return Buffer.from(buffer, 'binary').toString('utf8');
      };
      
      const decodedStdout = decode(stdout);
      const decodedStderr = decode(stderr);

      if (error) {
        console.error(`exec error: ${error}`);
        resolve({ success: false, stderr: decodedStderr, stdout: decodedStdout });
        return;
      }
      resolve({ success: true, stdout: decodedStdout, stderr: decodedStderr });
    });
  });
});

ipcMain.handle('write-file', async (event, { filePath, content }) => {
  try {
    if (filePath.includes('..')) {
      throw new Error("Path traversal is not allowed.");
    }
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Failed to write file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-file', async (event, { filePath }) => {
  try {
    if (filePath.includes('..')) {
      throw new Error("Path traversal is not allowed.");
    }
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    console.error('Failed to read file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return { exists: true };
  } catch {
    return { exists: false };
  }
}); 