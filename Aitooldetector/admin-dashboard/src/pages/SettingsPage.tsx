import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AddAdminCard from '../components/AddAdminCard';
import toast from 'react-hot-toast';
import { Save, Clock, Sparkles, Zap, Shield, Eye, Bot, Radio } from 'lucide-react';

interface AppSettings {
  monitoring_enabled: string;
  auto_track_ai_tools: string;
  auto_flag_unknown_tools: string;
  auto_approve_flagged_tools: string;
  instant_detection_enabled: string;
  monitoring_all_hours: string;
  monitoring_hours_start: string;
  monitoring_hours_end: string;
  session_dedup_minutes: string;
  heartbeat_interval_seconds: string;
}

export default function SettingsPage() {
  const { token, admin } = useAdminAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const fetchSettings = () => {
    api.get('/admin/settings').then(r => setSettings({
      monitoring_enabled: 'true',
      auto_track_ai_tools: 'true',
      auto_flag_unknown_tools: 'true',
      auto_approve_flagged_tools: 'false',
      instant_detection_enabled: 'true',
      monitoring_all_hours: 'true',
      monitoring_hours_start: '08:00',
      monitoring_hours_end: '20:00',
      session_dedup_minutes: '5',
      heartbeat_interval_seconds: '60',
      ...r.data,
    })).catch(() => {});
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Socket listener for real-time synchronization across admin tabs & pages
  useEffect(() => {
    if (!token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'https://api.tooldetect.in', {
      auth: { token, role: 'admin' },
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('settings:updated', (updatedMap: Record<string, string>) => {
      setSettings(prev => prev ? { ...prev, ...updatedMap } : null);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const saveSettings = async (customSettings?: AppSettings) => {
    const toSave = customSettings || settings;
    if (!toSave) return;
    setSaving(true);
    try {
      await api.patch('/admin/settings', toSave);
      toast.success('System settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = async (key: keyof AppSettings) => {
    if (!settings) return;
    const newVal = settings[key] === 'true' ? 'false' : 'true';
    const updated = { ...settings, [key]: newVal };
    setSettings(updated); // Optimistic UI update

    try {
      await api.patch('/admin/settings', { [key]: newVal });
      if (key === 'auto_track_ai_tools') {
        toast.success(newVal === 'true' ? '⚡ Auto-Track AI Tools enabled' : '⏸️ Auto-Track AI Tools paused');
      } else if (key === 'instant_detection_enabled') {
        toast.success(newVal === 'true' ? '⚡ Instant detection enabled' : '⏸️ Instant detection paused');
      } else if (key === 'monitoring_enabled') {
        toast.success(newVal === 'true' ? '✅ System-wide monitoring enabled' : '⏸️ System-wide monitoring paused');
      } else {
        toast.success('Setting updated');
      }
    } catch {
      // Rollback on failure
      setSettings(prev => prev ? { ...prev, [key]: settings[key] } : null);
      toast.error('Failed to update setting');
    }
  };

  if (!settings) return (
    <div className="flex items-center justify-center p-16 text-zinc-600">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-2" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">System Settings</h1>
        <p className="text-xs text-zinc-400">Configure AI tool auto-tracking, real-time monitoring rules, and detection policies</p>
      </div>

      {/* ── 1. Auto-Track AI Tools Configuration ── */}
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Auto-Track AI Tools Engine</h2>
              <p className="text-xs text-zinc-400">Automated discovery, real-time tracking, and intelligent AI detection</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${
              settings.auto_track_ai_tools === 'true'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${settings.auto_track_ai_tools === 'true' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {settings.auto_track_ai_tools === 'true' ? 'Auto-Tracking Active' : 'Auto-Tracking Paused'}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              socketConnected
                ? 'bg-blue-500/10 border border-blue-500/25 text-blue-300'
                : 'bg-zinc-800 text-zinc-500'
            }`}>
              <Radio size={9} className={socketConnected ? 'animate-pulse text-blue-400' : ''} />
              {socketConnected ? 'Live Synced' : 'Syncing...'}
            </span>
          </div>
        </div>

        {/* Master Auto-Track Switch */}
        <div className="flex items-center justify-between py-3 border-b border-white/5 bg-violet-950/20 -mx-6 px-6 border-y border-violet-500/10">
          <div>
            <div className="flex items-center gap-2">
              <Bot size={15} className="text-violet-400" />
              <p className="text-sm font-semibold text-white">Auto-Track AI Tools</p>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automatically track all registered web AI tools and desktop applications across student devices
            </p>
          </div>
          <button
            onClick={() => toggleSetting('auto_track_ai_tools')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.auto_track_ai_tools === 'true' ? 'bg-violet-600 shadow-lg shadow-violet-600/30' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.auto_track_ai_tools === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {/* Instant Detection (< 1s) */}
        <div className="flex items-center justify-between py-3 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <p className="text-sm font-medium text-white">Instant Sub-Second Detection</p>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Instantly detects and dispatches alerts to the admin console within seconds of an AI tool opening
            </p>
          </div>
          <button
            onClick={() => toggleSetting('instant_detection_enabled')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.instant_detection_enabled === 'true' ? 'bg-amber-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.instant_detection_enabled === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {/* Auto-Discover Unknown Tools */}
        <div className="flex items-center justify-between py-3 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-blue-400" />
              <p className="text-sm font-medium text-white">Auto-Discover Emerging AI Tools</p>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Automatically flag and report new or unlisted AI chat assistants, LLM tools, and AI editors used by students
            </p>
          </div>
          <button
            onClick={() => toggleSetting('auto_flag_unknown_tools')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.auto_flag_unknown_tools === 'true' ? 'bg-blue-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.auto_flag_unknown_tools === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {/* Auto-Approve High-Confidence Signatures */}
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-purple-400" />
              <p className="text-sm font-medium text-white">Auto-Approve Discovered AI Signatures</p>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Automatically approve newly detected AI tools once flagged by multiple student sessions without requiring manual review
            </p>
          </div>
          <button
            onClick={() => toggleSetting('auto_approve_flagged_tools')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.auto_approve_flagged_tools === 'true' ? 'bg-purple-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.auto_approve_flagged_tools === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      </div>

      {/* ── 2. Monitoring Schedule & Sessions ── */}
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-white/5 pb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Clock size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Monitoring Schedule & Time Rules</h2>
            <p className="text-xs text-zinc-400">System-wide monitoring operating hours and session deduplication rules</p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-white/5">
          <div>
            <p className="text-sm font-medium text-white">Global Monitoring Enabled</p>
            <p className="text-xs text-zinc-500">Turn off to pause all agent monitoring system-wide</p>
          </div>
          <button
            onClick={() => toggleSetting('monitoring_enabled')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.monitoring_enabled === 'true' ? 'bg-violet-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.monitoring_enabled === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-white/5">
          <div>
            <p className="text-sm font-medium text-white">Monitor 24/7 (All Hours)</p>
            <p className="text-xs text-zinc-500">When enabled, monitoring runs around the clock regardless of schedule</p>
          </div>
          <button
            onClick={() => toggleSetting('monitoring_all_hours')}
            className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${settings.monitoring_all_hours === 'true' ? 'bg-violet-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${settings.monitoring_all_hours === 'true' ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {settings.monitoring_all_hours !== 'true' && (
          <div className="grid grid-cols-2 gap-4 py-2 border-b border-white/5">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Daily Monitoring Start Time</label>
              <input
                type="time"
                value={settings.monitoring_hours_start}
                onChange={e => setSettings(s => s ? { ...s, monitoring_hours_start: e.target.value } : s)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Daily Monitoring End Time</label>
              <input
                type="time"
                value={settings.monitoring_hours_end}
                onChange={e => setSettings(s => s ? { ...s, monitoring_hours_end: e.target.value } : s)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
        )}

        <div className="py-2">
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Session Deduplication Window (minutes)</label>
          <input
            type="number"
            min="1"
            max="60"
            value={settings.session_dedup_minutes}
            onChange={e => setSettings(s => s ? { ...s, session_dedup_minutes: e.target.value } : s)}
            className="w-36 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Re-notifies admin if the same student opens or resumes using the same AI tool after this duration.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={() => saveSettings()}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-paper shadow-lg shadow-violet-600/25 transition-all cursor-pointer"
        >
          <Save size={15} />
          {saving ? 'Saving Settings...' : 'Save All Settings'}
        </button>
      </div>

      {admin?.role === 'superadmin' && <AddAdminCard />}
    </div>
  );
}
