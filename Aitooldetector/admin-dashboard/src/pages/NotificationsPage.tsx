import { useEffect, useRef, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useActiveSessions } from '../contexts/ActiveSessionsContext';
import { api } from '../lib/api';
import {
  Bell, Clock, Cpu, Wifi, WifiOff, Trash2,
  BrainCircuit, AlertTriangle, Search, X, CheckCircle2,
  ArrowUpRight, Square, Users, Wrench, Activity
} from 'lucide-react';
import { format } from 'date-fns';

interface UsageNotification {
  eventId: string;
  studentId?: string;
  studentName: string;
  sapId: string;
  branch: string;
  toolName: string;
  toolId?: string;
  source: string;
  deviceHostname?: string;
  browserName?: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  rawIdentifier?: string;
  isUnknownTool: boolean;
  eventType?: 'ACTIVE' | 'DEACTIVATED';
  sessionKey?: string;
}

interface PendingToolNotification {
  toolId: string;
  suggestedName: string;
  pattern: string;
  reportCount: number;
  firstDetectedAt: string;
}

interface DeviceActivationNotification {
  studentName: string;
  sapId: string;
  osType: string;
  hostname: string;
  activatedAt: string;
}

type FeedItem =
  | { type: 'usage'; data: UsageNotification; id: string; ts: number }
  | { type: 'tool_pending'; data: PendingToolNotification; id: string; ts: number }
  | { type: 'device_activated'; data: DeviceActivationNotification; id: string; ts: number };

