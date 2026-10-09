import { logger } from '../utils/logger';
import { getIO } from './socket';

export interface ActiveSession {
  eventId: string;
  studentId: string;
  studentName: string;
  sapId: string;
  branch: string;
  toolName: string;
  toolId?: string;
  source: string;
  deviceHostname?: string;
  browserName?: string;
  startTime: string;
  lastPingAt: number;
  rawIdentifier?: string;
  isUnknownTool: boolean;
  eventType: 'ACTIVE';
  sessionKey: string;
}

const activeSessions = new Map<string, ActiveSession>();

// Periodically clean up stale sessions (no ping received for > 3.5 minutes)
const STALE_TIMEOUT_MS = 210000; // 3.5 minutes

export function upsertActiveSession(session: ActiveSession): ActiveSession {
  const existing = activeSessions.get(session.sessionKey);
  const updated: ActiveSession = {
    ...session,
    startTime: existing?.startTime || session.startTime,
    lastPingAt: Date.now(),
    eventType: 'ACTIVE',
  };
  activeSessions.set(session.sessionKey, updated);
  broadcastActiveSessions();
  return updated;
}

export function removeActiveSession(sessionKey: string): ActiveSession | null {
  const existing = activeSessions.get(sessionKey);
  if (existing) {
    activeSessions.delete(sessionKey);
    broadcastActiveSessions();
    return existing;
  }
  // Try removing by student + tool prefix if browser differs slightly
  for (const [key, s] of activeSessions.entries()) {
    if (key.startsWith(sessionKey) || sessionKey.startsWith(key)) {
      activeSessions.delete(key);
      broadcastActiveSessions();
      return s;
    }
  }
  return null;
}

export function getActiveSessions(): ActiveSession[] {
  // Prune any stale sessions on read
  const now = Date.now();
  let hasRemoved = false;
  for (const [key, session] of activeSessions.entries()) {
    if (now - session.lastPingAt > STALE_TIMEOUT_MS) {
      activeSessions.delete(key);
      hasRemoved = true;
      logger.info(`Pruned stale active session: ${session.sessionKey}`);
    }
  }
  if (hasRemoved) {
    broadcastActiveSessions();
  }
  return Array.from(activeSessions.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

export function broadcastActiveSessions(): void {
  const io = getIO();
  if (!io) return;
  const sessions = Array.from(activeSessions.values());
  io.to('admin-room').emit('active:sessions:sync', sessions);
}

// Background sweep every 60 seconds
setInterval(() => {
  getActiveSessions();
}, 60000);
