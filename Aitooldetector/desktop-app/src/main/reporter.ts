import Store from 'electron-store';
import axios from 'axios';
import { API_BASE } from './config';
import { logger } from './logger';

export async function refreshAccessToken(store: Store<any>): Promise<string | null> {
  const refreshToken = store.get('refreshToken') as string | undefined;
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, { timeout: 8000 });
    if (res.data?.accessToken) {
      store.set('accessToken', res.data.accessToken);
      if (res.data.refreshToken) store.set('refreshToken', res.data.refreshToken);
      return res.data.accessToken;
    }
  } catch (err: any) {
    logger.warn('Token refresh failed:', err.response?.data || err.message);
  }
  return null;
}

/** POSTs as the signed-in student, refreshing the access token once on 401. */
export async function postAsStudent(store: Store<any>, path: string, payload: unknown): Promise<boolean> {
  let token = (store.get('accessToken') as string | undefined) || (await refreshAccessToken(store));
  if (!token) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await axios.post(`${API_BASE}${path}`, payload, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      return true;
    } catch (err: any) {
      if (err.response?.status === 401 && attempt === 0) {
        token = await refreshAccessToken(store);
        if (token) continue;
      }
      logger.warn(`POST ${path} failed:`, err.response?.data || err.message);
      return false;
    }
  }
  return false;
}

export interface SessionReport {
  toolId: string;
  toolName: string;
  surface: string;
  evidence: string;
  startTime: Date;
}

function basePayload(store: Store<any>, s: SessionReport) {
  return {
    deviceId: store.get('deviceId'),
    toolId: s.toolId,
    toolName: s.toolName,
    source: 'DESKTOP_APP',
    rawIdentifier: s.evidence,
    browserName: s.surface,
    isUnknownTool: false,
    sessionKey: `${s.toolId}:${s.surface}`,
  };
}

/** Session started or still running (shown live on the admin feed). */
export function reportActive(store: Store<any>, s: SessionReport): Promise<boolean> {
  return postAsStudent(store, '/usage/ping', { ...basePayload(store, s), startTime: s.startTime.toISOString(), eventType: 'ACTIVE' });
}

/** Session ended: stored as a usage event with its duration. */
export function reportEnded(store: Store<any>, s: SessionReport, endTime: Date): Promise<boolean> {
  const durationSeconds = Math.max(1, Math.round((endTime.getTime() - s.startTime.getTime()) / 1000));
  return postAsStudent(store, '/usage/event', {
    ...basePayload(store, s),
    startTime: s.startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationSeconds,
    eventType: 'DEACTIVATED',
  });
}

/** Suggests an uncatalogued AI tool to admins (pending review — never counted as usage). */
export function suggestTool(store: Store<any>, c: { name: string; pattern: string; type: 'WEB' | 'APP'; evidence: string }): Promise<boolean> {
  return postAsStudent(store, '/tools/flag', { pattern: c.pattern, suggestedName: c.name, type: c.type, rawIdentifier: c.evidence });
}