function fmtDur(secs?: number) {
  if (!secs || secs <= 0) return 'Just started';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getBrowserInfo(data: UsageNotification): {
  name: string;
  icon: string;
  badgeClass: string;
  isBrowser: boolean;
  isSidePanel?: boolean;
} {
  const browserName = (data.browserName || '').trim();
  const raw = (data.rawIdentifier || '').toLowerCase();
  const name = browserName.toLowerCase();
  const combined = name + ' ' + raw;
  const isSidePanel = combined.includes('side panel') || combined.includes('sidebar') || combined.includes('sidepanel') || combined.includes('ask gemini');

  if (browserName === 'Desktop Application' || (data.source === 'DESKTOP_APP' && !combined.includes('chrome') && !combined.includes('edge') && !combined.includes('firefox') && !combined.includes('brave') && !combined.includes('opera') && !combined.includes('safari') && !combined.includes('arc') && !combined.includes('vivaldi') && !combined.includes('browser'))) {
    return { name: 'Desktop Application', icon: '🖥️', badgeClass: 'bg-purple-500/15 border-purple-500/30 text-purple-300', isBrowser: false };
  }
  if (combined.includes('firefox')) {
    return { name: isSidePanel ? 'Mozilla Firefox (Side Panel)' : 'Mozilla Firefox', icon: '🦊', badgeClass: 'bg-orange-500/15 border-orange-500/30 text-orange-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('chrome')) {
    return { name: isSidePanel ? 'Google Chrome (Side Panel)' : 'Google Chrome', icon: '🌐', badgeClass: 'bg-blue-500/15 border-blue-500/30 text-blue-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('edge')) {
    return { name: isSidePanel ? 'Microsoft Edge (Side Panel)' : 'Microsoft Edge', icon: '🔷', badgeClass: 'bg-sky-500/15 border-sky-500/30 text-sky-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('brave')) {
    return { name: isSidePanel ? 'Brave Browser (Side Panel)' : 'Brave Browser', icon: '🦁', badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('opera')) {
    return { name: isSidePanel ? 'Opera (Side Panel)' : 'Opera', icon: '🔴', badgeClass: 'bg-red-500/15 border-red-500/30 text-red-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('safari')) {
    return { name: isSidePanel ? 'Safari (Side Panel)' : 'Safari', icon: '🧭', badgeClass: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('arc')) {
    return { name: isSidePanel ? 'Arc Browser (Side Panel)' : 'Arc Browser', icon: '🌈', badgeClass: 'bg-pink-500/15 border-pink-500/30 text-pink-300', isBrowser: true, isSidePanel };
  }
  if (combined.includes('vivaldi')) {
    return { name: isSidePanel ? 'Vivaldi (Side Panel)' : 'Vivaldi', icon: '🔴', badgeClass: 'bg-red-500/15 border-red-500/30 text-red-300', isBrowser: true, isSidePanel };
  }

  return { name: data.browserName || (isSidePanel ? 'Browser Side Panel' : 'Web Browser'), icon: isSidePanel ? '📱' : '🌐', badgeClass: 'bg-zinc-800 border-zinc-700 text-zinc-300', isBrowser: true, isSidePanel };
}

// Tool name → color accent
function getToolColor(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes('chatgpt') || n.includes('openai')) return 'from-emerald-600 to-teal-600';
  if (n.includes('claude') || n.includes('anthropic')) return 'from-orange-600 to-amber-600';
  if (n.includes('gemini') || n.includes('bard')) return 'from-blue-600 to-cyan-600';
  if (n.includes('copilot')) return 'from-sky-600 to-blue-600';
  if (n.includes('perplexity')) return 'from-violet-600 to-purple-600';
  if (n.includes('grok')) return 'from-gray-600 to-zinc-600';
  if (n.includes('deepseek')) return 'from-indigo-600 to-blue-700';
  if (n.includes('mistral')) return 'from-rose-600 to-pink-600';
  return 'from-violet-600 to-indigo-600';
}

export default function NotificationsPage() {
  const { token } = useAdminAuth();
  const { activeSessions, liveCount, refreshActiveSessions } = useActiveSessions();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [totalToday, setTotalToday] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrowser, setFilterBrowser] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'deactivated'>('all');
  const [viewMode, setViewMode] = useState<'stream' | 'tools' | 'students'>('stream');
  const [latestDetection, setLatestDetection] = useState<UsageNotification | null>(null);
  const [latestDeactivation, setLatestDeactivation] = useState<UsageNotification | null>(null);
  const [inspectModal, setInspectModal] = useState<UsageNotification | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Group active sessions by Tool
  const activeByTool = useMemo(() => {
    const map = new Map<string, typeof activeSessions>();
    for (const s of activeSessions) {
      const list = map.get(s.toolName) || [];
      list.push(s);
      map.set(s.toolName, list);
    }
    return Array.from(map.entries()).map(([toolName, sessions]) => ({
      toolName,
      sessions,
      count: sessions.length,
    }));
  }, [activeSessions]);

  // Group active sessions by Student
  const activeByStudent = useMemo(() => {
    const map = new Map<string, typeof activeSessions>();
    for (const s of activeSessions) {
      const list = map.get(s.sapId) || [];
      list.push(s);
      map.set(s.sapId, list);
    }
    return Array.from(map.entries()).map(([sapId, sessions]) => ({
      sapId,
      studentName: sessions[0]?.studentName || 'Student',
      branch: sessions[0]?.branch || '',
      sessions,
      count: sessions.length,
    }));
  }, [activeSessions]);

  // Pre-load recent events on mount
  useEffect(() => {
    if (!token) return;
    refreshActiveSessions();

    api.get('/admin/usage?limit=50').then(res => {
      if (res.data?.events) {
        const initialItems: FeedItem[] = res.data.events.map((ev: any) => ({
          type: 'usage',
          id: ev.id,
          ts: new Date(ev.startTime).getTime(),
          data: {
            eventId: ev.id,
            studentName: ev.student?.name || 'Student',
            sapId: ev.student?.sapId || '',
            branch: ev.student?.branch || '',
            toolName: ev.toolName,
            source: ev.source,
            deviceHostname: ev.device?.hostname,
            browserName: ev.browserName,
            startTime: ev.startTime,
            endTime: ev.endTime,
            durationSeconds: ev.durationSeconds,
            rawIdentifier: ev.rawIdentifier,
            isUnknownTool: ev.isUnknownTool,
            eventType: ev.eventType || (ev.endTime || ev.durationSeconds ? 'DEACTIVATED' : 'ACTIVE'),
            sessionKey: ev.sessionKey || `${ev.student?.sapId || ''}:${ev.toolName}:${ev.browserName || ''}`,
          },
        }));

        // Merge active sessions so they always appear at the top
        const activeFeedItems: FeedItem[] = activeSessions.map(act => ({
          type: 'usage',
          id: act.eventId,
          ts: new Date(act.startTime).getTime(),
          data: {
            ...act,
            eventType: 'ACTIVE',
          }
        }));

        const combined = [...activeFeedItems];
        for (const item of initialItems) {
          if (item.type === 'usage') {
            const k = item.data.sessionKey || `${item.data.sapId}:${item.data.toolName}:${item.data.browserName || ''}`;
            if (!combined.some(c => c.type === 'usage' && (c.data.sessionKey === k || c.data.eventId === item.data.eventId))) {
              combined.push(item);
            }
          } else {
            combined.push(item);
          }
        }

        setFeed(combined);
        setTotalToday(combined.length);
      }
    }).catch(() => {});
  }, [token, refreshActiveSessions]);

  // When activeSessions from context updates, ensure active sessions exist in feed
  useEffect(() => {
    if (activeSessions.length === 0) return;
    setFeed(prevFeed => {
      const copy = [...prevFeed];
      for (const act of activeSessions) {
        const k = act.sessionKey;
        const existingIdx = copy.findIndex(item =>
          item.type === 'usage' &&
          (item.data.sessionKey === k || item.data.eventId === act.eventId)
        );
        const activeItem: FeedItem = {
          type: 'usage',
          id: act.eventId,
          ts: new Date(act.startTime).getTime(),
          data: { ...act, eventType: 'ACTIVE' },
        };
        if (existingIdx !== -1) {
          copy[existingIdx] = activeItem;
        } else {
          copy.unshift(activeItem);
        }
      }
      return copy;
    });
  }, [activeSessions]);

  useEffect(() => {
    if (!token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
      auth: { token, role: 'admin' },
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const handleUsageNotification = (data: UsageNotification) => {
      const isDeactivated = data.eventType === 'DEACTIVATED' || (typeof data.durationSeconds === 'number' && data.durationSeconds > 0);
      const sessionKey = data.sessionKey || `${data.sapId}:${data.toolName}:${data.browserName || ''}`;

      setFeed(prevFeed => {
        const existingIdx = prevFeed.findIndex(item => {
          if (item.type !== 'usage') return false;
          const k = item.data.sessionKey || `${item.data.sapId}:${item.data.toolName}:${item.data.browserName || ''}`;
          return k === sessionKey || item.data.eventId === data.eventId;
        });

        const newItem: FeedItem = {
          type: 'usage',
          data: {
            ...data,
            sessionKey,
            eventType: isDeactivated ? 'DEACTIVATED' : 'ACTIVE',
          },
          id: data.eventId + '-' + Date.now(),
          ts: Date.now(),
        };

        if (existingIdx !== -1) {
          const copy = [...prevFeed];
          copy[existingIdx] = newItem;
          const [updated] = copy.splice(existingIdx, 1);
          return [updated, ...copy].slice(0, 500);
        } else {
          return [newItem, ...prevFeed].slice(0, 500);
        }
      });

      setTotalToday(t => t + 1);

      if (isDeactivated) {
        setLatestDeactivation(data);
        setLatestDetection(prev => {
          if (prev && (prev.sessionKey === sessionKey || (prev.sapId === data.sapId && prev.toolName === data.toolName))) {
            return null;
          }
          return prev;
        });
        setTimeout(() => setLatestDeactivation(null), 10000);
      } else {
        setLatestDetection(data);
        setLatestDeactivation(prev => {
          if (prev && (prev.sessionKey === sessionKey || (prev.sapId === data.sapId && prev.toolName === data.toolName))) {
            return null;
          }
          return prev;
        });
        setTimeout(() => setLatestDetection(null), 8000);
      }
    };

    socket.on('usage:new', handleUsageNotification);
    socket.on('usage:active', handleUsageNotification);
    socket.on('usage:deactivated', handleUsageNotification);

    socket.on('tool:pending', (data: PendingToolNotification) => {
      const item: FeedItem = { type: 'tool_pending', data, id: data.toolId + Date.now(), ts: Date.now() };
      setFeed(f => [item, ...f].slice(0, 500));
    });

    socket.on('device:activated', (data: DeviceActivationNotification) => {
      const item: FeedItem = { type: 'device_activated', data, id: data.hostname + Date.now(), ts: Date.now() };
      setFeed(f => [item, ...f].slice(0, 500));
    });

    return () => { socket.disconnect(); };
  }, [token]);

  // Filter feed
  const filteredFeed = feed.filter(item => {
    if (item.type !== 'usage') return filterBrowser === 'all' && filterStatus === 'all';
    const d = item.data;
    const isLive = d.eventType === 'ACTIVE' || (!d.durationSeconds && !d.endTime);

    if (filterStatus === 'active' && !isLive) return false;
    if (filterStatus === 'deactivated' && isLive) return false;

    const browser = getBrowserInfo(d);
    if (filterBrowser !== 'all') {
      if (filterBrowser === 'firefox' && !browser.name.toLowerCase().includes('firefox')) return false;
      if (filterBrowser === 'chrome' && !browser.name.toLowerCase().includes('chrome')) return false;
      if (filterBrowser === 'edge' && !browser.name.toLowerCase().includes('edge')) return false;
      if (filterBrowser === 'brave' && !browser.name.toLowerCase().includes('brave')) return false;
      if (filterBrowser === 'desktop' && browser.isBrowser) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        d.studentName.toLowerCase().includes(term) ||
        d.sapId.toLowerCase().includes(term) ||
        d.toolName.toLowerCase().includes(term) ||
        (d.browserName && d.browserName.toLowerCase().includes(term)) ||
        (d.rawIdentifier && d.rawIdentifier.toLowerCase().includes(term))
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* Latest Live Alert Banner (Tool Opened) */}
      {latestDetection && (
        <div className="bg-gradient-to-r from-red-600/30 via-violet-600/30 to-blue-600/30 border-b border-red-500/40 p-4 flex items-center justify-between animate-slide-in">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping shrink-0" />
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span>🚨 Real-time Detection:</span>
                <span className="text-red-300 font-extrabold">{latestDetection.studentName}</span>
                <span>is using</span>
                <span className="text-white font-black underline bg-red-500/20 px-2 py-0.5 rounded">{latestDetection.toolName}</span>
                <span>through</span>
                <span className="text-amber-300 font-bold">{getBrowserInfo(latestDetection).name}</span>
              </p>
              <p className="text-xs text-zinc-300 mt-0.5">
                SAP ID: <span className="font-mono font-semibold">{latestDetection.sapId}</span> · {latestDetection.branch} · Device: {latestDetection.deviceHostname || 'Student Device'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInspectModal(latestDetection)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-semibold text-white transition-all shrink-0"
            >
              Inspect Details →
            </button>
            <button
              onClick={() => setLatestDetection(null)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Latest Deactivation Alert Banner (Tool Closed) */}
      {latestDeactivation && (
        <div className="bg-gradient-to-r from-zinc-800/80 via-emerald-950/40 to-slate-900 border-b border-emerald-500/30 p-4 flex items-center justify-between animate-slide-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Square size={16} className="fill-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <span className="text-emerald-400 font-extrabold">⏹️ Tool Deactivated:</span>
                <span className="text-white font-bold">{latestDeactivation.studentName}</span>
                <span className="text-zinc-400">closed</span>
                <span className="text-amber-300 font-bold bg-zinc-800 px-2 py-0.5 rounded border border-white/10">{latestDeactivation.toolName}</span>
                <span className="text-zinc-400">— Total Usage Time:</span>
                <span className="text-emerald-300 font-black bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded">
                  {fmtDur(latestDeactivation.durationSeconds)}
                </span>
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                SAP ID: <span className="font-mono text-zinc-300">{latestDeactivation.sapId}</span> · {latestDeactivation.branch} · {getBrowserInfo(latestDeactivation).name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInspectModal(latestDeactivation)}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-xs font-semibold text-emerald-300 transition-all shrink-0"
            >
              Inspect Details →
            </button>
            <button
              onClick={() => setLatestDeactivation(null)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50 backdrop-blur sticky top-0 z-10 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bell size={18} className="text-violet-400" />
          <h1 className="text-base font-semibold text-white">Live Monitoring Feed</h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full text-xs text-red-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
              {liveCount} ACTIVE NOW
            </span>
          )}
          {totalToday > 0 && (
            <span className="badge badge-purple">{totalToday} events today</span>
          )}
        </div>

        {/* View Mode Switcher: Stream vs AI Tools vs Student */}
        <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 gap-1">
          <button
            onClick={() => setViewMode('stream')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'stream'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Activity size={13} />
            Live Stream
          </button>
          <button
            onClick={() => setViewMode('tools')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'tools'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Wrench size={13} />
            By AI Tools
            {activeByTool.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {activeByTool.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode('students')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'students'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users size={13} />
            By Student
            {activeByStudent.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {activeByStudent.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}>
            <div className={connected ? 'live-dot' : 'w-2 h-2 rounded-full bg-zinc-600'} />
            {connected ? 'Real-Time Connected' : 'Disconnected'}
          </div>
          {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-zinc-600" />}
          {feed.length > 0 && (
            <button
              onClick={() => setFeed([])}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-2"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter bar (for stream mode) */}
      {viewMode === 'stream' && (
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-white/5 bg-zinc-900/30 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-sm bg-zinc-800/60 border border-white/10 rounded-xl px-3 py-1.5">
            <Search size={13} className="text-zinc-400 shrink-0" />
            <input
              type="text"
              placeholder="Filter by student, SAP ID, tool, or browser…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-zinc-500 outline-none flex-1"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterStatus('all')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterStatus === 'all'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-white/5'
              }`}
            >
              All Activity
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                filterStatus === 'active'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-red-300 border border-white/5'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Active ({liveCount})
            </button>
            <button
              onClick={() => setFilterStatus('deactivated')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                filterStatus === 'deactivated'
                  ? 'bg-zinc-700 text-white shadow-lg'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-white/5'
              }`}
            >
              <Square size={11} />
              Deactivated / Concluded
            </button>
          </div>

          {/* Browser Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'All Browsers', icon: '✨' },
              { id: 'chrome', label: 'Chrome', icon: '🌐' },
              { id: 'firefox', label: 'Firefox', icon: '🦊' },
              { id: 'edge', label: 'Edge', icon: '🔷' },
              { id: 'brave', label: 'Brave', icon: '🦁' },
              { id: 'desktop', label: 'Desktop Apps', icon: '🖥️' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterBrowser(f.id)}
                className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all ${
                  filterBrowser === f.id
                    ? 'bg-zinc-700 text-white border border-white/20'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {/* VIEW MODE 1: STREAM FEED */}
        {viewMode === 'stream' && (
          <>
            {!connected && feed.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-zinc-700">
                <WifiOff size={40} className="opacity-30" />
                <p className="text-sm">Connecting to live monitoring feed…</p>
              </div>
            )}
            {connected && filteredFeed.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-zinc-700">
                <Bell size={40} className="opacity-20" />
                <p className="text-sm">No activity matching your filters. Monitoring active…</p>
                <div className="live-dot" />
              </div>
            )}

            {filteredFeed.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onInspect={(d) => setInspectModal(d)}
              />
            ))}
          </>
        )}

        {/* VIEW MODE 2: BY AI TOOL */}
        {viewMode === 'tools' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Wrench size={16} className="text-violet-400" />
                  <span>Active AI Tools Breakdown</span>
                </h2>
                <p className="text-xs text-zinc-400">Real-time view of all AI tools currently active across students</p>
              </div>
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-xs font-bold text-red-300">
                {activeByTool.length} Tool{activeByTool.length === 1 ? '' : 's'} Active
              </span>
            </div>

            {activeByTool.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
                <Wrench size={40} className="opacity-30" />
                <p className="text-sm">No AI tools are currently in active use.</p>
                <p className="text-xs text-zinc-600">When students open any AI tool or browser tab, it will appear here instantly.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeByTool.map(group => (
                  <div key={group.toolName} className="admin-card p-5 border-red-500/30 bg-red-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getToolColor(group.toolName)} flex items-center justify-center text-white font-bold text-xl shadow-md`}>
                          🤖
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">{group.toolName}</h3>
                          <p className="text-xs text-red-300 font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                            {group.count} student{group.count > 1 ? 's' : ''} currently active
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      {group.sessions.map(s => (
                        <div key={s.sessionKey} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all">
                          <div>
                            <p className="text-xs font-bold text-white">
                              {s.studentName} <span className="font-mono text-zinc-400 font-normal">({s.sapId})</span>
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {s.branch} · {s.browserName} · {s.deviceHostname || 'Device'}
                            </p>
                            <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                              Started: {format(new Date(s.startTime), 'p')}
                            </p>
                          </div>
                          <button
                            onClick={() => setInspectModal(s as any)}
                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-semibold transition-all shrink-0"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW MODE 3: BY STUDENT */}
        {viewMode === 'students' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users size={16} className="text-violet-400" />
                  <span>Active Students Breakdown</span>
                </h2>
                <p className="text-xs text-zinc-400">Students who currently have open AI tools or browser sessions</p>
              </div>
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-xs font-bold text-red-300">
                {activeByStudent.length} Student{activeByStudent.length === 1 ? '' : 's'} Active
              </span>
            </div>

            {activeByStudent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
                <Users size={40} className="opacity-30" />
                <p className="text-sm">No students are currently active on any AI tool.</p>
                <p className="text-xs text-zinc-600">Active students and their detected AI tools will be listed here in real-time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeByStudent.map(group => (
                  <div key={group.sapId} className="admin-card p-5 border-red-500/30 bg-red-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-violet-300 font-bold text-xl shadow-md">
                          🎓
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">{group.studentName}</h3>
                          <p className="text-xs text-zinc-400 font-mono">SAP ID: {group.sapId} · {group.branch}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-xs text-red-300 font-bold flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Active Now
                      </span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/5">
                      {group.sessions.map(s => (
                        <div key={s.sessionKey} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all">
                          <div>
                            <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                              <span>🤖</span> {s.toolName}
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              Via {s.browserName} on {s.deviceHostname || 'Student Device'}
                            </p>
                            <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                              Started: {format(new Date(s.startTime), 'p')}
                            </p>
                          </div>
                          <button
                            onClick={() => setInspectModal(s as any)}
                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-semibold transition-all shrink-0"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* Details Inspection Modal */}
      {inspectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/15 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className={`p-6 bg-gradient-to-br ${getToolColor(inspectModal.toolName)} text-white flex items-start justify-between`}>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl shadow-md">
                  {getBrowserInfo(inspectModal).icon}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{inspectModal.toolName}</h2>
                  <p className="text-xs text-white/80">
                    Accessed via {getBrowserInfo(inspectModal).name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectModal(null)}
                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-zinc-800/60 rounded-xl border border-white/5">
                <p className="text-zinc-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">Detection Summary</p>
                <p className="text-sm text-white font-medium">
                  <span className="font-bold text-violet-300">{inspectModal.studentName}</span>
                  {inspectModal.eventType === 'DEACTIVATED' || (inspectModal.durationSeconds && inspectModal.durationSeconds > 0) ? (
                    <> used <span className="font-bold text-amber-300">{inspectModal.toolName}</span> for <span className="font-bold text-emerald-300">{fmtDur(inspectModal.durationSeconds)}</span>.</>
                  ) : (
                    <> is currently using <span className="font-bold text-amber-300">{inspectModal.toolName}</span> through <span className="font-bold text-sky-300">{getBrowserInfo(inspectModal).name}</span>.</>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-800/40 rounded-xl border border-white/5">
                  <p className="text-zinc-500 font-medium mb-1">Student</p>
                  <p className="font-bold text-white text-sm">{inspectModal.studentName}</p>
                  <p className="text-zinc-400 font-mono">SAP ID: {inspectModal.sapId}</p>
                  <p className="text-zinc-400">{inspectModal.branch}</p>
                </div>

                <div className="p-3 bg-zinc-800/40 rounded-xl border border-white/5">
                  <p className="text-zinc-500 font-medium mb-1">Environment</p>
                  <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                    <span>{getBrowserInfo(inspectModal).icon}</span>
                    <span>{getBrowserInfo(inspectModal).name}</span>
                  </div>
                  <p className="text-zinc-400 font-mono mt-0.5">{inspectModal.deviceHostname || 'Student Device'}</p>
                  <p className="text-zinc-500">{inspectModal.source === 'DESKTOP_APP' ? 'Desktop Monitor' : 'Browser Extension'}</p>
                </div>
              </div>

              {inspectModal.rawIdentifier && (
                <div className="p-3 bg-zinc-800/40 rounded-xl border border-white/5">
                  <p className="text-zinc-500 font-medium mb-1">Active Window / Identifier</p>
                  <p className="font-mono text-zinc-300 break-all">{inspectModal.rawIdentifier}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-800/40 rounded-xl border border-white/5">
                  <p className="text-zinc-500 font-medium mb-1">Session Started</p>
                  <p className="text-white font-mono">{format(new Date(inspectModal.startTime), 'PPpp')}</p>
                </div>

                <div className="p-3 bg-zinc-800/40 rounded-xl border border-white/5">
                  <p className="text-zinc-500 font-medium mb-1">Usage Duration</p>
                  <p className="text-emerald-400 font-bold text-sm">
                    {inspectModal.durationSeconds ? `${fmtDur(inspectModal.durationSeconds)} (Deactivated)` : '🔴 Active Session'}
                  </p>
                  {inspectModal.endTime && (
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      Ended: {format(new Date(inspectModal.endTime), 'p')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-white/5 flex justify-end">
              <button
                onClick={() => setInspectModal(null)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-xl text-xs font-semibold text-white transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationCard({ item, onInspect }: { item: FeedItem; onInspect: (d: UsageNotification) => void }) {
  if (item.type === 'usage') {
    const d = item.data;
    const isLive = d.eventType === 'ACTIVE' || (!d.durationSeconds && !d.endTime);
    const browser = getBrowserInfo(d);
    const toolColor = getToolColor(d.toolName);

    return (
      <div
        onClick={() => onInspect(d)}
        className={`admin-card overflow-hidden transition-all hover:border-violet-500/40 cursor-pointer group animate-slide-in ${
          isLive ? 'border-red-500/40 ring-1 ring-red-500/20 bg-red-950/5' : 'border-white/5 hover:bg-zinc-900/60'
        }`}
      >
        {/* Top accent stripe */}
        <div className={`h-1 w-full bg-gradient-to-r ${toolColor}`} />

        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* Tool & Browser icon */}
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${toolColor} flex items-center justify-center shrink-0 shadow-lg text-lg`}>
              {browser.icon}
            </div>

            <div className="flex-1 min-w-0">
              {/* Plain-English Action Headline */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-sm text-white font-medium leading-snug">
                  <span className="font-bold text-white group-hover:text-violet-300 transition-colors">{d.studentName}</span>
                  {isLive ? (
                    <>
                      {' '}is using{' '}
                      <span className="font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{d.toolName}</span>
                      {browser.isBrowser ? (
                        <> through <span className="font-bold text-sky-300">{browser.name}</span></>
                      ) : (
                        <> (Desktop Application)</>
                      )}
                    </>
                  ) : (
                    <>
                      {' '}closed{' '}
                      <span className="font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{d.toolName}</span>
                      <span className="text-zinc-400 text-xs ml-1">(Deactivated)</span>
                      {browser.isBrowser ? (
                        <> on <span className="font-bold text-sky-300">{browser.name}</span></>
                      ) : (
                        <> (Desktop Application)</>
                      )}
                    </>
                  )}
                </p>

                {isLive ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full text-[10px] text-red-400 font-bold uppercase tracking-wider shrink-0 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                    Live Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-white/10 rounded text-[10px] text-zinc-400 font-semibold uppercase tracking-wider shrink-0">
                    <Square size={9} className="text-zinc-500 fill-zinc-500" />
                    Deactivated
                  </span>
                )}

                {d.isUnknownTool && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] text-amber-400 shrink-0">
                    <AlertTriangle size={9} />
                    Unreviewed Tool
                  </span>
                )}
              </div>

              {/* Student Metadata */}
              <p className="text-xs text-zinc-400 mb-2">
                SAP ID: <span className="font-mono text-zinc-300 font-semibold">{d.sapId}</span> · {d.branch}
              </p>

              {/* Badges Row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Prominent Browser Pill */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${browser.badgeClass}`}>
                  <span>{browser.icon}</span>
                  <span>{browser.name}</span>
                </div>

                {/* Device Hostname */}
                {d.deviceHostname && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-zinc-800/80 rounded-lg border border-white/5 text-xs text-zinc-400">
                    <Cpu size={11} className="text-zinc-500" />
                    <span className="font-mono">{d.deviceHostname}</span>
                  </div>
                )}

                {/* Duration Badge - Prominently highlighted */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${
                  isLive
                    ? 'bg-zinc-800/80 border-white/5 text-zinc-400'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                }`}>
                  <Clock size={11} className={isLive ? 'text-zinc-500' : 'text-emerald-400'} />
                  <span>
                    {isLive ? 'Just started' : `Used for ${fmtDur(d.durationSeconds)}`}
                  </span>
                </div>

                {/* Click to inspect prompt */}
                <span className="text-[11px] text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto font-medium flex items-center gap-0.5">
                  Click to inspect details <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* Time Stamp */}
            <div className="text-right shrink-0">
              <p className="text-xs text-zinc-400 font-mono">{format(new Date(d.startTime), 'h:mm:ss a')}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{format(new Date(d.startTime), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'tool_pending') {
    const d = item.data;
    return (
      <div className="admin-card p-4 border-amber-500/25 bg-amber-500/5 animate-slide-in">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <BrainCircuit size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white font-medium">
              <span className="text-amber-300 font-bold">New AI Tool Detected & Flagged</span>
              {' '}— <span className="font-bold text-white">{d.suggestedName}</span>
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Matched Pattern: <span className="font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">{d.pattern}</span> · Reported by {d.reportCount} student device(s)
            </p>
          </div>
          <a
            href="/dashboard/tools"
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-xs font-semibold text-amber-300 transition-all shrink-0"
          >
            Review & Approve →
          </a>
        </div>
      </div>
    );
  }

  if (item.type === 'device_activated') {
    const d = item.data;
    return (
      <div className="admin-card p-4 border-emerald-500/20 bg-emerald-500/5 animate-slide-in">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white font-medium">
              <span className="text-emerald-400 font-bold">Device Activated</span>
              {' '}— <span className="font-bold text-white">{d.studentName}</span> ({d.sapId})
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Host: <span className="font-mono text-zinc-300">{d.hostname}</span> · OS: <span className="font-semibold text-zinc-300">{d.osType}</span>
            </p>
          </div>
          <span className="text-xs text-zinc-500 font-mono shrink-0">
            {format(new Date(d.activatedAt), 'h:mm:ss a')}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
