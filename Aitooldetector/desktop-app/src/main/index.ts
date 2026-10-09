import { app, BrowserWindow, Tray, Menu, nativeImage, NativeImage, ipcMain, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import Store from 'electron-store';
import { startMonitoring, stopMonitoring } from './monitor';
import { startHeartbeat, stopHeartbeat } from './heartbeat';
import { startToolSync, stopToolSync } from './sync';
import { setupIPC } from './ipc';
import { logger } from './logger';

// Persist auth state and device info
const store = new Store<{
  accessToken?: string;
  refreshToken?: string;
  studentInfo?: { sapId: string; name: string; branch: string };
  deviceId?: string;
  deviceToken?: string;
  isActivated?: boolean;
}>();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isSignedIn = false;

function getAppIcon(): NativeImage {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const candidates = [
    join(__dirname, '../../resources', iconName),
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'resources', iconName),
    join(process.resourcesPath, iconName),
    join(app.getAppPath(), 'resources', iconName),
  ];

  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const icon = nativeImage.createFromPath(c);
        if (!icon.isEmpty()) {
          return icon;
        }
      } catch {
        // continue
      }
    }
  }

  // Fallback 16x16 valid solid icon so tray and taskbar never render blank
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA6SURBVDhPY/wPBAwUACZGBgYGRkYGBjA2kQZgYGBg/P//PwOymgEFmEYNGBiA8T8aGEYNGBhgGIwBAIlMCfH73rG4AAAAAElFTkSuQmCC',
      'base64'
    )
  );
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

function createWindow(): BrowserWindow {
  const icon = getAppIcon();
  const win = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 400,
    minHeight: 560,

    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: icon,
    resizable: true,
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  // Dev: load Vite dev server; Prod: load built HTML
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Hide to tray on close (don't quit)
  win.on('close', (e) => {
    if (isSignedIn) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon);
  tray.setToolTip('AI Monitor — Monitoring Active');

  const updateContextMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: isSignedIn ? '● Monitoring Active' : '○ Not Signed In',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open AI Monitor',
        click: () => {
          showMainWindow();
        },
      },
      {
        label: 'Sign Out',
        enabled: isSignedIn,
        click: () => {
          handleSignOut();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.exit(0);
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  updateContextMenu();

  tray.on('click', () => {
    showMainWindow();
  });

  tray.on('double-click', () => {
    showMainWindow();
  });

  return { updateContextMenu };
}

function handleSignOut() {
  stopMonitoring();
  stopHeartbeat();
  stopToolSync();
  store.delete('accessToken');
  store.delete('refreshToken');
  store.delete('studentInfo');
  store.delete('deviceId');
  store.delete('deviceToken');
  store.delete('isActivated');
  isSignedIn = false;
  mainWindow?.webContents.send('signed-out');
  mainWindow?.show();
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('edu.institution.aimonitor');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  mainWindow = createWindow();
  const { updateContextMenu } = createTray();

  // Setup IPC handlers
  setupIPC(ipcMain, store, {
    onSignIn: (studentInfo, deviceId, deviceToken, tokens) => {
      store.set('studentInfo', studentInfo);
      store.set('deviceId', deviceId);
      store.set('deviceToken', deviceToken);
      store.set('accessToken', tokens.accessToken);
      store.set('refreshToken', tokens.refreshToken);
      store.set('isActivated', true);
      isSignedIn = true;
      updateContextMenu();
      // Start background services
      startMonitoring(store);
      startHeartbeat(store);
      startToolSync(store);
      mainWindow?.webContents.send('monitoring-started');
    },
    onSignOut: handleSignOut,
  });

  // Auto-sign-in if tokens exist from previous session
  const existingToken = store.get('accessToken');
  const isActivated = store.get('isActivated');
  if (existingToken && isActivated) {
    isSignedIn = true;
    updateContextMenu();
    startMonitoring(store);
    startHeartbeat(store);
    startToolSync(store);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app running in tray on macOS and Windows
  if (!isSignedIn) app.quit();
});

// Auto-start on login (Windows)
if (process.platform === 'win32') {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: ['--autostart'],
  });
}

export { store };
