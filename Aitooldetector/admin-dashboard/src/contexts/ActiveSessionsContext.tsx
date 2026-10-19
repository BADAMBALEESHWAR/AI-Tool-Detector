import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { acquireAdminSocket } from '../lib/socket';
import { useAdminAuth } from './AdminAuthContext';
import { api } from '../lib/api';

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
  lastPingAt?: number;
  rawIdentifier?: string;
  isUnknownTool?: boolean;
  eventType: 'ACTIVE';
  sessionKey: string;
}

interface ActiveSessionsContextType {
  activeSessions: ActiveSession[];
  liveCount: number;
  refreshActiveSessions: () => Promise<void>;
  isStudentActive: (sapId: string) => ActiveSession | undefined;
  getToolActiveCount: (toolName: string, toolId?: string) => number;
  getToolActiveSessions: (toolName: string, toolId?: string) => ActiveSession[];
}

const ActiveSessionsContext = createContext<ActiveSessionsContextType | null>(null);

export function ActiveSessionsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth();
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);

  const refreshActiveSessions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/admin/active-sessions');
      if (res.data?.activeSessions) {
        setActiveSessions(res.data.activeSessions);
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    refreshActiveSessions();
  }, [refreshActiveSessions]);

  // Global socket listener ensuring real-time sync across all dashboard views
  useEffect(() => {
    if (!token) return;
    const socket = acquireAdminSocket(token);

    socket.on('active:sessions:sync', (sessions: ActiveSession[]) => {
      setActiveSessions(sessions || []);
    });

    socket.on('usage:active', (data: any) => {
      const sessionKey = data.sessionKey || `${data.sapId}:${data.toolName}:${data.browserName || ''}`;
      const newSession: ActiveSession = {
        eventId: data.eventId,
        studentId: data.studentId,
        studentName: data.studentName,
        sapId: data.sapId,
        branch: data.branch,
        toolName: data.toolName,
        toolId: data.toolId,
        source: data.source,
        deviceHostname: data.deviceHostname,
        browserName: data.browserName,
        startTime: data.startTime,
        rawIdentifier: data.rawIdentifier,
        isUnknownTool: data.isUnknownTool,
        eventType: 'ACTIVE',
        sessionKey,
      };

      setActiveSessions(prev => {
        const idx = prev.findIndex(s => s.sessionKey === sessionKey || s.eventId === data.eventId);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = newSession;
          return copy;
        }
        return [newSession, ...prev];
      });
    });

    socket.on('usage:deactivated', (data: any) => {
      const sessionKey = data.sessionKey || `${data.sapId}:${data.toolName}:${data.browserName || ''}`;
      setActiveSessions(prev =>
        prev.filter(s => s.sessionKey !== sessionKey && s.eventId !== data.eventId)
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const isStudentActive = useCallback((sapId: string) => {
    return activeSessions.find(s => s.sapId === sapId);
  }, [activeSessions]);

  const getToolActiveSessions = useCallback((toolName: string, toolId?: string) => {
    const tName = toolName.toLowerCase();
    return activeSessions.filter(s => {
      if (toolId && s.toolId && s.toolId === toolId) return true;
      return s.toolName.toLowerCase() === tName;
    });
  }, [activeSessions]);

  const getToolActiveCount = useCallback((toolName: string, toolId?: string) => {
    return getToolActiveSessions(toolName, toolId).length;
  }, [getToolActiveSessions]);

  const liveCount = activeSessions.length;

  const value = useMemo(() => ({
    activeSessions,
    liveCount,
    refreshActiveSessions,
    isStudentActive,
    getToolActiveCount,
    getToolActiveSessions,
  }), [activeSessions, liveCount, refreshActiveSessions, isStudentActive, getToolActiveCount, getToolActiveSessions]);

  return (
    <ActiveSessionsContext.Provider value={value}>
      {children}
    </ActiveSessionsContext.Provider>
  );
}

export function useActiveSessions() {
  const ctx = useContext(ActiveSessionsContext);
  if (!ctx) throw new Error('useActiveSessions must be used within ActiveSessionsProvider');
  return ctx;
}
