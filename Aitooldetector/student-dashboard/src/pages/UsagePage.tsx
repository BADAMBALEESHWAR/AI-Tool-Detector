import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { BarChart2, Clock, Monitor, Globe, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface UsageEvent {
  id: string;
  toolName: string;
  source: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  rawIdentifier?: string;
  browserName?: string;
  tool?: { name: string; type: string };
  device?: { osType: string; hostname: string };
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

const SOURCE_LABELS: Record<string, string> = {
  BROWSER_EXTENSION: 'Browser',
  DESKTOP_APP: 'Desktop',
};

function fmtDuration(secs: number) {
  if (!secs) return '< 1m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function UsagePage() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchUsage = async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: 15 };
      if (sourceFilter) params.source = sourceFilter;
      const res = await api.get('/student/usage', { params });
      setEvents(res.data.events);
      setPagination(res.data.pagination);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sourceFilter]);

  const filtered = search
    ? events.filter(e => e.toolName.toLowerCase().includes(search.toLowerCase()))
    : events;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">My Usage</h1>
        <p className="page-subheader">Your personal AI tool usage history · {pagination.total} total events</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 py-2.5 text-sm"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
            className="input-field pl-9 py-2.5 text-sm w-40 appearance-none"
          >
            <option value="">All sources</option>
            <option value="BROWSER_EXTENSION">Browser</option>
            <option value="DESKTOP_APP">Desktop</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-600">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-3" />
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600 gap-3">
            <BarChart2 size={32} className="opacity-30" />
            <p className="text-sm">No usage events found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Tool', 'Source', 'Started', 'Duration', 'Device'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(event => (
                <tr key={event.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-brand-600/20 flex items-center justify-center text-xs">
                        🤖
                      </div>
                      <span className="text-sm font-medium text-white">{event.toolName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${event.source === 'BROWSER_EXTENSION' ? 'badge-blue' : 'badge-purple'}`}>
                      {event.source === 'BROWSER_EXTENSION' ? <Globe size={10} /> : <Monitor size={10} />}
                      {SOURCE_LABELS[event.source] || event.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {format(new Date(event.startTime), 'MMM d, h:mm a')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 flex items-center gap-1">
                    <Clock size={12} />
                    {event.durationSeconds ? fmtDuration(event.durationSeconds) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {event.device?.hostname || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary py-2 px-3 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="btn-secondary py-2 px-3 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
