import Store from 'electron-store';
import { execFile } from 'child_process';
import axios from 'axios';
import { logger } from './logger';
import { loadToolsDB, matchProcess, matchWindowTitle, matchHeuristicAITool, isBlacklistedSystemProcess, DiscoveredTool, ToolSignature } from './toolsDB';
import { refreshAccessToken } from './sync';

import { BrowserWindow, Notification, app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';

const API_BASE = 'https://api.tooldetect.in/api';

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isCycleRunning = false;

export interface ActiveToolDTO {
  sessionKey: string;
  toolId: string;
  toolName: string;
  browserName: string;
  rawIdentifier: string;
  startTime: string; // ISO string
  startTimeFormatted: string; // e.g. "10:30 PM"
  durationSeconds: number;
  durationFormatted: string; // e.g. "45 minutes" or "12m 34s"
  status: 'ACTIVE';
}

export interface RecentToolDTO {
  sessionKey: string;
  toolId: string;
  toolName: string;
  browserName: string;
  rawIdentifier: string;
  startTime: string; // ISO string
  startTimeFormatted: string; // e.g. "10:30 PM"
  endTime: string; // ISO string
  endTimeFormatted: string; // e.g. "11:15 PM"
  durationSeconds: number;
  durationFormatted: string; // e.g. "45 minutes"
  status: 'DEACTIVATED';
}

// Track active sessions: "toolId:browserName" -> session details
const activeSessions = new Map<string, {
  startTime: Date;
  lastDetectedAt: Date;
  lastReportedAt: Date;
  toolName: string;
  toolId: string;
  browserName: string;
  rawIdentifier: string;
  notified?: boolean;
}>();

// Track recently concluded sessions for Inactive / History view in desktop app UI
const recentInactiveSessions: RecentToolDTO[] = [];

export function clearRecentSessions(): void {
  recentInactiveSessions.length = 0;
}

const flaggedToolsCache = new Set<string>();

const CLOSE_GRACE_MS = 5000;          // 5s grace period: tool/tab must be confirmed absent for 5s before concluding session
const PERIODIC_REPORT_MINUTES = 2;   // Report ongoing session every 2 min
const FAST_POLL_INTERVAL_MS = 1000;  // 1s polling interval for instant real-time detection
export function formatLocalTime(dateInput: Date | string): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '12:00 PM';
  }
}

export function formatDurationHuman(seconds: number): string {
  if (seconds < 60) {
    return seconds <= 1 ? '1 second' : `${seconds} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (mins < 60) {
    if (remSecs === 0) {
      return `${mins} minute${mins === 1 ? '' : 's'}`;
    }
    return `${mins}m ${remSecs}s`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${remMins}m`;
}

export function notifyToolActivated(toolName: string, browserName: string): void {
  try {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'AI Tool Detected',
        body: `${toolName} is Active Now (${browserName})`,
        silent: false,
      });
      notif.show();
    }
    // Broadcast notification to all open windows for in-app toast
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send('tool-notification', {
          type: 'ACTIVE_NOW',
          toolName,
          browserName,
          time: formatLocalTime(new Date()),
        });
      }
    }
  } catch (err: any) {
    logger.warn('Failed to show system notification:', err?.message || err);
  }
}

export function getActiveToolsSnapshot(): { activeTools: ActiveToolDTO[]; recentTools: RecentToolDTO[] } {
  const now = Date.now();
  const active: ActiveToolDTO[] = Array.from(activeSessions.values()).map(s => {
    const durationSeconds = Math.max(1, Math.floor((now - s.startTime.getTime()) / 1000));
    return {
      sessionKey: `${s.toolId}:${s.browserName}`,
      toolId: s.toolId,
      toolName: s.toolName,
      browserName: s.browserName,
      rawIdentifier: s.rawIdentifier,
      startTime: s.startTime.toISOString(),
      startTimeFormatted: formatLocalTime(s.startTime),
      durationSeconds,
      durationFormatted: formatDurationHuman(durationSeconds),
      status: 'ACTIVE',
    };
  });

  return {
    activeTools: active,
    recentTools: [...recentInactiveSessions].reverse().slice(0, 30),
  };
}

