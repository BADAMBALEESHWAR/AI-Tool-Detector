import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  List, Search, Download, ChevronLeft, ChevronRight,
  Globe, Monitor, Clock, Laptop, CheckCircle2,
  Calendar, RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';

interface UsageEvent {
  id: string;
  toolName: string;
  source: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  browserName?: string;
  rawIdentifier?: string;
  student: { sapId: string; name: string; branch: string };
  device: { hostname: string; osType: string };
  tool?: { name: string; type: 'WEB' | 'APP' | 'UNKNOWN'; pattern: string };
}

function formatDuration(secs?: number) {
  if (!secs || secs <= 0) return '< 1s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getBrowserDetails(browserName?: string, rawIdentifier?: string, toolType?: string) {
  const isApp = toolType === 'APP' || browserName === 'Desktop Application';
  if (isApp) {
    return {
      name: 'N/A (Desktop)',
      icon: '🖥️',
      badgeCls: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
      isBrowser: false,
    };
  }

  const combined = ((browserName || '') + ' ' + (rawIdentifier || '')).toLowerCase();
  if (combined.includes('firefox')) {
    return { name: 'Mozilla Firefox', icon: '🦊', badgeCls: 'bg-orange-500/15 border-orange-500/30 text-orange-300', isBrowser: true };
  }
  if (combined.includes('chrome')) {
    return { name: 'Google Chrome', icon: '🌐', badgeCls: 'bg-blue-500/15 border-blue-500/30 text-blue-300', isBrowser: true };
  }
  if (combined.includes('edge')) {
    return { name: 'Microsoft Edge', icon: '🔷', badgeCls: 'bg-sky-500/15 border-sky-500/30 text-sky-300', isBrowser: true };
  }
  if (combined.includes('brave')) {
    return { name: 'Brave Browser', icon: '🦁', badgeCls: 'bg-amber-500/15 border-amber-500/30 text-amber-300', isBrowser: true };
  }
  if (combined.includes('opera')) {
    return { name: 'Opera', icon: '🔴', badgeCls: 'bg-red-500/15 border-red-500/30 text-red-300', isBrowser: true };
  }
  if (combined.includes('safari')) {
    return { name: 'Safari', icon: '🧭', badgeCls: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300', isBrowser: true };
  }
  if (combined.includes('arc')) {
    return { name: 'Arc Browser', icon: '🌈', badgeCls: 'bg-pink-500/15 border-pink-500/30 text-pink-300', isBrowser: true };
  }
  if (combined.includes('vivaldi')) {
    return { name: 'Vivaldi', icon: '🔴', badgeCls: 'bg-red-500/15 border-red-500/30 text-red-300', isBrowser: true };
  }

  return {
    name: browserName || 'Web Browser',
    icon: '🌐',
    badgeCls: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    isBrowser: true,
  };
}

export default function LogsPage() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [appTypeFilter, setAppTypeFilter] = useState<'ALL' | 'WEB' | 'APP'>('ALL');
  const [browserFilter, setBrowserFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: 25 };
      if (search.trim()) params.search = search.trim();
      if (appTypeFilter !== 'ALL') params.appType = appTypeFilter;
      if (browserFilter) params.browser = browserFilter;
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await api.get('/admin/usage', { params });
      setEvents(res.data.events || []);
      setTotalPages(res.data.pagination.totalPages || 1);
      setTotal(res.data.pagination.total || 0);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page, appTypeFilter, browserFilter, from, to]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setAppTypeFilter('ALL');
    setBrowserFilter('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search) params.set('search', search);
    if (appTypeFilter !== 'ALL') params.set('appType', appTypeFilter);

    try {
      const res = await api.get(`/admin/usage/export?${params.toString()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ai-usage-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Silently ignore
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <List size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">AI Usage Logs</h1>
              <p className="text-xs text-zinc-400">
                Complete audit trail of all detected AI tool usage across web browsers and desktop applications
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white shadow-sm transition-all cursor-pointer"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2.5 items-center">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search Student, SAP ID, Tool, Device..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* App Type Filter */}
          <div className="relative">
            <select
              value={appTypeFilter}
              onChange={e => { setAppTypeFilter(e.target.value as any); setPage(1); }}
              className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="ALL">All App Types</option>
              <option value="WEB">Web App Only</option>
              <option value="APP">Desktop App Only</option>
            </select>
          </div>

          {/* Browser Filter */}
          <div className="relative">
            <select
              value={browserFilter}
              onChange={e => { setBrowserFilter(e.target.value); setPage(1); }}
              className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="">All Browsers</option>
              <option value="Chrome">Google Chrome</option>
              <option value="Edge">Microsoft Edge</option>
              <option value="Firefox">Mozilla Firefox</option>
              <option value="Brave">Brave Browser</option>
              <option value="Opera">Opera</option>
              <option value="Safari">Safari</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-1">
            <Calendar size={12} className="text-zinc-500" />
            <input
              type="date"
              value={from}
              onChange={e => { setFrom(e.target.value); setPage(1); }}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none w-28 cursor-pointer"
              title="From date"
            />
            <span className="text-zinc-600 text-xs">-</span>
            <input
              type="date"
              value={to}
              onChange={e => { setTo(e.target.value); setPage(1); }}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none w-28 cursor-pointer"
              title="To date"
            />
          </div>

          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all cursor-pointer"
          >
            Filter
          </button>

          {(search || appTypeFilter !== 'ALL' || browserFilter || from || to) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </form>

        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-white/4">
          <span>Showing {events.length} of {total} monitored events</span>
          <span>Page {page} of {totalPages}</span>
        </div>
      </div>

      {/* Usage Logs Table — 8 Required Columns */}
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-2" />
            Loading Usage Logs...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-2">
            <List size={32} className="opacity-20" />
            <p className="text-sm font-medium">No usage events found</p>
            <p className="text-xs text-zinc-600">Events will appear here automatically when students use AI tools</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/1">
                  {/* Column 1 */}
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Student Name
                  </th>
                  {/* Column 2 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    AI Tool Name
                  </th>
                  {/* Column 3 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Application Type
                  </th>
                  {/* Column 4 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Browser Name
                  </th>
                  {/* Column 5 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Start Time
                  </th>
                  {/* Column 6 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Duration
                  </th>
                  {/* Column 7 */}
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Device Name
                  </th>
                  {/* Column 8 */}
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider text-right">
                    Detection Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {events.map(ev => {
                  const isApp = ev.tool?.type === 'APP' || ev.browserName === 'Desktop Application';
                  const appType = isApp ? 'Desktop App' : 'Web App';
                  const b = getBrowserDetails(ev.browserName, ev.rawIdentifier, ev.tool?.type);
                  const isLive = !ev.endTime && (!ev.durationSeconds || ev.durationSeconds === 0);

                  return (
                    <tr key={ev.id} className="hover:bg-white/2 transition-colors">
                      {/* 1. Student / Person Name */}
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-semibold text-white text-xs">{ev.student.name}</p>
                          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                            {ev.student.sapId} · {ev.student.branch}
                          </p>
                        </div>
                      </td>

                      {/* 2. AI Tool Name */}
                      <td className="px-4 py-3.5">
                        <span className="font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20 text-xs inline-block">
                          {ev.toolName}
                        </span>
                      </td>

                      {/* 3. Application Type */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                          isApp
                            ? 'bg-purple-500/10 border-purple-500/25 text-purple-300'
                            : 'bg-blue-500/10 border-blue-500/25 text-blue-300'
                        }`}>
                          {isApp ? <Monitor size={12} /> : <Globe size={12} />}
                          <span>{appType}</span>
                        </span>
                      </td>

                      {/* 4. Browser Name */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${b.badgeCls}`}>
                          <span>{b.icon}</span>
                          <span>{b.name}</span>
                        </span>
                      </td>

                      {/* 5. Start Time */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 text-zinc-300 text-xs">
                          <Clock size={11} className="text-zinc-500 shrink-0" />
                          <span>{format(new Date(ev.startTime), 'MMM d, yyyy · h:mm a')}</span>
                        </div>
                      </td>

                      {/* 6. Duration of Usage */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold text-zinc-200 bg-zinc-800/80 px-2 py-0.5 rounded-md border border-white/5">
                          {formatDuration(ev.durationSeconds)}
                        </span>
                      </td>

                      {/* 7. Device Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                          <Laptop size={12} className="text-zinc-500 shrink-0" />
                          <span className="truncate max-w-[140px]" title={ev.device.hostname}>
                            {ev.device.hostname}
                          </span>
                        </div>
                      </td>

                      {/* 8. Detection Status */}
                      <td className="px-5 py-3.5 text-right">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px] font-medium uppercase tracking-wider">
                            <CheckCircle2 size={10} className="text-emerald-400" />
                            Logged
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/5 text-xs text-zinc-400 bg-zinc-950/40">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 font-mono text-white text-xs">{page}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
