import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverLogs: string[] = [];

// Locate llama-server.exe binary
function getLlamaServerPath(): string {
  // Check build directory first, fallback to Engine/bin
  const possiblePaths = [
    path.join(__dirname, '../../Engine/llama.cpp/build/bin/Release/llama-server.exe'),
    path.join(app.getAppPath(), 'Engine/llama.cpp/build/bin/Release/llama-server.exe'),
    path.join(__dirname, '../../Engine/bin/llama-server.exe'),
    path.join(app.getAppPath(), 'Engine/bin/llama-server.exe'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Default path fallback
  return path.join(app.getAppPath(), 'Engine/llama.cpp/build/bin/Release/llama-server.exe');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'AgenticAI Desktop',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure llama-server is killed when app exits
function killServerProcess() {
  if (serverProcess) {
    console.log('Terminating llama-server.exe process...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  killServerProcess();
});

app.on('window-all-closed', () => {
  killServerProcess();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('select-model-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select GGUF Model File',
    filters: [{ name: 'GGUF Models', extensions: ['gguf', 'bin'] }],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('start-server', async (_, modelPath: string, port = 8080) => {
  if (serverProcess) {
    return { success: false, message: 'Server is already running.' };
  }

  const exePath = getLlamaServerPath();
  if (!fs.existsSync(exePath)) {
    return {
      success: false,
      message: `llama-server.exe not found at path: ${exePath}`,
    };
  }

  if (!modelPath || !fs.existsSync(modelPath)) {
    return { success: false, message: 'Invalid or missing model file path.' };
  }

  try {
    serverLogs = [];
    const cwd = path.dirname(exePath);
    console.log(`Starting llama-server: ${exePath} -m ${modelPath} --port ${port}`);

    serverProcess = spawn(exePath, ['-m', modelPath, '--port', port.toString(), '--host', '127.0.0.1'], {
      cwd: cwd,
      env: { ...process.env },
    });

    serverProcess.stdout?.on('data', (data) => {
      const msg = data.toString();
      serverLogs.push(msg);
      mainWindow?.webContents.send('server-log', msg);
    });

    serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      serverLogs.push(msg);
      mainWindow?.webContents.send('server-log', msg);
    });

    serverProcess.on('exit', (code) => {
      console.log(`llama-server.exe exited with code ${code}`);
      serverProcess = null;
      mainWindow?.webContents.send('server-status-changed', { running: false, code });
    });

    return { success: true, port, host: '127.0.0.1' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to start server.' };
  }
});

ipcMain.handle('stop-server', async () => {
  if (!serverProcess) {
    return { success: false, message: 'Server is not running.' };
  }
  killServerProcess();
  return { success: true };
});

ipcMain.handle('get-server-status', async () => {
  return {
    running: serverProcess !== null,
    pid: serverProcess?.pid || null,
    executablePath: getLlamaServerPath(),
  };
});
