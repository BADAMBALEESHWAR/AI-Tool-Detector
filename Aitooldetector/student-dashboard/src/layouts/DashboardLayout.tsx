import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import NmimsBrand from '../components/NmimsBrand';
import { Home, Download, BarChart2, User, LogOut, ShieldCheck, AlertTriangle, Menu, X } from 'lucide-react';

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
  const [navOpen, setNavOpen] = useState(false);

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
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Utility strip */}
      <div className="bg-ink text-paper/80 text-[11px]">
        <div className="flex items-center justify-between px-6 h-8">
          <span className="tracking-wide truncate"><span className="hidden sm:inline">Shri Vile Parle Kelavani Mandal's · Narsee Monjee Institute of Management Studies</span><span className="sm:hidden">SVKM's NMIMS</span></span>
          <span className="hidden md:inline uppercase tracking-[0.2em] font-semibold text-paper/60">Student Portal</span>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-paper border-b-4 border-nmims-600 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setNavOpen(o => !o)}
              className="md:hidden p-2 -ml-2 rounded-md text-gray-300 hover:bg-gray-800"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
            >
              {navOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <NmimsBrand subtitle="Student Portal" />
          </div>

          <div className="flex items-center gap-4">
            {/* Monitoring status indicator */}
            {deviceChecked && (
              activeDevice ? (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <ShieldCheck size={12} className="text-emerald-700" />
                  <span className="text-xs text-emerald-700 font-semibold">Monitoring Active</span>
                  <span className="text-xs text-emerald-600 font-mono hidden lg:inline">· {activeDevice.hostname}</span>
                </div>
              ) : (
                <Link
                  to="/dashboard/setup"
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full hover:bg-amber-500/15 transition-colors"
                >
                  <AlertTriangle size={12} className="text-amber-700" />
                  <span className="text-xs text-amber-700 font-semibold">Setup Required — Install App</span>
                </Link>
              )
            )}
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-gray-100 truncate max-w-[200px]">{student?.name}</p>
              <p className="text-[11px] text-gray-500 font-mono">{student?.sapId}</p>
            </div>
            <div className="w-10 h-10 rounded-md bg-nmims-600 flex items-center justify-center text-paper text-sm font-bold shadow-sm">
              {student?.name?.[0]?.toUpperCase() || 'S'}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {navOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setNavOpen(false)} />}
        {/* Sidebar: drawer on phones, fixed column from md up */}
        <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 md:w-60 shrink-0 flex flex-col bg-paper border-r border-gray-700 transition-transform duration-200 ${navOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <p className="px-5 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-600">My Account</p>
          <nav className="flex-1 px-3 pb-3 space-y-1">
            {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-nmims-600 text-paper shadow-sm'
                      : 'text-gray-400 hover:text-nmims-600 hover:bg-nmims-50'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Student info + logout */}
          <div className="px-3 py-4 border-t border-gray-700">
            <div className="px-3 py-3 mb-2 bg-gray-800 rounded-md border-l-4 border-nmims-600">
              <p className="text-xs font-semibold text-gray-100 truncate">{student?.name}</p>
              <p className="text-xs text-gray-500 truncate font-mono">{student?.sapId}</p>
              <p className="text-xs text-gray-600 truncate">{student?.branch}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold text-gray-500 hover:text-nmims-600 rounded-md hover:bg-nmims-50 transition-all"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-4 sm:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
