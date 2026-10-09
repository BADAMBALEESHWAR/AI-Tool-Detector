import { contextBridge, ipcRenderer } from 'electron';

// Expose safe API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('get-auth-state'),
  signIn: (credentials: { sapId: string; password: string }) =>
    ipcRenderer.invoke('sign-in', credentials),
  signUp: (data: { sapId: string; name: string; branch: string; email?: string; password: string }) =>
    ipcRenderer.invoke('sign-up', data),
  signOut: () => ipcRenderer.invoke('sign-out'),
  getMonitoringStatus: () => ipcRenderer.invoke('get-monitoring-status'),
  getActiveTools: () => ipcRenderer.invoke('get-active-tools'),
  clearSessionHistory: () => ipcRenderer.invoke('clear-session-history'),
  onActiveToolsUpdated: (cb: (data: { activeTools: any[]; recentTools: any[] }) => void) => {
    const listener = (_: any, data: any) => cb(data);
    ipcRenderer.on('active-tools-updated', listener);
    return () => ipcRenderer.removeListener('active-tools-updated', listener);
  },
  onMonitoringStarted: (cb: () => void) => ipcRenderer.on('monitoring-started', cb),
  onSignedOut: (cb: () => void) => ipcRenderer.on('signed-out', cb),
  onToolNotification: (cb: (notif: { type: 'ACTIVE_NOW' | 'DEACTIVATED'; toolName: string; browserName: string; time?: string; durationFormatted?: string }) => void) => {
    const listener = (_: any, data: any) => cb(data);
    ipcRenderer.on('tool-notification', listener);
    return () => ipcRenderer.removeListener('tool-notification', listener);
  },
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
});

