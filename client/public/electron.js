const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  win.loadURL(
    isDev
      ? 'http://localhost:3002'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  if (isDev) {
    win.webContents.openDevTools();
  }
}

ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    // For simplicity, we capture the primary display.
    const primarySource = sources[0];
    const thumbnail = primarySource.thumbnail.toPNG();
    return thumbnail.toString('base64');
  } catch (error) {
    console.error('Error capturing screen:', error);
    return null;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 