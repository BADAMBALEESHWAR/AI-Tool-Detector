import Store from 'electron-store';
import { BrowserWindow, Notification } from 'electron';
import { getCatalog, getScannerRulesFile } from './catalogStore';
import { Detection, ScanSnapshot, detect, findCandidates } from './detection/engine';
import { logger } from './logger';
import { SessionReport, reportActive, reportEnded, suggestTool } from './reporter';
import { scanDeep, scanFast } from './scanner';

const FAST_INTERVAL_MS = 2500;        // windows, tabs and processes
const DEEP_INTERVAL_MS = 10_000;      // built-in AI panels (UI Automation, heavier)
const DEEP_RESULT_TTL_MS = 35_000;    // forget panel results if deep scans stop working
const CLOSE_GRACE_MS = 7000;          // a tool must be gone this long before its session ends
const PING_INTERVAL_MS = 2 * 60_000;  // re-confirm long sessions to the admin feed
const HISTORY_LIMIT = 40;

export interface ActiveToolDTO {
  sessionKey: string;
  toolId: string;
  toolName: string;
  kind: Detection['kind'];
  surface: string;
  evidence: string;
  startTime: string;
  durationSeconds: number;
}

export interface RecentToolDTO extends ActiveToolDTO {
  endTime: string;
}

interface Session extends SessionReport {
  key: string;
  kind: Detection['kind'];
  lastSeen: Date;
  lastPing: Date;
}

const sessions = new Map<string, Session>();
let history: RecentToolDTO[] = [];
const suggested = new Set<string>();

let fastTimer: ReturnType<typeof setInterval> | null = null;
let deepTimer: ReturnType<typeof setInterval> | null = null;
let fastBusy = false;
let deepBusy = false;
let lastMarkers: ScanSnapshot['markers'] = [];
let lastMarkersAt = 0;

let activeWinFn: (() => Promise<any>) | null = null;
let psListFn: (() => Promise<{ name: string }[]>) | null = null;

export function startMonitoring(store: Store<any>): void {
  if (fastTimer) return;
  history = (store.get('recentSessions', []) as RecentToolDTO[]).filter(h => h && h.kind);
  fastTimer = setInterval(() => void fastCycle(store), FAST_INTERVAL_MS);
  deepTimer = setInterval(() => void deepCycle(), DEEP_INTERVAL_MS);
  void deepCycle();
  logger.info(`Monitoring started (catalog v${getCatalog().version}, ${getCatalog().web.length} web, ${getCatalog().apps.size} app, ${getCatalog().markers.length} built-in rules)`);
}

export function stopMonitoring(): void {
  if (fastTimer) clearInterval(fastTimer);
  if (deepTimer) clearInterval(deepTimer);
  fastTimer = deepTimer = null;
  sessions.clear();
  lastMarkers = [];
  logger.info('Monitoring stopped');
}

export function clearRecentSessions(store?: Store<any>): void {
  history = [];
  store?.set('recentSessions', []);
}

export function getActiveToolsSnapshot(): { activeTools: ActiveToolDTO[]; recentTools: RecentToolDTO[] } {
  const now = Date.now();
  return {
    activeTools: Array.from(sessions.values()).map(s => toDTO(s, now)),
    recentTools: [...history].reverse(),
  };
}

async function deepCycle(): Promise<void> {
  if (deepBusy) return;
  deepBusy = true;
  try {
    lastMarkers = await scanDeep(getScannerRulesFile());
    lastMarkersAt = Date.now();
  } catch (err: any) {
    logger.warn('Deep scan failed:', err.message);
  } finally {
    deepBusy = false;
  }
}