export function broadcastActiveTools(): void {
  try {
    const snapshot = getActiveToolsSnapshot();
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send('active-tools-updated', snapshot);
      }
    }
  } catch {
    // Non-fatal
  }
}


interface WindowInfo {
  processName: string;
  title: string;
}

let activeWinFn: any = null;
let psListFn: any = null;

async function getActiveWindow() {
  try {
    if (!activeWinFn) {
      const activeWinModule = await import('active-win');
      activeWinFn = activeWinModule?.default || activeWinModule;
    }
    if (typeof activeWinFn === 'function') {
      return await activeWinFn();
    }
  } catch {
    // Non-fatal
  }
  return null;
}

async function getProcessesList(): Promise<any[]> {
  try {
    if (!psListFn) {
      const psListModule = await import('ps-list');
      psListFn = psListModule?.default || psListModule;
    }
    if (typeof psListFn === 'function') {
      return await psListFn();
    }
  } catch {
    // Non-fatal
  }
  return [];
}

// ── High-Speed Browser Tabs, Side Panels & Windows Scanner ─────────────────
interface ScannedItem {
  kind: 'BROWSER_WINDOW' | 'BROWSER_TAB' | 'BROWSER_SIDEPANEL' | 'APP_WINDOW';
  procName: string;
  name: string;
}

function getTabScannerPath(): string {
  const candidates = [
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', 'TabScanner.exe'),
    join(process.resourcesPath, 'bin', 'TabScanner.exe'),
    join(process.resourcesPath, 'resources', 'bin', 'TabScanner.exe'),
    join(app ? app.getAppPath() : process.cwd(), 'resources', 'bin', 'TabScanner.exe'),
    join(__dirname, '../../resources/bin/TabScanner.exe'),
    join(__dirname, '../../../resources/bin/TabScanner.exe'),
    'C:\\Projects\\Ai_tool_detector_COMPLETE\\Aitooldetector\\desktop-app\\resources\\bin\\TabScanner.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return '';
}

function getTabScannerPs1Path(): string {
  const candidates = [
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', 'TabScanner.ps1'),
    join(process.resourcesPath, 'bin', 'TabScanner.ps1'),
    join(process.resourcesPath, 'resources', 'bin', 'TabScanner.ps1'),
    join(app ? app.getAppPath() : process.cwd(), 'resources', 'bin', 'TabScanner.ps1'),
    join(__dirname, '../../resources/bin/TabScanner.ps1'),
    join(__dirname, '../../../resources/bin/TabScanner.ps1'),
    'C:\\Projects\\Ai_tool_detector_COMPLETE\\Aitooldetector\\desktop-app\\resources\\bin\\TabScanner.ps1',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return '';
}

function parseScannerOutput(stdout: string): ScannedItem[] {
  const items: ScannedItem[] = [];
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const [kind, procName, ...rest] = parts;
    const name = rest.join('|').trim();
    if (!name || isBlacklistedSystemProcess(name) || isBlacklistedSystemProcess(procName)) continue;

    if (
      kind === 'BROWSER_WINDOW' ||
      kind === 'BROWSER_TAB' ||
      kind === 'BROWSER_SIDEPANEL' ||
      kind === 'APP_WINDOW'
    ) {
      items.push({
        kind: kind as ScannedItem['kind'],
        procName: procName.trim(),
        name,
      });
    }
  }
  return items;
}

function runTabScanner(): Promise<ScannedItem[]> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);

    const exePath = getTabScannerPath();
    if (exePath) {
      execFile(
        exePath,
        [],
        { timeout: 3500, encoding: 'utf8', windowsHide: true },
        (err, stdout) => {
          if (!err && stdout) {
            return resolve(parseScannerOutput(stdout));
          }
          // If exe had error, try PS1 fallback
          runPs1Fallback(resolve);
        }
      );
    } else {
      runPs1Fallback(resolve);
    }
  });
}

function runPs1Fallback(resolve: (items: ScannedItem[]) => void) {
  const ps1Path = getTabScannerPs1Path();
  if (!ps1Path) return resolve([]);

  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path],
    { timeout: 5000, encoding: 'utf8', windowsHide: true },
    (err, stdout) => {
      if (err || !stdout) return resolve([]);
      resolve(parseScannerOutput(stdout));
    }
  );
}

