import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import {
  Monitor, CheckCircle2, XCircle, Search, Clock,
  UserX, UserCheck, Key, ChevronRight, X, BarChart2,
  Cpu, Globe, Shield
} from 'lucide-react';
import { format } from 'date-fns';

interface Device {
  id: string;
  hostname: string;
  osType: string;
  status: string;
  lastSeen: string;
  extensionStatus: boolean;
}

interface Student {
  id: string;
  sapId: string;
  name: string;
  branch: string;
  status: string;
  registeredAt: string;
  devices: Device[];
  _count: { usageEvents: number };
}

interface StudentDetail extends Student {
  email?: string;
  recentEvents: {
    id: string;
    toolName: string;
    source: string;
    startTime: string;
    durationSeconds?: number;
  }[];
  stats: {
    totalEvents: number;
    totalDurationSeconds: number;
    topTools: { toolName: string; count: number }[];
  };
}

function fmtDur(secs?: number) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchStudents = async (p = 1, q = '') => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: 20 };
      if (q) params.search = q;
      const res = await api.get('/admin/students', { params });
      setStudents(res.data.students);
      setTotalPages(res.data.pagination.totalPages);
      setTotal(res.data.pagination.total);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(page, search); }, [search, page]);
  useEffect(() => { setPage(1); }, [search]);

  const openDetail = async (student: Student) => {
    setSelected(null);
    setTempPassword(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/students/${student.id}`);
      setSelected(res.data);
    } catch {
      toast.error('Failed to load student details');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string, name: string) => {
    setActionLoading(id + status);
    try {
      await api.patch(`/admin/students/${id}/status`, { status });
      toast.success(`${name} ${status === 'ACTIVE' ? 'reactivated' : status === 'SUSPENDED' ? 'suspended' : 'deactivated'}`);
      fetchStudents(page, search);
      if (selected?.id === id) {
        const res = await api.get(`/admin/students/${id}`);
        setSelected(res.data);
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const resetPassword = async (id: string, name: string) => {
    setActionLoading(id + 'reset');
    try {
      const res = await api.patch(`/admin/students/${id}/reset-password`);
      setTempPassword(res.data.temporaryPassword);
      toast.success(`Temporary password generated for ${name}`);
    } catch {
      toast.error('Failed to reset password');
    } finally {
      setActionLoading(null);
    }
  };

  const activeDevice = (s: Student) => s.devices.find(d => d.status === 'ACTIVE');

  return (
    <div className="p-6 space-y-5 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">{total} registered students</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          placeholder="Search by name, SAP ID, branch..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-admin pl-8"
        />
      </div>

      {/* Table */}
      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-700">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-2" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="table-header">Student</th>
                <th className="table-header">Branch</th>
                <th className="table-header">Status</th>
                <th className="table-header">Device</th>
                <th className="table-header">Extension</th>
                <th className="table-header">Last Active</th>
                <th className="table-header">Events</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/3">
              {students.map(s => {
                const dev = activeDevice(s);
                const isActing = !!actionLoading;
                return (
                  <tr
                    key={s.id}
                    className="hover:bg-white/2 transition-colors cursor-pointer"
                    onClick={() => openDetail(s)}
                  >
                    <td className="table-cell">
                      <p className="font-medium text-white">{s.name}</p>
                      <p className="text-xs text-zinc-600 font-mono">{s.sapId}</p>
                    </td>
                    <td className="table-cell text-zinc-400">{s.branch}</td>
                    <td className="table-cell">
                      <span className={`badge ${s.status === 'ACTIVE' ? 'badge-green' : s.status === 'SUSPENDED' ? 'badge-yellow' : 'badge-red'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="table-cell">
                      {dev ? (
                        <div className="flex items-center gap-1.5">
                          <Monitor size={12} className="text-emerald-400" />
                          <span className="text-xs font-mono text-zinc-400">{dev.hostname}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-700">No device</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {dev?.extensionStatus
                        ? <CheckCircle2 size={14} className="text-emerald-400" />
                        : <XCircle size={14} className="text-zinc-700" />
                      }
                    </td>
                    <td className="table-cell text-xs text-zinc-500">
                      {dev ? (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {format(new Date(dev.lastSeen), 'MMM d, h:mm a')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-cell text-zinc-400">{s._count.usageEvents}</td>
                    <td className="table-cell" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        {s.status === 'ACTIVE' ? (
                          <button
                            onClick={() => updateStatus(s.id, 'SUSPENDED', s.name)}
                            disabled={isActing}
                            title="Suspend"
                            className="p-1.5 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-40"
                          >
                            <UserX size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => updateStatus(s.id, 'ACTIVE', s.name)}
                            disabled={isActing}
                            title="Reactivate"
                            className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                          >
                            <UserCheck size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => resetPassword(s.id, s.name)}
                          disabled={isActing}
                          title="Reset Password"
                          className="p-1.5 rounded-md bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                        >
                          <Key size={12} />
                        </button>
                        <button
                          onClick={() => openDetail(s)}
                          title="View details"
                          className="p-1.5 rounded-md bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 transition-colors"
                        >
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-zinc-600">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button className="btn-admin" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
            <button className="btn-admin" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      {/* Student Detail Drawer */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => { setSelected(null); setTempPassword(null); }} />
          {/* Panel */}
          <div className="w-[480px] bg-zinc-900 border-l border-white/5 flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-semibold text-white">Student Details</h2>
              <button onClick={() => { setSelected(null); setTempPassword(null); }} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center flex-1 text-zinc-700">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-3" />
                Loading...
              </div>
            ) : selected ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Profile */}
                <div className="admin-card p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                      {selected.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{selected.name}</p>
                      <p className="text-xs text-zinc-500 font-mono">{selected.sapId}</p>
                    </div>
                    <span className={`ml-auto badge ${selected.status === 'ACTIVE' ? 'badge-green' : selected.status === 'SUSPENDED' ? 'badge-yellow' : 'badge-red'}`}>
                      {selected.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: 'Branch', value: selected.branch },
                      { label: 'Email', value: selected.email || '—' },
                      { label: 'Registered', value: format(new Date(selected.registeredAt), 'MMM d, yyyy') },
                      { label: 'Total Events', value: selected.stats.totalEvents },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/3 rounded-lg p-2.5">
                        <p className="text-zinc-600 uppercase tracking-wide mb-0.5">{label}</p>
                        <p className="text-zinc-200 font-medium">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="admin-card p-4">
                  <h3 className="section-header mb-3"><BarChart2 size={14} className="text-violet-400" /> Usage Summary</h3>
                  <div className="flex gap-4 mb-3">
                    <div>
                      <p className="text-2xl font-bold text-white">{selected.stats.totalEvents}</p>
                      <p className="text-xs text-zinc-600">Total events</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{fmtDur(selected.stats.totalDurationSeconds)}</p>
                      <p className="text-xs text-zinc-600">Total time</p>
                    </div>
                  </div>
                  {selected.stats.topTools.length > 0 && (
                    <div className="space-y-1.5">
                      {selected.stats.topTools.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Cpu size={10} className="text-violet-400 shrink-0" />
                          <span className="text-zinc-300 flex-1 truncate">{t.toolName}</span>
                          <span className="text-zinc-500">{t.count}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Devices */}
                {selected.devices.length > 0 && (
                  <div className="admin-card p-4">
                    <h3 className="section-header mb-3"><Monitor size={14} className="text-emerald-400" /> Devices</h3>
                    <div className="space-y-2">
                      {selected.devices.map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs bg-white/3 rounded-lg p-2.5">
                          <Monitor size={12} className={d.status === 'ACTIVE' ? 'text-emerald-400' : 'text-zinc-600'} />
                          <span className="font-mono text-zinc-300 flex-1">{d.hostname}</span>
                          <span className="text-zinc-600">{d.osType}</span>
                          {d.extensionStatus
                            ? <span title="Extension active"><CheckCircle2 size={10} className="text-emerald-400" /></span>
                            : <span title="No extension"><XCircle size={10} className="text-zinc-700" /></span>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent events */}
                {selected.recentEvents.length > 0 && (
                  <div className="admin-card p-4">
                    <h3 className="section-header mb-3"><Clock size={14} className="text-blue-400" /> Recent Activity</h3>
                    <div className="space-y-1.5">
                      {selected.recentEvents.map(ev => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs">
                          {ev.source === 'BROWSER_EXTENSION'
                            ? <Globe size={10} className="text-blue-400 shrink-0" />
                            : <Monitor size={10} className="text-violet-400 shrink-0" />
                          }
                          <span className="text-violet-300 font-medium flex-1 truncate">{ev.toolName}</span>
                          <span className="text-zinc-600">{ev.durationSeconds ? fmtDur(ev.durationSeconds) : '—'}</span>
                          <span className="text-zinc-700">{format(new Date(ev.startTime), 'MMM d')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Temp password display */}
                {tempPassword && (
                  <div className="admin-card p-4 border-violet-500/30 bg-violet-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Key size={14} className="text-violet-400" />
                      <h3 className="text-sm font-semibold text-violet-300">Temporary Password Generated</h3>
                    </div>
                    <p className="font-mono text-lg text-white bg-zinc-900 px-4 py-2 rounded-lg text-center tracking-widest border border-white/10">
                      {tempPassword}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2 text-center">Share this securely. It will not be shown again.</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {selected.status === 'ACTIVE' ? (
                    <button
                      onClick={() => updateStatus(selected.id, 'SUSPENDED', selected.name)}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-all text-sm font-medium disabled:opacity-40"
                    >
                      <UserX size={14} /> Suspend
                    </button>
                  ) : selected.status === 'SUSPENDED' ? (
                    <button
                      onClick={() => updateStatus(selected.id, 'ACTIVE', selected.name)}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-sm font-medium disabled:opacity-40"
                    >
                      <UserCheck size={14} /> Reactivate
                    </button>
                  ) : null}
                  <button
                    onClick={() => resetPassword(selected.id, selected.name)}
                    disabled={!!actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-all text-sm font-medium disabled:opacity-40"
                  >
                    <Key size={14} /> Reset Password
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(selected.id, 'DEACTIVATED', selected.name)}
                    disabled={!!actionLoading || selected.status === 'DEACTIVATED'}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-40"
                  >
                    <Shield size={14} /> Deactivate Account
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
