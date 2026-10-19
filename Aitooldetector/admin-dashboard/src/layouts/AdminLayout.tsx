import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useActiveSessions } from '../contexts/ActiveSessionsContext';
import { api } from '../lib/api';
import NmimsBrand from '../components/NmimsBrand';
import { Bell, Wrench, Users, List, BarChart2, Settings, LogOut, ShieldCheck, AlertCircle, Radio, Square } from 'lucide-react';

function fmtDur(secs?: number) {
  if (!secs || secs <= 0) return 'Just started';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function AdminLayout() {
  const { admin, token, logout } = useAdminAuth();
  const { liveCount } = useActiveSessions();
  const navigate = useNavigate();
  const [pendingToolsCount, setPendingToolsCount] = useState<number>(0);

  const fetchPendingCount = async () => {
    try {
      const res = await api.get('/tools/pending');
      if (Array.isArray(res.data)) {
        setPendingToolsCount(res.data.length);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPendingCount();
  }, []);

  // Global socket listener for pending tools & real-time ACTIVE / DEACTIVATED notifications
  useEffect(() => {
    if (!token) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'https://api.tooldetect.in', {
      auth: { token, role: 'admin' },
    });

    socket.on('tool:pending', () => {
      fetchPendingCount();
    });

    socket.on('tools:updated', () => {
      fetchPendingCount();
    });

    const handleUsage = (data: any) => {
      const isDeactivated = data.eventType === 'DEACTIVATED' || (typeof data.durationSeconds === 'number' && data.durationSeconds > 0);
      

      if (isDeactivated) {
        // Global Toast Notification for Tool Closed / Deactivated
        toast.custom((t) => (
          <div className="bg-zinc-900 border-2 border-emerald-500/40 shadow-2xl shadow-emerald-500/20 text-white px-4 py-3 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200 max-w-md">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Square size={18} className="fill-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">⏹️ DEACTIVATED</span>
                {data.durationSeconds && (
                  <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/10">
                    {fmtDur(data.durationSeconds)}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-white truncate">
                {data.studentName} <span className="font-mono text-zinc-400">({data.sapId})</span>
              </p>
              <p className="text-[11px] text-zinc-300 truncate">
                Closed <strong className="text-amber-300 font-semibold">{data.toolName}</strong>
              </p>
            </div>
            <button
              onClick={() => {
                navigate('/dashboard/notifications');
                toast.dismiss(t.id);
              }}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg cursor-pointer transition-all shrink-0 border border-white/10"
            >
              Feed
            </button>
          </div>
        ), { duration: 6000 });
      } else {
        // Global Toast Notification for Tool Opened / Active
        toast.custom((t) => (
          <div className="bg-zinc-900 border-2 border-red-500/60 shadow-2xl shadow-red-500/25 text-white px-4 py-3 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200 max-w-md">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
              <Radio size={20} className="animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                <span className="text-[11px] font-black uppercase tracking-wider text-red-400">🚨 ACTIVE NOW</span>
              </div>
              <p className="text-xs font-bold text-white truncate">
                {data.studentName} <span className="font-mono text-zinc-400">({data.sapId})</span>
              </p>
              <p className="text-[11px] text-zinc-300 truncate">
                Opened <strong className="text-amber-300 font-semibold">{data.toolName}</strong> in {data.browserName || 'Browser'}
              </p>
            </div>
            <button
              onClick={() => {
                navigate('/dashboard/notifications');
                toast.dismiss(t.id);
              }}
              className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-paper text-xs font-bold rounded-lg cursor-pointer transition-all shrink-0 shadow-sm"
            >
              Inspect
            </button>
          </div>
        ), { duration: 7000 });
      }
    };

    socket.on('usage:new', handleUsage);
    socket.on('usage:active', handleUsage);
    socket.on('usage:deactivated', handleUsage);

    return () => {
      socket.disconnect();
    };
  }, [token, navigate]);

  const navItems = [
    {
      to: '/dashboard/notifications',
      label: 'Live Feed',
      icon: Bell,
      badge: liveCount > 0 ? (
        <span className="ml-auto inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping inline-block" />
          {liveCount} Active
        </span>
      ) : null,
    },
    {
      to: '/dashboard/tools',
      label: 'AI Tools',
      icon: Wrench,
      badge: pendingToolsCount > 0 ? (
        <span className="ml-auto inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
          <AlertCircle size={10} className="text-amber-400" />
          {pendingToolsCount}
        </span>
      ) : null,
    },
    { to: '/dashboard/students', label: 'Students', icon: Users },
    { to: '/dashboard/logs', label: 'Usage Logs', icon: List },
    { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      {/* Utility strip */}
      <div className="bg-ink text-paper/80 text-[11px]">
        <div className="flex items-center justify-between px-6 h-8">
          <span className="tracking-wide">Shri Vile Parle Kelavani Mandal's · Narsee Monjee Institute of Management Studies</span>
          <span className="hidden md:inline uppercase tracking-[0.2em] font-semibold text-paper/60">Academic Integrity Office</span>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-paper border-b-4 border-nmims-600 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <NmimsBrand subtitle="Admin Console" />
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="flex items-center justify-end gap-1.5">
                <ShieldCheck size={11} className="text-nmims-600" />
                <span className="text-[10px] text-nmims-600 font-bold uppercase tracking-wider">{admin?.role}</span>
              </div>
              <p className="text-sm font-semibold text-zinc-100 truncate max-w-[220px]">{admin?.name}</p>
              <p className="text-[11px] text-zinc-500 truncate max-w-[220px]">{admin?.email}</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-nmims-600 border border-nmims-600 rounded-md hover:bg-nmims-600 hover:text-paper transition-all cursor-pointer"
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 flex flex-col bg-paper border-r border-zinc-700">
          <p className="px-5 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Monitoring</p>
          <nav className="flex-1 px-3 pb-3 space-y-1">
            {navItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-nmims-600 text-paper shadow-sm [&_span]:text-paper'
                      : 'text-zinc-400 hover:text-nmims-600 hover:bg-nmims-50'
                  }`
                }
              >
                <Icon size={15} />
                <span>{label}</span>
                {badge}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 py-4 border-t border-zinc-700 text-[10px] text-zinc-600 leading-relaxed">
            Metadata-only monitoring · No content, keystrokes or screenshots are captured.
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