// ── Detect browser name from process or window title ──────────────────────────
function detectBrowser(processName: string, title: string): string | null {
  const p = (processName || '').toLowerCase();
  const t = (title || '').toLowerCase().replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');

  if (p.includes('chrome') || t.includes('google chrome') || t.includes('chrome')) return 'Google Chrome';
  if (p.includes('msedge') || p.includes('edge') || t.includes('microsoft edge') || t.includes('edge')) return 'Microsoft Edge';
  if (p.includes('firefox') || t.includes('mozilla firefox') || t.includes('firefox')) return 'Mozilla Firefox';
  if (p.includes('brave') || t.includes('brave')) return 'Brave Browser';
  if (p.includes('opera') || t.includes('opera')) return 'Opera';
  if (p.includes('safari') || t.includes('safari')) return 'Safari';
  if (p.includes('arc') || t.includes('arc')) return 'Arc Browser';
  if (p.includes('vivaldi') || t.includes('vivaldi')) return 'Vivaldi';
  if (p.includes('zen') || t.includes('zen browser')) return 'Zen Browser';
  if (p.includes('floorp')) return 'Floorp Browser';
  if (p.includes('tor') || t.includes('tor browser')) return 'Tor Browser';
  if (p.includes('chromium') || t.includes('chromium')) return 'Chromium';
  if (p.includes('waterfox') || t.includes('waterfox')) return 'Waterfox';

  return null;
}

// ── Check if window title indicates a Browser Side Panel or Extension ─────────
function isSidePanelIndicator(title: string): boolean {
  const lower = (title || '').toLowerCase();
  return (
    lower.includes('side panel') ||
    lower.includes('sidepanel') ||
    lower.includes('sidebar') ||
    lower.includes('gemini in chrome') ||
    lower.includes('close gemini in chrome') ||
    lower.includes('side panel resize handle') ||
    lower.includes('initial greeting and support offer') ||
    lower.includes('show thinking') ||
    lower.includes('conversations - gemini') ||
    lower.includes('edge copilot') ||
    lower.includes('copilot sidebar') ||
    lower.includes('bing chat sidebar') ||
    lower.includes('brave leo') ||
    lower.includes('opera aria') ||
    lower.includes('sider') ||
    lower.includes('monica ai') ||
    lower.includes('harpa') ||
    lower.includes('chrome-extension') ||
    lower.includes('extension')
  );
}

