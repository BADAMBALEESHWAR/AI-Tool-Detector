import Store from 'electron-store';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { saveSyncedCatalog } from './catalogStore';
import { API_BASE, SOCKET_URL } from './config';
import type { CatalogTool } from './detection/catalog';
import { logger } from './logger';
import { refreshAccessToken } from './reporter';

const SYNC_INTERVAL_MS = 3 * 60 * 1000;

let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncSocket: Socket | null = null;

function applySettings(store: Store<any>, settings: Record<string, unknown> | undefined): void {
  if (!settings) return;
  const flag = (v: unknown) => String(v).toLowerCase() !== 'false';
  if (settings.monitoring_enabled !== undefined) store.set('monitoringEnabled', flag(settings.monitoring_enabled));
  if (settings.auto_track_ai_tools !== undefined) store.set('autoTrackEnabled', flag(settings.auto_track_ai_tools));
  if (settings.auto_flag_unknown_tools !== undefined) store.set('autoFlagUnknownTools', flag(settings.auto_flag_unknown_tools));
}

/** Pulls the admin-managed AI catalog and monitoring settings from the backend. */
async function syncNow(store: Store<any>): Promise<void> {
  const get = (token?: string) =>
    axios.get(`${API_BASE}/tools?catalog=3`, { timeout: 10000, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try {
    let res;
    try {
      res = await get(store.get('accessToken') as string | undefined);
    } catch (err: any) {
      if (err.response?.status !== 401) throw err;
      res = await get((await refreshAccessToken(store)) || undefined);
    }
    applySettings(store, res.data?.settings);
    const tools = res.data?.tools as CatalogTool[] | undefined;
    if (Array.isArray(tools) && tools.length > 0) {
      saveSyncedCatalog(tools);
      logger.info(`Catalog synced: ${tools.length} AI tools`);
    }
  } catch (err: any) {
    logger.warn('Catalog sync failed (using last known catalog):', err.response?.data?.error || err.message);
  }
}

export function startToolSync(store: Store<any>): void {
  if (syncInterval) return;
  void syncNow(store);
  syncInterval = setInterval(() => void syncNow(store), SYNC_INTERVAL_MS);

  const token = store.get('accessToken') as string | undefined;
  if (!token) return;
  syncSocket = io(SOCKET_URL, { auth: { token, role: 'student' }, reconnection: true, reconnectionDelay: 2000 });
  syncSocket.on('tools:sync', () => void syncNow(store));
  syncSocket.on('tools:updated', () => void syncNow(store));
  syncSocket.on('settings:sync', (settings: Record<string, unknown>) => applySettings(store, settings));
}

export function stopToolSync(): void {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  syncSocket?.disconnect();
  syncSocket = null;
}
