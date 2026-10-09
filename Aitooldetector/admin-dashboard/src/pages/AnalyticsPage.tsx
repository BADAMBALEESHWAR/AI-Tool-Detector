import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { BarChart2, TrendingUp, Users, Clock, Cpu } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

interface Analytics {
  summary: { totalStudents: number; totalEvents: number; totalDurationHours: number; pendingToolsCount: number };
  topTools: { toolName: string; eventCount: number; totalDurationSeconds: number }[];
  topStudents: { student: { name: string; sapId: string }; eventCount: number }[];
  sourceBreakdown: { source: string; count: number }[];
  dailyUsage: { date: string; count: number }[];
}

const CHART_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626'];
const DARK_TOOLTIP_STYLE = {
  contentStyle: { background: '#18181b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, fontSize: 12, color: '#a1a1aa' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/analytics').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32 text-zinc-700">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading analytics...
      </div>
    );
  }
  if (!data) return <div className="p-6 text-zinc-600">Failed to load analytics.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="page-sub">Institution-wide AI usage overview</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: data.summary.totalStudents, icon: Users, color: 'text-violet-400' },
          { label: 'Total Events', value: data.summary.totalEvents.toLocaleString(), icon: Cpu, color: 'text-blue-400' },
          { label: 'Total Usage Time', value: `${data.summary.totalDurationHours}h`, icon: Clock, color: 'text-emerald-400' },
          { label: 'Pending Tool Reviews', value: data.summary.pendingToolsCount, icon: TrendingUp, color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="admin-card p-5">
            <Icon size={18} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Daily usage chart */}
      {data.dailyUsage.length > 0 && (
        <div className="admin-card p-5">
          <h2 className="section-header mb-4"><TrendingUp size={16} className="text-violet-400" />Daily Events (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dailyUsage}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#52525b' }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#52525b' }} />
              <Tooltip {...DARK_TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Top tools bar chart */}
        {data.topTools.length > 0 && (
          <div className="admin-card p-5">
            <h2 className="section-header mb-4"><BarChart2 size={16} className="text-blue-400" />Top AI Tools</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.topTools.slice(0, 8)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11, fill: '#52525b' }} />
                <YAxis type="category" dataKey="toolName" tick={{ fontSize: 10, fill: '#a1a1aa' }} width={100} />
                <Tooltip {...DARK_TOOLTIP_STYLE} />
                <Bar dataKey="eventCount" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Source breakdown pie */}
        {data.sourceBreakdown.length > 0 && (
          <div className="admin-card p-5">
            <h2 className="section-header mb-4"><Cpu size={16} className="text-emerald-400" />Source Breakdown</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.sourceBreakdown}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={(entry: any) => `${String(entry.source ?? '').replace('_', ' ')} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {data.sourceBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...DARK_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top students */}
      {data.topStudents.length > 0 && (
        <div className="admin-card p-5">
          <h2 className="section-header mb-4"><Users size={16} className="text-amber-400" />Most Active Students</h2>
          <div className="space-y-2.5">
            {data.topStudents.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 text-xs text-zinc-600 font-mono">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{s.student?.name || 'Unknown'}</p>
                  <p className="text-xs text-zinc-600 font-mono">{s.student?.sapId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 rounded-full bg-violet-600"
                    style={{ width: `${Math.max(20, (s.eventCount / data.topStudents[0].eventCount) * 120)}px` }}
                  />
                  <span className="text-xs text-zinc-400 w-16 text-right">{s.eventCount} events</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
