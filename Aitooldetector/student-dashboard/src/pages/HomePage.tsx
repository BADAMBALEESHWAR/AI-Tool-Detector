import { useEffect, useState } from 'react';
import { SOCKET_URL } from '../lib/config';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { io } from 'socket.io-client';
import { Download, Puzzle, CheckCircle2, Clock, BarChart2, Cpu, Wifi, WifiOff, Sparkles, AlertCircle } from 'lucide-react';

interface Device {
  id: string;
  osType: string;
  hostname: string;
  status: string;
  extensionStatus: boolean;
  lastSeen: string;
}

interface Stats {
  totalEvents: number;
  totalDurationSeconds: number;
  topTools: { toolName: string; _count: { toolName: number } }[];
  recentEvents: { toolName: string; startTime: string; durationSeconds: number; source: string }[];
}

export default function HomePage() {
  const { student, token } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api.get('/student/devices').then(res => setDevices(res.data)).catch(() => {});
    api.get('/student/stats').then(res => setStats(res.data)).catch(() => {});
  }, []);

  // Socket.io for real-time device activation updates
  useEffect(() => {
    if (!token || !student) return;
    const socket = io(SOCKET_URL, {
      auth: { token, role: 'student' },
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('device:activated', () => {
      api.get('/student/devices').then(res => setDevices(res.data)).catch(() => {});
    });
    socket.on('usage:own', () => {
      api.get('/student/stats').then(res => setStats(res.data)).catch(() => {});
    });
    return () => { socket.disconnect(); };
  }, [token, student]);

  const activeDevice = devices.find(d => d.status === 'ACTIVE');
  const activationStatus = activeDevice ? 'active' : devices.length > 0 ? 'inactive' : 'never';

  const fmtDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2">
            <span>Welcome, {student?.name?.split(' ')[0]}</span>
            <Sparkles size={18} className="text-amber-400" />
          </h1>
          <p className="page-subheader">SAP ID: {student?.sapId} · {student?.branch}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
          connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-700/30 text-gray-500 border border-gray-700/30'
        }`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? 'Live Sync Active' : 'Offline'}
        </div>
      </div>

      {/* Activation status banner */}
      <div className={`rounded-2xl p-5 border flex items-center gap-4 ${
        activationStatus === 'active'
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : activationStatus === 'inactive'
          ? 'bg-yellow-500/10 border-yellow-500/20'
          : 'bg-blue-500/10 border-blue-500/20'
      }`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          activationStatus === 'active' ? 'bg-emerald-500/20' : activationStatus === 'inactive' ? 'bg-yellow-500/20' : 'bg-blue-500/20'
        }`}>
          {activationStatus === 'active' ? <CheckCircle2 className="text-emerald-400 w-6 h-6" /> : <Clock className="text-yellow-400 w-6 h-6" />}
        </div>
        <div className="flex-1">
          {activationStatus === 'active' ? (
            <>
              <p className="font-semibold text-emerald-300">Monitoring Active</p>
              <p className="text-sm text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                <span>Device <span className="text-white font-mono">{activeDevice?.hostname}</span></span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  {activeDevice?.extensionStatus ? (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span className="text-emerald-300">Extension Active</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={13} className="text-amber-400" />
                      <span className="text-amber-300">Extension Optional</span>
                    </>
                  )}
                </span>
              </p>
            </>
          ) : activationStatus === 'inactive' ? (
            <>
              <p className="font-semibold text-yellow-300">App Installed — Sign In Required</p>
              <p className="text-sm text-gray-400">Open the desktop app and sign in with your SAP ID to activate monitoring.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-blue-300">Setup Not Started</p>
              <p className="text-sm text-gray-400">Download and install the desktop app to begin monitoring setup.</p>
            </>
          )}
        </div>
        {activationStatus === 'never' && (
          <Link to="/dashboard/download" className="btn-primary shrink-0 text-sm">
            Download App
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <Cpu className="w-5 h-5 text-brand-400 mb-1" />
          <span className="text-2xl font-bold text-white">{stats?.totalEvents ?? '—'}</span>
          <span className="text-xs text-gray-500">Total AI interactions</span>
        </div>
        <div className="stat-card">
          <Clock className="w-5 h-5 text-violet-400 mb-1" />
          <span className="text-2xl font-bold text-white">
            {stats ? fmtDuration(stats.totalDurationSeconds) : '—'}
          </span>
          <span className="text-xs text-gray-500">Total AI usage time</span>
        </div>
        <div className="stat-card">
          <BarChart2 className="w-5 h-5 text-indigo-400 mb-1" />
          <span className="text-2xl font-bold text-white">{stats?.topTools?.length ?? '—'}</span>
          <span className="text-xs text-gray-500">Tools used</span>
        </div>
      </div>

      {/* Recent activity */}
      {stats && stats.recentEvents.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Recent Activity</h2>
          <div className="space-y-2">
            {stats.recentEvents.map((e, i) => (
              <div key={i} className="glass-card px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{e.toolName}</p>
                  <p className="text-xs text-gray-500">{new Date(e.startTime).toLocaleString()}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{e.durationSeconds ? fmtDuration(e.durationSeconds) : '—'}</p>
                  <span className={`badge text-xs ${e.source === 'BROWSER_EXTENSION' ? 'badge-blue' : 'badge-purple'}`}>
                    {e.source === 'BROWSER_EXTENSION' ? 'Browser' : 'Desktop'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Link to="/dashboard/usage" className="block text-center text-xs text-brand-400 hover:text-brand-300 mt-3 transition-colors">
            View all usage →
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { to: '/dashboard/download', icon: Download, label: 'Download App', sub: 'Windows & macOS', color: 'from-brand-600 to-violet-600' },
          { to: '/dashboard/download', icon: Puzzle, label: 'Browser Extension', sub: 'Chrome, Edge, Brave', color: 'from-neutral-700 to-neutral-900' },
          { to: '/dashboard/usage', icon: BarChart2, label: 'View Usage', sub: 'Your AI history', color: 'from-violet-600 to-purple-600' },
        ].map(({ to, icon: Icon, label, sub, color }) => (
          <Link key={label} to={to} className="glass-card-hover p-5 flex flex-col gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
              <Icon className="w-5 h-5 text-paper" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-xs text-gray-500">{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
