import Store from 'electron-store';
import axios from 'axios';
import { app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger';

const API_BASE = 'https://api.tooldetect.in/api';
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

export function startHeartbeat(store: Store<any>): void {
  if (heartbeatInterval) return;

  const sendHeartbeat = async () => {
    const token = store.get('accessToken') as string | undefined;
    const deviceId = store.get('deviceId') as string | undefined;
    if (!token || !deviceId) return;

    // Check extension status (simplified detection)
    const extensionStatus = await checkExtensionInstalled();

    try {
      await axios.post(
        `${API_BASE}/device/heartbeat`,
        { deviceId, extensionStatus },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
    } catch (err: any) {
      if (err.response?.status === 401) {
        logger.warn('Heartbeat: token expired, attempting refresh');
        await refreshToken(store);
      }
    }
  };

  // Send immediately, then on interval
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info('Heartbeat started');
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  logger.info('Heartbeat stopped');
}

async function checkExtensionInstalled(): Promise<boolean> {
  // Check for extension token file written by the extension via native messaging
  const tokenFile = join(app.getPath('userData'), 'extension-token.json');
  return existsSync(tokenFile);
}

async function refreshToken(store: Store<any>): Promise<void> {
  const refreshToken = store.get('refreshToken') as string | undefined;
  if (!refreshToken) return;
  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
    store.set('accessToken', res.data.accessToken);
    store.set('refreshToken', res.data.refreshToken);
  } catch {
    logger.error('Token refresh failed — signed out');
    store.delete('accessToken');
    store.delete('refreshToken');
  }
}
