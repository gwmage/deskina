const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { exec, execFile } = require('child_process'); // Import execFile
const { TextDecoder } = require('util');
const iconv = require('iconv-lite');
const os = require('os');
const http = require('http'); // For making API requests

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Main Process] Preload script path: ${preloadPath}`);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Deskina Client',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
    },
  });

  win.setMenu(null);

  const startUrl = isDev
    ? 'http://localhost:3002'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  win.loadURL(startUrl);

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] Failed to load URL: ${validatedURL}. Error: ${errorCode}, ${errorDescription}`);
  });

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

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

ipcMain.handle('run-command', async (event, { command, args, cwd }) => {
  const executionCwd = cwd || os.homedir();

  if (command.toLowerCase() === 'cd') {
    const targetPath = (args && args.length > 0) ? args.join(' ') : os.homedir();
    const newCwd = path.resolve(executionCwd, targetPath);

    return new Promise((resolve) => {
      fs.stat(newCwd, (err, stats) => {
        if (err || !stats.isDirectory()) {
          resolve({
            success: false,
            stderr: `Directory not found: ${newCwd}`,
            error: `cd: no such file or directory: ${targetPath}`
          });
        } else {
          resolve({
            success: true,
            stdout: `Directory changed to ${newCwd}`,
            newCwd: newCwd
          });
        }
      });
    });
  }

  const processedArgs = (args || []).map(arg => {
    if (arg.includes(' ') && !/^".*"$/.test(arg) && !/^'.*'$/.test(arg)) {
      return `"${arg}"`;
    }
    return arg;
  });

  const fullCommand = `${command} ${processedArgs.join(' ')}`;
  
  let effectiveCwd = cwd || os.homedir();
  if (process.platform === 'win32' && /^[a-zA-Z]:$/.test(effectiveCwd)) {
    effectiveCwd += '\\';
  }
  if (effectiveCwd === '~') {
    effectiveCwd = os.homedir();
  }
  
  console.log(`[Main] Executing command in ${effectiveCwd}: ${fullCommand}`);

  return new Promise((resolve) => {
    const options = { 
      shell: true, 
      encoding: 'buffer',
      cwd: effectiveCwd,
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

ipcMain.handle('readFile', async (event, { filePath, cwd }) => {
  // Resolve the absolute path from the cwd and the potentially relative filePath
  const absolutePath = path.resolve(cwd || os.homedir(), filePath);
  try {
    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('editFile', async (event, { filePath, newContent, cwd }) => {
  // Resolve the absolute path from the cwd and the potentially relative filePath
  const absolutePath = path.resolve(cwd || os.homedir(), filePath);
  try {
    await fs.promises.writeFile(absolutePath, newContent, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// This is a placeholder and will be replaced by the more robust run-script handler
ipcMain.handle('createScript', async (event, { scriptName, scriptContent }) => {
    console.log(`Placeholder for createScript: ${scriptName}`);
    return { success: true, stdout: `Script "${scriptName}" created.` };
});

ipcMain.handle('run-script', async (event, { name, token, cwd }) => {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/scripts/by-name/${name}/content`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  };

  try {
    const code = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Server responded with status code ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).content);
          } catch (e) {
            reject(new Error('Failed to parse server response.'));
          }
        });
      });
      req.on('error', (e) => reject(e));
      req.end();
    });

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `deskina_script_${Date.now()}.py`);
    await fs.promises.writeFile(tempFilePath, code, 'utf-8');

    return new Promise((resolve) => {
      execFile('python', [tempFilePath], { cwd: cwd || os.homedir() }, (error, stdout, stderr) => {
        fs.promises.unlink(tempFilePath); // Clean up the temp file
        if (error) {
          resolve({ success: false, stderr: `EXEC ERROR: ${error.message}\n\nSTDERR:\n${stderr}` });
          return;
        }
        resolve({ success: true, stdout, stderr });
      });
    });

  } catch (error) {
    return { success: false, error: `Failed to fetch or execute script: ${error.message}` };
  }
});


ipcMain.handle('get-home-dir', async () => {
  return os.homedir();
});

function getShellEncoding() {
  return process.platform === 'win32' ? 'cp949' : 'utf-8';
} 