async function fastCycle(store: Store<any>): Promise<void> {
  if (fastBusy) return;
  fastBusy = true;
  try {
    const now = new Date();
    if (store.get('monitoringEnabled', true) === false || store.get('autoTrackEnabled', true) === false) {
      await endAll(store, now);
      return;
    }

    const snapshot = await takeSnapshot();
    const catalog = getCatalog();

    const seen = new Set<string>();
    for (const d of detect(snapshot, catalog)) {
      seen.add(d.key);
      await onDetected(store, d, now);
    }

    for (const s of Array.from(sessions.values())) {
      if (seen.has(s.key)) {
        if (now.getTime() - s.lastPing.getTime() >= PING_INTERVAL_MS) {
          s.lastPing = now;
          void reportActive(store, s);
        }
      } else if (now.getTime() - s.lastSeen.getTime() >= CLOSE_GRACE_MS) {
        await endSession(store, s);
      }
    }

    if (store.get('autoFlagUnknownTools', true) !== false) {
      for (const c of findCandidates(snapshot, catalog)) {
        if (suggested.has(c.pattern)) continue;
        suggested.add(c.pattern);
        void suggestTool(store, c);
        logger.info(`Suggested uncatalogued tool for admin review: ${c.name} (${c.pattern})`);
      }
    }

    broadcast('active-tools-updated', getActiveToolsSnapshot());
  } catch (err: any) {
    logger.error('Monitor cycle failed:', err.message);
  } finally {
    fastBusy = false;
  }
}

async function takeSnapshot(): Promise<ScanSnapshot> {
  const [scan, processes, foreground] = await Promise.all([scanFast(), listProcesses(), foregroundWindow()]);
  const windows = foreground ? [...scan.windows, foreground] : scan.windows;
  const markers = Date.now() - lastMarkersAt <= DEEP_RESULT_TTL_MS ? lastMarkers : [];
  return { windows, tabs: scan.tabs, processes, markers };
}

async function onDetected(store: Store<any>, d: Detection, now: Date): Promise<void> {
  const existing = sessions.get(d.key);
  if (existing) {
    existing.lastSeen = now;
    existing.evidence = d.evidence;
    return;
  }
  const session: Session = { ...d, startTime: now, lastSeen: now, lastPing: now };
  sessions.set(d.key, session);
  logger.info(`AI tool active: ${d.toolName} on ${d.surface} (${d.evidence})`);
  notifyStudent(`${d.toolName} detected`, `Active on ${d.surface}`);
  broadcast('tool-notification', { type: 'ACTIVE_NOW', toolName: d.toolName, surface: d.surface, kind: d.kind });
  await reportActive(store, session);
}

async function endSession(store: Store<any>, s: Session): Promise<void> {
  sessions.delete(s.key);
  await reportEnded(store, s, s.lastSeen);
  const item: RecentToolDTO = { ...toDTO(s, s.lastSeen.getTime()), endTime: s.lastSeen.toISOString() };
  history.push(item);
  history = history.slice(-HISTORY_LIMIT);
  store.set('recentSessions', history);
  logger.info(`AI tool closed: ${s.toolName} on ${s.surface} after ${item.durationSeconds}s`);
  broadcast('tool-notification', { type: 'DEACTIVATED', toolName: s.toolName, surface: s.surface, kind: s.kind, durationSeconds: item.durationSeconds });
}

async function endAll(store: Store<any>, now: Date): Promise<void> {
  for (const s of Array.from(sessions.values())) {
    s.lastSeen = now;
    await endSession(store, s);
  }
}

function toDTO(s: Session, nowMs: number): ActiveToolDTO {
  return {
    sessionKey: s.key,
    toolId: s.toolId,
    toolName: s.toolName,
    kind: s.kind,
    surface: s.surface,
    evidence: s.evidence,
    startTime: s.startTime.toISOString(),
    durationSeconds: Math.max(1, Math.round((nowMs - s.startTime.getTime()) / 1000)),
  };
}

async function listProcesses(): Promise<string[]> {
  try {
    if (!psListFn) psListFn = (await import('ps-list')).default as any;
    return (await psListFn!()).map(p => p.name);
  } catch {
    return [];
  }
}

/** Foreground window — the only window source on macOS/Linux, a cheap extra on Windows. */
async function foregroundWindow(): Promise<{ process: string; title: string } | null> {
  try {
    if (!activeWinFn) activeWinFn = (await import('active-win')).default as any;
    const w = await activeWinFn!();
    if (!w?.title) return null;
    // owner.name is a display name ("Google Chrome"); the executable is what the catalog uses.
    const exe = String(w.owner?.path || w.owner?.name || '').split(/[\\/]/).pop() || '';
    return exe ? { process: exe.replace(/\.exe$/i, ''), title: w.title } : null;
  } catch {
    return null;
  }
}

function notifyStudent(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  } catch {
    // Notifications are a courtesy; detection does not depend on them.
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
