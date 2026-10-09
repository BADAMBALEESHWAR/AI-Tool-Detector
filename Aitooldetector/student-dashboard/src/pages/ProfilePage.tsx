import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { User, Monitor, Shield, CheckCircle2, XCircle, Clock, Key, Save } from 'lucide-react';
import { format } from 'date-fns';

interface Device {
  id: string;
  osType: string;
  hostname: string;
  status: string;
  extensionStatus: boolean;
  appVersion?: string;
  activatedAt: string;
  lastSeen: string;
}

export default function ProfilePage() {
  const { student } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    api.get('/student/devices').then(res => setDevices(res.data)).catch(() => {});
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    setPwSaving(true);
    try {
      await api.patch('/student/change-password', { currentPassword, newPassword });
      setPwSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const statusColor = (s: string) => ({
    ACTIVE: 'badge-green',
    INACTIVE: 'badge-yellow',
    DEACTIVATED: 'badge-red',
  }[s] || 'badge-blue');

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h1 className="page-header">Profile</h1>
        <p className="page-subheader">Your account details and registered devices</p>
      </div>

      {/* Profile card */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-brand-900/30">
            {student?.name?.[0]?.toUpperCase() || 'S'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{student?.name}</h2>
            <p className="text-gray-400 text-sm">{student?.branch}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'SAP ID', value: student?.sapId, icon: Shield },
            { label: 'Branch / Class', value: student?.branch, icon: User },
            { label: 'Email', value: student?.email || 'Not set', icon: User },
            { label: 'Account Status', value: 'Active', icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/3 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-sm font-medium text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Key size={14} />
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              className="input-field text-sm py-2.5"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="input-field text-sm py-2.5"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="input-field text-sm py-2.5"
              placeholder="Repeat new password"
            />
          </div>

          {pwError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {pwSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={pwSaving}
            className="btn-primary flex items-center gap-2 text-sm py-2.5"
          >
            <Save size={14} />
            {pwSaving ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Devices */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Monitor size={14} />
          Registered Devices ({devices.length})
        </h2>
        {devices.length === 0 ? (
          <p className="text-sm text-gray-600 py-4 text-center">No devices registered yet. Install the desktop app to get started.</p>
        ) : (
          <div className="space-y-3">
            {devices.map(device => (
              <div key={device.id} className="bg-white/3 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white font-mono">{device.hostname}</p>
                      <span className={`badge ${statusColor(device.status)}`}>{device.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{device.osType} · App v{device.appVersion || '—'}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs">
                      {device.extensionStatus
                        ? <><CheckCircle2 size={12} className="text-emerald-400" /> <span className="text-emerald-400">Extension Active</span></>
                        : <><XCircle size={12} className="text-yellow-500" /> <span className="text-yellow-500">Extension Missing</span></>
                      }
                    </div>
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 justify-end">
                      <Clock size={10} />
                      Last seen {format(new Date(device.lastSeen), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
