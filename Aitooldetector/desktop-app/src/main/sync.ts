import Store from 'electron-store';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { logger } from './logger';
import { loadToolsDB, saveToolsDB, isInvalidOrBlacklistedTool } from './toolsDB';

const API_BASE = 'https://api.tooldetect.in/api';
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');

let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncSocket: Socket | null = null;
const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export async function refreshAccessToken(store: Store<any>): Promise<string | null> {
  const refreshToken = store.get('refreshToken') as string | undefined;
  if (!refreshToken) return null;

  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, { timeout: 8000 });
    if (res.data?.accessToken) {
      store.set('accessToken', res.data.accessToken);
      if (res.data.refreshToken) {
        store.set('refreshToken', res.data.refreshToken);
      }
      logger.info('Tool sync: access token refreshed successfully');
      return res.data.accessToken;
    }
  } catch (err: any) {
    logger.warn('Tool sync token refresh failed:', err.response?.data || err.message);
  }
  return null;
}

export function startToolSync(store: Store<any>): void {
  if (syncInterval) return;

  const doSync = async () => {
    let token = store.get('accessToken') as string | undefined;
    let headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let res;
      try {
        res = await axios.get(`${API_BASE}/tools`, {
          headers,
          timeout: 10000,
        });
      } catch (err: any) {
        // If 401 unauthorized and we have a refresh token, try refreshing and retry
        if (err.response?.status === 401 && store.get('refreshToken')) {
          const newToken = await refreshAccessToken(store);
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            res = await axios.get(`${API_BASE}/tools`, {
              headers,
              timeout: 10000,
            });
          } else {
            // Retry without auth header as public catalog fallback
            res = await axios.get(`${API_BASE}/tools`, { timeout: 10000 });
          }
        } else {
          // If auth failed or no token, try public fetch
          res = await axios.get(`${API_BASE}/tools`, { timeout: 10000 });
        }
      }

      if (!res || !res.data) return;
      const { tools, settings, syncedAt } = res.data;

      if (settings) {
        if (settings.auto_track_ai_tools !== undefined) {
          store.set('autoTrackEnabled', String(settings.auto_track_ai_tools).toLowerCase() !== 'false');
        }
        if (settings.monitoring_enabled !== undefined) {
          store.set('monitoringEnabled', String(settings.monitoring_enabled).toLowerCase() !== 'false');
        }
        if (settings.instant_detection_enabled !== undefined) {
          store.set('instantDetectionEnabled', String(settings.instant_detection_enabled).toLowerCase() !== 'false');
        }
        if (settings.auto_flag_unknown_tools !== undefined) {
          store.set('autoFlagUnknownTools', String(settings.auto_flag_unknown_tools).toLowerCase() !== 'false');
        }
      }

      if (!Array.isArray(tools)) return;

      const currentDB = loadToolsDB();

      // Build and sanitize tool signatures from backend API
      const mappedTools = tools
        .map((t: any) => {
          const keywords = Array.isArray(t.keywords) && t.keywords.length > 0 ? t.keywords : [t.name];
          const aliases = Array.isArray(t.aliases) ? t.aliases : [];
          const pattern = t.pattern || '';

          return {
            id: t.id,
            name: t.name,
            type: (t.type === 'APP' ? 'APP' : 'WEB') as 'WEB' | 'APP',
            domains: t.type === 'WEB' ? [pattern, ...aliases].filter(Boolean) : [],
            processNames: t.type === 'APP' ? [pattern, ...aliases].filter(Boolean) : [],
            windowTitleKeywords: Array.from(new Set([t.name, ...keywords, ...aliases])).filter(Boolean),
            description: t.description,
            status: t.status,
          };
        })
        .filter(t => !isInvalidOrBlacklistedTool(t));

      // Overwrite local sync cache with authoritative backend tools
      saveToolsDB({
        version: currentDB.version || '2.3.0',
        updatedAt: syncedAt || new Date().toISOString(),
        tools: mappedTools,
        heuristicPatterns: currentDB.heuristicPatterns || {
          domainKeywords: [],
          titleKeywords: [],
          processKeywords: [],
        },
      });

      logger.info(`Tool sync: successfully synced ${mappedTools.length} active AI tools from backend`);
    } catch (err: any) {
      logger.error('Tool sync failed:', err.response?.data?.error || err.message);
    }
  };

  // Immediate sync on startup
  doSync();
  syncInterval = setInterval(doSync, SYNC_INTERVAL_MS);

  // Setup real-time Socket.IO sync listener
  try {
    const token = store.get('accessToken') as string | undefined;
    if (token) {
      syncSocket = io(SOCKET_URL, {
        auth: { token, role: 'student' },
        reconnection: true,
        reconnectionDelay: 2000,
      });

      syncSocket.on('tools:sync', () => {
        logger.info('[Socket] Received tools:sync event — triggering immediate tool re-sync');
        doSync();
      });

      syncSocket.on('tools:updated', () => {
        logger.info('[Socket] Received tools:updated event — triggering immediate tool re-sync');
        doSync();
      });

      syncSocket.on('settings:sync', (settings: any) => {
        logger.info('[Socket] Received settings:sync event');
        if (settings) {
          if (settings.auto_track_ai_tools !== undefined) {
            store.set('autoTrackEnabled', String(settings.auto_track_ai_tools).toLowerCase() !== 'false');
          }
          if (settings.monitoring_enabled !== undefined) {
            store.set('monitoringEnabled', String(settings.monitoring_enabled).toLowerCase() !== 'false');
          }
        }
      });
    }
  } catch (err: any) {
    logger.warn('Socket.IO sync listener setup warning:', err.message);
  }

  logger.info('Tool sync service started');
}

export function stopToolSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (syncSocket) {
    syncSocket.disconnect();
    syncSocket = null;
  }
}