// ── Auto-flag newly discovered unlisted AI tool to Admin ─────────────────────
async function flagUnknownTool(store: Store<any>, tool: DiscoveredTool, rawIdentifier: string): Promise<void> {
  const cacheKey = tool.pattern.toLowerCase();
  if (flaggedToolsCache.has(cacheKey)) return;
  flaggedToolsCache.add(cacheKey);

  let token = store.get('accessToken') as string | undefined;
  if (!token) {
    token = (await refreshAccessToken(store)) || undefined;
    if (!token) return;
  }

  const payload = {
    pattern: tool.pattern,
    suggestedName: tool.name,
    type: tool.type,
    rawIdentifier,
  };

  try {
    await axios.post(
      `${API_BASE}/tools/flag`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    logger.info(`[AUTO-DISCOVERY] New AI tool flagged to admin console: ${tool.name} (${tool.pattern})`);
  } catch (err: any) {
    if (err.response?.status === 401) {
      const newToken = await refreshAccessToken(store);
      if (newToken) {
        try {
          await axios.post(
            `${API_BASE}/tools/flag`,
            payload,
            { headers: { Authorization: `Bearer ${newToken}` }, timeout: 10000 }
          );
          logger.info(`[AUTO-DISCOVERY] New AI tool flagged to admin after token refresh: ${tool.name}`);
          return;
        } catch {
          // ignore
        }
      }
    }
    flaggedToolsCache.delete(cacheKey);
    logger.warn('Auto-flag tool warning:', err.response?.data || err.message);
  }
}

async function sendUsageEvent(
  store: Store<any>,
  toolName: string,
  toolId: string | undefined,
  source: 'DESKTOP_APP',
  startTime: Date,
  endTime: Date,
  rawIdentifier: string,
  browserName?: string
): Promise<void> {
  let token = store.get('accessToken') as string | undefined;
  const deviceId = store.get('deviceId') as string | undefined;
  if (!token || !deviceId) {
    token = (await refreshAccessToken(store)) || undefined;
    if (!token || !deviceId) {
      logger.warn('sendUsageEvent: missing token or deviceId — skipping');
      return;
    }
  }

  const durationSeconds = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
  const sessionKey = `${toolId || toolName}:${browserName || 'Desktop Application'}`;
  const payload = {
    deviceId,
    toolName,
    toolId: toolId || undefined,
    source,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationSeconds,
    rawIdentifier,
    browserName: browserName || 'Desktop Application',
    isUnknownTool: !toolId,
    sessionKey,
    eventType: 'DEACTIVATED',
  };

  try {
    await axios.post(
      `${API_BASE}/usage/event`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    logger.info(`Usage event (DEACTIVATED) sent: ${toolName} via ${browserName || 'Desktop'} (${durationSeconds}s)`);
  } catch (err: any) {
    if (err.response?.status === 401) {
      const newToken = await refreshAccessToken(store);
      if (newToken) {
        try {
          await axios.post(
            `${API_BASE}/usage/event`,
            payload,
            { headers: { Authorization: `Bearer ${newToken}` }, timeout: 10000 }
          );
          return;
        } catch {
          // ignore
        }
      }
    }
    logger.error('Failed to send usage event:', err.response?.data || err.message);
  }
}

async function sendLivePing(
  store: Store<any>,
  toolName: string,
  toolId: string | undefined,
  rawIdentifier: string,
  browserName?: string
): Promise<void> {
  let token = store.get('accessToken') as string | undefined;
  const deviceId = store.get('deviceId') as string | undefined;
  if (!token || !deviceId) {
    token = (await refreshAccessToken(store)) || undefined;
    if (!token || !deviceId) return;
  }

  const sessionKey = `${toolId || toolName}:${browserName || 'Desktop Application'}`;
  const payload = {
    deviceId,
    toolName,
    toolId: toolId || undefined,
    source: 'DESKTOP_APP',
    startTime: new Date().toISOString(),
    rawIdentifier,
    browserName: browserName || 'Desktop Application',
    isUnknownTool: !toolId,
    sessionKey,
    eventType: 'ACTIVE',
  };

  try {
    await axios.post(
      `${API_BASE}/usage/ping`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    logger.info(`Live ping sent: ${toolName} on ${browserName || 'Desktop'}`);
  } catch (err: any) {
    if (err.response?.status === 401) {
      const newToken = await refreshAccessToken(store);
      if (newToken) {
        try {
          await axios.post(
            `${API_BASE}/usage/ping`,
            payload,
            { headers: { Authorization: `Bearer ${newToken}` }, timeout: 10000 }
          );
          return;
        } catch {
          // ignore
        }
      }
    }
    logger.error('Failed to send ping:', err.response?.data || err.message);
  }
}

export function startMonitoring(store: Store<any>): void {
  if (isRunning) return;
  isRunning = true;
  logger.info(`High-speed auto-track monitoring started (${FAST_POLL_INTERVAL_MS}ms interval)`);

  // Restore persisted sessions history if available
  try {
    const savedSessions = store.get('recentSessions', []) as RecentToolDTO[];
    if (Array.isArray(savedSessions) && recentInactiveSessions.length === 0) {
      recentInactiveSessions.push(...savedSessions);
    }
  } catch {
    // Non-fatal
  }

  monitorInterval = setInterval(async () => {
    try {
      await runMonitorCycle(store);
    } catch (err: any) {
      logger.error('Monitor cycle error:', err.message);
    }
  }, FAST_POLL_INTERVAL_MS);
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  activeSessions.clear();
  isRunning = false;
  isCycleRunning = false;
  logger.info('Monitoring stopped');
}

async function runMonitorCycle(store: Store<any>): Promise<void> {
  if (isCycleRunning) return;
  isCycleRunning = true;

  try {
    // Check if monitoring is paused by administrator
    const autoTrackEnabled = store.get('autoTrackEnabled', true);
    const monitoringEnabled = store.get('monitoringEnabled', true);
    if (!autoTrackEnabled || !monitoringEnabled) {
      if (activeSessions.size > 0) {
        activeSessions.clear();
      }
      return;
    }

    // Read in-memory cached tools database (ultra-fast, 0ms)
    const toolsDB = loadToolsDB();
    const now = new Date();
    const detectedSessionKeys = new Set<string>();

    // ── 1. Active foreground window (instant capture when user opens tab/app) ───
    try {
      const activeWindow = await getActiveWindow();
      if (activeWindow?.title) {
        const ownerName = activeWindow.owner?.name || '';
        const browserDetected = detectBrowser(ownerName, activeWindow.title);
        const isBrowser = !!browserDetected ||
          ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'arc', 'vivaldi', 'safari'].some(b => ownerName.toLowerCase().includes(b));

        let match = null;
        if (isBrowser) {
          match = matchWindowTitle(toolsDB.tools, activeWindow.title, 'WEB');
        } else {
          match = matchProcess(toolsDB.tools, ownerName) || matchWindowTitle(toolsDB.tools, activeWindow.title, 'APP');
        }

        if (match) {
          const isDesktopApp = match.type === 'APP';
          const isSidePanel = isSidePanelIndicator(activeWindow.title);
          const baseBrowser = browserDetected || 'Google Chrome';
          const browser = isDesktopApp
            ? 'Desktop Application'
            : (isSidePanel ? `${baseBrowser} (Side Panel)` : baseBrowser);

          const sessionKey = `${match.id}:${browser}`;
          detectedSessionKeys.add(sessionKey);
          const rawId = `${activeWindow.title} (${ownerName})`;
          await handleDetection(store, match.id, match.name, rawId, now, browser);
        } else {
          // Auto-Discovery: Check for unlisted / emerging AI tool heuristics on BOTH browser and desktop apps
          const discovered = matchHeuristicAITool(activeWindow.title, ownerName);
          if (discovered) {
            const isDesktopApp = discovered.type === 'APP';
            const browser = isDesktopApp
              ? 'Desktop Application'
              : (browserDetected || 'Google Chrome');

            const sessionKey = `unknown_${discovered.name}:${browser}`;
            detectedSessionKeys.add(sessionKey);
            const rawId = `${activeWindow.title} [Auto-Discovered]`;

            // Flag to admin database asynchronously (enters Pending list)
            flagUnknownTool(store, discovered, activeWindow.title);
            await handleDetection(store, `unknown_${discovered.name}`, discovered.name, rawId, now, browser);
          }
        }
      }
    } catch {
      // Non-fatal
    }

    // ── 2. Process-based detection for verified Desktop AI Applications (~30-40ms) ─────
    try {
      const psList = await getProcessesList();
      if (Array.isArray(psList)) {
        for (const proc of psList) {
          const procName = proc.name || '';
          const match = matchProcess(toolsDB.tools, procName);
          if (match && match.type === 'APP') {
            const sessionKey = `${match.id}:Desktop Application`;
            detectedSessionKeys.add(sessionKey);
            await handleDetection(store, match.id, match.name, proc.name, now, 'Desktop Application');
          }
        }
      }
    } catch (err: any) {
      logger.warn('ps-list error:', err.message);
    }

    // ── 3. High-Speed Browser Tabs, Side Panels & Windows Scanner (~200ms) ─────
    try {
      const scannedItems = await runTabScanner();
      for (const item of scannedItems) {
        if (item.kind === 'BROWSER_TAB') {
          const browser = detectBrowser(item.procName, item.name) || 'Google Chrome';
          const match = matchWindowTitle(toolsDB.tools, item.name, 'WEB');
          if (match) {
            const sessionKey = `${match.id}:${browser}`;
            detectedSessionKeys.add(sessionKey);
            const rawId = `${item.name} (${browser})`;
            await handleDetection(store, match.id, match.name, rawId, now, browser);
          } else {
            const discovered = matchHeuristicAITool(item.name, item.procName);
            if (discovered) {
              const sessionKey = `unknown_${discovered.name}:${browser}`;
              detectedSessionKeys.add(sessionKey);
              const rawId = `${item.name} [Auto-Discovered Tab]`;
              flagUnknownTool(store, discovered, item.name);
              await handleDetection(store, `unknown_${discovered.name}`, discovered.name, rawId, now, browser);
            }
          }
        } else if (item.kind === 'BROWSER_SIDEPANEL') {
          const baseBrowser = detectBrowser(item.procName, '') || 'Google Chrome';
          const browser = `${baseBrowser} (Side Panel)`;
          // Filter out closed launcher buttons, search inputs, and shortcuts
          if (
            lowerName === 'ask gemini' ||
            lowerName === 'open gemini in chrome' ||
            lowerName.startsWith('open gemini') ||
            lowerName.includes('ask google') ||
            lowerName.includes('ask ai mode') ||
            lowerName.startsWith('open copilot')
          ) {
            continue;
          }

          // Check if it's Gemini (e.g. "Close Gemini in Chrome", "Gemini in Chrome", "Gemini Chrome :: New Conversation", "Conversation with Gemini")
          let match: ToolSignature | null = null;
          if (lowerName.includes('gemini')) {
            match = toolsDB.tools.find(t => t.id === 'gemini' || t.name.toLowerCase().includes('gemini')) || null;
          } else if (lowerName.includes('copilot')) {
            match = toolsDB.tools.find(t => t.id === 'copilot' || t.name.toLowerCase().includes('copilot')) || null;
          }
          if (!match) {
            match = matchWindowTitle(toolsDB.tools, item.name, 'WEB');
          }

          if (match) {
            const sessionKey = `${match.id}:${browser}`;
            detectedSessionKeys.add(sessionKey);
            const rawId = `${item.name} (${browser})`;
            await handleDetection(store, match.id, match.name, rawId, now, browser);
          }
        } else if (item.kind === 'BROWSER_WINDOW') {
          const browser = detectBrowser(item.procName, item.name) || 'Google Chrome';
          const isSidePanel = isSidePanelIndicator(item.name);
          const finalBrowser = isSidePanel ? `${browser} (Side Panel)` : browser;

          const match = matchWindowTitle(toolsDB.tools, item.name, 'WEB');
          if (match) {
            const sessionKey = `${match.id}:${finalBrowser}`;
            detectedSessionKeys.add(sessionKey);
            const rawId = `${item.name} (${finalBrowser})`;
            await handleDetection(store, match.id, match.name, rawId, now, finalBrowser);
          }
        } else if (item.kind === 'APP_WINDOW') {
          const match = matchProcess(toolsDB.tools, item.procName) || matchWindowTitle(toolsDB.tools, item.name, 'APP');
          if (match) {
            const sessionKey = `${match.id}:Desktop Application`;
            detectedSessionKeys.add(sessionKey);
            const rawId = `${item.name} (${item.procName})`;
            await handleDetection(store, match.id, match.name, rawId, now, 'Desktop Application');
          } else {
            const discovered = matchHeuristicAITool(item.name, item.procName);
            if (discovered && discovered.type === 'APP') {
              const sessionKey = `unknown_${discovered.name}:Desktop Application`;
              detectedSessionKeys.add(sessionKey);
              const rawId = `${item.name} [Auto-Discovered]`;
              flagUnknownTool(store, discovered, item.name);
              await handleDetection(store, `unknown_${discovered.name}`, discovered.name, rawId, now, 'Desktop Application');
            }
          }
        }
      }
    } catch (err: any) {
      logger.warn('TabScanner scan error:', err.message);
    }


    // ── 4. Keep-alive heartbeat ping for ongoing active sessions ───────────────────────────
    const PERIODIC_GAP_MS = PERIODIC_REPORT_MINUTES * 60 * 1000;
    for (const [sessionKey, session] of activeSessions.entries()) {
      if (detectedSessionKeys.has(sessionKey)) {
        const timeSinceLastReport = now.getTime() - session.lastReportedAt.getTime();
        if (timeSinceLastReport >= PERIODIC_GAP_MS) {
          // Re-affirm ACTIVE status to backend/admin without concluding or deactivating the session
          await sendLivePing(
            store,
            session.toolName,
            session.toolId.startsWith('unknown_') ? undefined : session.toolId,
            session.rawIdentifier,
            session.browserName
          );
          session.lastReportedAt = now;
        }
      }
    }

    // ── 5. Conclude sessions for tools no longer detected (Tab or App Closed) ──────────────
    for (const [sessionKey, session] of activeSessions.entries()) {
      if (!detectedSessionKeys.has(sessionKey)) {
        const timeSinceLastDetection = now.getTime() - session.lastDetectedAt.getTime();
        if (timeSinceLastDetection >= CLOSE_GRACE_MS) {
          const durationSeconds = Math.max(1, Math.floor((session.lastDetectedAt.getTime() - session.startTime.getTime()) / 1000));
          await sendUsageEvent(
            store,
            session.toolName,
            session.toolId.startsWith('unknown_') ? undefined : session.toolId,
            'DESKTOP_APP',
            session.startTime,
            session.lastDetectedAt,
            session.rawIdentifier,
            session.browserName
          );

          const deactivatedItem: RecentToolDTO = {
            sessionKey,
            toolId: session.toolId,
            toolName: session.toolName,
            browserName: session.browserName,
            rawIdentifier: session.rawIdentifier,
            startTime: session.startTime.toISOString(),
            startTimeFormatted: formatLocalTime(session.startTime),
            endTime: session.lastDetectedAt.toISOString(),
            endTimeFormatted: formatLocalTime(session.lastDetectedAt),
            durationSeconds,
            durationFormatted: formatDurationHuman(durationSeconds),
            status: 'DEACTIVATED',
          };

          recentInactiveSessions.push(deactivatedItem);
          if (recentInactiveSessions.length > 50) {
            recentInactiveSessions.shift();
          }

          // Persist recent deactivated sessions history to store
          try {
            store.set('recentSessions', recentInactiveSessions.slice(-40));
          } catch {
            // Non-fatal
          }

          // Broadcast deactivation notification to renderer for in-app alert
          try {
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
              if (!win.isDestroyed() && win.webContents) {
                win.webContents.send('tool-notification', {
                  type: 'DEACTIVATED',
                  toolName: session.toolName,
                  browserName: session.browserName,
                  durationFormatted: formatDurationHuman(durationSeconds),
                  time: formatLocalTime(session.lastDetectedAt),
                });
              }
            }
          } catch {
            // Non-fatal
          }

          activeSessions.delete(sessionKey);
          logger.info(`[STUDENT CLOSED TAB -> DEACTIVATED SENT TO ADMIN] ${session.toolName} on ${session.browserName} (${durationSeconds}s, ${formatDurationHuman(durationSeconds)})`);
        }
      }
    }

    // Broadcast live active tools to renderer UI every cycle
    broadcastActiveTools();
  } finally {
    isCycleRunning = false;
  }
}

async function handleDetection(
  store: Store<any>,
  toolId: string,
  toolName: string,
  rawIdentifier: string,
  now: Date,
  browserName: string
): Promise<void> {
  if (isBlacklistedSystemProcess(toolName) || isBlacklistedSystemProcess(rawIdentifier)) {
    return;
  }

  const sessionKey = `${toolId}:${browserName}`;
  if (activeSessions.has(sessionKey)) {
    // Existing active session: update last detected timestamp silently in background (no repeat notification)
    const session = activeSessions.get(sessionKey)!;
    session.lastDetectedAt = now;
    session.rawIdentifier = rawIdentifier;
  } else {
    // Brand new session started — mark Active Now and fire notification ONCE
    activeSessions.set(sessionKey, {
      startTime: now,
      lastDetectedAt: now,
      lastReportedAt: now,
      toolName,
      toolId,
      browserName,
      rawIdentifier,
      notified: true,
    });
    logger.info(`[STUDENT OPENED TAB -> ACTIVE SENT TO ADMIN] ${toolName} on ${browserName} (${rawIdentifier})`);

    // Fire single notification on activation (will NOT repeat while active)
    notifyToolActivated(toolName, browserName);

    broadcastActiveTools();
    await sendLivePing(
      store,
      toolName,
      toolId.startsWith('unknown_') ? undefined : toolId,
      rawIdentifier,
      browserName
    );
  }
}

