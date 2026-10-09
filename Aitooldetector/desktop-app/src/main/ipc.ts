import { IpcMain, BrowserWindow, app } from 'electron';
import Store from 'electron-store';
import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { logger } from './logger';
import { getActiveToolsSnapshot, clearRecentSessions } from './monitor';

const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001/api';

interface SignInResult {
  studentInfo: { sapId: string; name: string; branch: string };
  deviceId: string;
  deviceToken: string;
  tokens: { accessToken: string; refreshToken: string };
}

interface IPCCallbacks {
  onSignIn: (studentInfo: any, deviceId: string, deviceToken: string, tokens: any) => void;
  onSignOut: () => void;
}

export function setupIPC(ipcMain: IpcMain, store: Store<any>, callbacks: IPCCallbacks): void {

  // GET stored state for renderer
  ipcMain.handle('get-auth-state', () => {
    const isActivated = store.get('isActivated');
    const studentInfo = store.get('studentInfo');
    return { isActivated, studentInfo };
  });

  // SIGN IN
  ipcMain.handle('sign-in', async (_event, { sapId, password }: { sapId: string; password: string }) => {
    try {
      // 1. Authenticate with backend
      const signInRes = await axios.post(`${API_BASE}/auth/signin`, { sapId, password }, { timeout: 15000 });
      const { student, accessToken, refreshToken } = signInRes.data;

      // 2. Activate device
      const osType = (() => {
        switch (process.platform) {
          case 'win32': return 'WINDOWS';
          case 'darwin': return 'MACOS';
          case 'linux': return 'LINUX';
          default: return 'UNKNOWN';
        }
      })();

      const activateRes = await axios.post(
        `${API_BASE}/device/activate`,
        {
          hostname: os.hostname(),
          osType,
          appVersion: '1.0.0',
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
      );

      const { deviceId, deviceToken } = activateRes.data;

      // 3. Write token file for extension to read (Native Messaging alternative)
      const tokenData = {
        deviceToken,
        deviceId,
        studentId: student.id,
        sapId: student.sapId,
        studentName: student.name,
        accessToken,
        apiBase: API_BASE,
      };
      writeFileSync(
        join(app.getPath('userData'), 'token.json'),
        JSON.stringify(tokenData),
        'utf-8'
      );

      callbacks.onSignIn(
        { sapId: student.sapId, name: student.name, branch: student.branch },
        deviceId,
        deviceToken,
        { accessToken, refreshToken }
      );

      logger.info(`Signed in: ${sapId}, device: ${deviceId}`);
      return { success: true, student };
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Sign-in failed';
      logger.error('Sign-in IPC error:', message);
      return { success: false, error: message };
    }
  });

  // SIGN UP
  ipcMain.handle('sign-up', async (_event, data: {
    sapId: string; name: string; branch: string; email?: string; password: string;
  }) => {
    try {
      const res = await axios.post(`${API_BASE}/auth/signup`, data, { timeout: 15000 });
      return { success: true, student: res.data.student };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || 'Sign-up failed' };
    }
  });

  // SIGN OUT
  ipcMain.handle('sign-out', async () => {
    try {
      const token = store.get('accessToken') as string | undefined;
      const deviceId = store.get('deviceId') as string | undefined;
      if (token && deviceId) {
        await axios.post(
          `${API_BASE}/device/deactivate`,
          { deviceId },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
        ).catch(() => {});
      }
    } catch {
      // Non-fatal
    }
    callbacks.onSignOut();
    return { success: true };
  });

  // GET monitoring status
  ipcMain.handle('get-monitoring-status', () => {
    return {
      isMonitoring: store.get('isActivated') || false,
      studentInfo: store.get('studentInfo'),
      deviceId: store.get('deviceId'),
    };
  });

  // GET live active & recent tools snapshot
  ipcMain.handle('get-active-tools', () => {
    return getActiveToolsSnapshot();
  });

  // CLEAR recent session history
  ipcMain.handle('clear-session-history', () => {
    store.delete('recentSessions');
    clearRecentSessions();
    return { success: true };
  });

  // Window controls
  ipcMain.on('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on('hide-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (store.get('isActivated')) {
      win?.hide();
    } else {
      win?.close();
    }
  });
}


