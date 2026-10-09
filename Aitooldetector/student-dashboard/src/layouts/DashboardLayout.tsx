import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Cpu, Home, Download, BarChart2, User, LogOut, ShieldCheck, AlertTriangle } from 'lucide-react';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Home', icon: Home, end: true },
  { to: '/dashboard/download', label: 'Download & Setup', icon: Download, end: false },
  { to: '/dashboard/usage', label: 'My Usage', icon: BarChart2, end: false },
  { to: '/dashboard/profile', label: 'Profile', icon: User, end: false },
];

export default function DashboardLayout() {
  const { student, logout } = useAuth();
  const navigate = useNavigate();
  const [activeDevice, setActiveDevice] = useState<any | null>(null);
  const [deviceChecked, setDeviceChecked] = useState(false);

  useEffect(() => {
    api.get('/student/devices').then(res => {
      const devs: any[] = res.data;
      setActiveDevice(devs.find(d => d.status === 'ACTIVE') || null);
    }).catch(() => {}).finally(() => setDeviceChecked(true));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-white/5 bg-gray-900/50 backdrop-blur">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-900/40">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">AI Monitor</p>
            <p className="text-xs text-gray-500">Student Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Student info + logout */}
        <div className="px-3 py-4 border-t border-white/5">
          <div className="glass-card px-3 py-3 mb-2">
            <p className="text-xs font-semibold text-white truncate">{student?.name}</p>
            <p className="text-xs text-gray-500 truncate">{student?.sapId}</p>
            <p className="text-xs text-gray-600 truncate">{student?.branch}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-all"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-white/5 bg-gray-950/80 backdrop-blur">
          {/* Monitoring status indicator */}
          {deviceChecked && (
            activeDevice ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <ShieldCheck size={12} className="text-emerald-400" />
                <span className="text-xs text-emerald-300 font-medium">Monitoring Active</span>
                <span className="text-xs text-emerald-600 font-mono hidden sm:inline">· {activeDevice.hostname}</span>
              </div>
            ) : (
              <Link
                to="/dashboard/setup"
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full hover:bg-amber-500/15 transition-colors"
              >
                <AlertTriangle size={12} className="text-amber-400" />
                <span className="text-xs text-amber-300 font-medium">Setup Required — Install App</span>
              </Link>
            )
          )}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-brand-900/30">
              {student?.name?.[0]?.toUpperCase() || 'S'}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
