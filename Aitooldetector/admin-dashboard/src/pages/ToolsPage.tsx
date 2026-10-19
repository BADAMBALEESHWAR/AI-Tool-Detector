import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useActiveSessions } from '../contexts/ActiveSessionsContext';
import toast from 'react-hot-toast';
import { ToolTypeBadge, ToolTypeIcon } from '../components/toolType';
import {
  Wrench, CheckCircle2, XCircle, Shield, AlertCircle, Plus, Search,
  RefreshCw, Trash2, Edit3, Globe, Monitor, Sparkles, X, Check, Zap, Bot,
  Radio, Clock, CheckCheck
} from 'lucide-react';


interface Tool {
  id: string;
  name: string;
  type: 'WEB' | 'APP' | 'EMBEDDED' | 'UNKNOWN';
  pattern: string;
  aliases: string[];
  keywords: string[];
  description?: string;
  status: 'BUILT_IN' | 'APPROVED' | 'PENDING' | 'REJECTED';
  addedBy: string;
  reportCount: number;
  createdAt: string;
}

interface Stats {
  total: number;
  builtIn: number;
  approved: number;
  pending: number;
  rejected: number;
  webCount: number;
  appCount: number;
  embeddedCount?: number;
}

const STATUS_TABS = ['ALL', 'ACTIVE_NOW', 'BUILT_IN', 'APPROVED', 'PENDING', 'REJECTED'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE_NOW: 'bg-red-500/15 border-red-500/30 text-red-300',
  BUILT_IN: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
  APPROVED: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  PENDING: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  REJECTED: 'bg-red-500/15 border-red-500/30 text-red-300',
};

export default function ToolsPage() {
  const { token } = useAdminAuth();
  const { liveCount, getToolActiveCount } = useActiveSessions();
  const [tools, setTools] = useState<Tool[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'WEB' | 'APP' | 'EMBEDDED'>('ALL');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoTrack, setAutoTrack] = useState<boolean>(true);
  const [togglingAutoTrack, setTogglingAutoTrack] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [, setRecentDetectionsCount] = useState<number>(0);
  const [highlightPendingId, setHighlightPendingId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Modal State for Add / Edit / Review
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'WEB' as 'WEB' | 'APP' | 'EMBEDDED',
    pattern: '',
    aliases: '',
    keywords: '',
    description: '',
    status: 'APPROVED' as 'BUILT_IN' | 'APPROVED' | 'PENDING',
  });
  const [saving, setSaving] = useState(false);

  const fetchTools = async () => {
    try {
      const [toolsRes, statsRes, settingsRes] = await Promise.all([
        api.get('/tools/all'),
        api.get('/tools/stats'),
        api.get('/admin/settings').catch(() => ({ data: {} })),
      ]);
      setTools(toolsRes.data);
      setStats(statsRes.data);
      if (settingsRes.data && settingsRes.data.auto_track_ai_tools !== undefined) {
        setAutoTrack(settingsRes.data.auto_track_ai_tools === 'true');
      }
    } catch {
      toast.error('Failed to load AI tools database');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoTrack = async () => {
    const nextState = !autoTrack;
    setTogglingAutoTrack(true);
    setAutoTrack(nextState); // Optimistic UI update

    try {
      await api.patch('/admin/settings', {
        auto_track_ai_tools: nextState ? 'true' : 'false',
      });
      if (nextState) {
        toast.success('⚡ Auto-Track AI Tools enabled! All registered AI tools are monitored automatically.');
      } else {
        toast.success('⏸️ Auto-Track AI Tools paused across all client devices.');
      }
    } catch {
      setAutoTrack(!nextState); // Rollback on failure
      toast.error('Failed to update Auto-Track setting');
    } finally {
      setTogglingAutoTrack(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  // Socket.IO real-time listener for settings & tool catalogue updates
  useEffect(() => {
    if (!token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'https://api.tooldetect.in', {
      auth: { token, role: 'admin' },
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('settings:updated', (newSettings: Record<string, string>) => {
      if (newSettings && newSettings.auto_track_ai_tools !== undefined) {
        setAutoTrack(newSettings.auto_track_ai_tools === 'true');
      }
    });

    socket.on('tools:updated', () => {
      fetchTools();
    });

    socket.on('tool:pending', (data: any) => {
      fetchTools();
      if (data?.toolId) {
        setHighlightPendingId(data.toolId);
        setTimeout(() => setHighlightPendingId(null), 8000);
      }
      toast.custom((t) => (
        <div className="bg-zinc-900 border-2 border-amber-500/60 shadow-2xl shadow-amber-500/20 text-white px-4 py-3 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top duration-200 max-w-md">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <AlertCircle size={20} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-300">New AI Tool Auto-Detected!</p>
            <p className="text-xs text-white truncate font-medium">{data?.suggestedName || 'Unknown AI Tool'} ({data?.pattern || ''})</p>
            <p className="text-[10px] text-zinc-400">Added to Pending Approval list for your review</p>
          </div>
          <button
            onClick={() => {
              setTab('PENDING');
              toast.dismiss(t.id);
            }}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg cursor-pointer transition-all shrink-0"
          >
            Review
          </button>
        </div>
      ), { duration: 6000 });
    });

    socket.on('usage:new', () => {
      setRecentDetectionsCount(c => c + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const openAddModal = () => {
    setEditingTool(null);
    setFormData({
      name: '',
      type: 'WEB',
      pattern: '',
      aliases: '',
      keywords: '',
      description: '',
      status: 'APPROVED',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tool: Tool) => {
    setEditingTool(tool);
    setFormData({
      name: tool.name,
      type: tool.type === 'APP' || tool.type === 'EMBEDDED' ? tool.type : 'WEB',
      pattern: tool.pattern,
      aliases: (tool.aliases || []).join(', '),
      keywords: (tool.keywords || []).join(', '),
      description: tool.description || '',
      status: tool.status === 'BUILT_IN' ? 'BUILT_IN' : (tool.status === 'PENDING' ? 'APPROVED' : 'APPROVED'),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.pattern.trim()) {
      toast.error('Tool name and primary pattern are required');
      return;
    }

    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      pattern: formData.pattern.trim(),
      aliases: formData.aliases.split(',').map(s => s.trim()).filter(Boolean),
      keywords: formData.keywords.split(',').map(s => s.trim()).filter(Boolean),
      description: formData.description.trim(),
      status: formData.status,
    };

    try {
      if (editingTool) {
        if (editingTool.status === 'PENDING') {
          // Approve with edits
          await api.patch(`/tools/${editingTool.id}/approve`, payload);
          toast.success(`🎉 Approved & Added "${payload.name}" to AI Tools List!`);
        } else {
          await api.put(`/tools/${editingTool.id}`, payload);
          toast.success(`✅ Updated "${payload.name}" successfully`);
        }
      } else {
        await api.post('/tools', payload);
        toast.success(`🎉 Registered new AI tool "${payload.name}"`);
      }
      setIsModalOpen(false);
      fetchTools();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save tool');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from registered AI tools?`)) {
      return;
    }
    setActionLoading(id + 'delete');
    try {
      await api.delete(`/tools/${id}`);
      toast.success(`Tool "${name}" removed`);
      fetchTools();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete tool');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset/Update all default built-in AI tools in the database?')) {
      return;
    }
    setActionLoading('reset');
    try {
      const res = await api.post('/tools/reset-defaults');
      toast.success(res.data.message || 'Built-in AI tools restored');
      fetchTools();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reset defaults');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurgeFalsePositives = async () => {
    setActionLoading('purge');
    try {
      const res = await api.delete('/tools/purge-false-positives');
      toast.success(res.data.message || 'Purged false positives');
      fetchTools();
    } catch {
      toast.error('Failed to purge');
    } finally {
      setActionLoading(null);
    }
  };

  const approve = async (id: string, name: string) => {
    setActionLoading(id + 'approve');
    try {
      await api.patch(`/tools/${id}/approve`, { name });
      toast.success(`🎉 Approved! "${name}" added to AI Tools List and synced to all devices.`);
      fetchTools();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve tool');
    } finally {
      setActionLoading(null);
    }
  };

  const approveAllPending = async () => {
    const pendingList = tools.filter(t => t.status === 'PENDING');
    if (pendingList.length === 0) return;
    if (!window.confirm(`Approve all ${pendingList.length} pending AI tools at once?`)) return;

    setActionLoading('approve-all');
    let approvedCount = 0;
    for (const tool of pendingList) {
      try {
        await api.patch(`/tools/${tool.id}/approve`, { name: tool.name });
        approvedCount++;
      } catch {
        // continue
      }
    }
    setActionLoading(null);
    toast.success(`🎉 Successfully approved ${approvedCount} AI tool${approvedCount > 1 ? 's' : ''}!`);
    fetchTools();
  };

  const reject = async (id: string, name: string) => {
    setActionLoading(id + 'reject');
    try {
      await api.patch(`/tools/${id}/reject`);
      toast.success(`Tool "${name}" rejected`);
      fetchTools();
    } catch {
      toast.error('Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingTools = tools.filter(t => t.status === 'PENDING');
  const pendingCount = stats?.pending ?? pendingTools.length;

  // Filter tools for the main table
  const filtered = tools.filter(t => {
    if (tab === 'ACTIVE_NOW') {
      if (getToolActiveCount(t.name, t.id) === 0) return false;
    } else if (tab !== 'ALL' && t.status !== tab) {
      return false;
    }
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchPattern = t.pattern.toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchAliases = (t.aliases || []).some(a => a.toLowerCase().includes(q));
      const matchKw = (t.keywords || []).some(k => k.toLowerCase().includes(q));
      if (!matchName && !matchPattern && !matchDesc && !matchAliases && !matchKw) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-lg shadow-violet-600/10">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">AI Tools Database</h1>
              <p className="text-xs text-zinc-400">
                Central registry of supported Web AI Tools & Windows Desktop Applications
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-paper shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
          >
            <Plus size={14} />
            Add AI Tool
          </button>
          <button
            onClick={handleResetDefaults}
            disabled={actionLoading === 'reset'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 transition-all cursor-pointer"
            title="Restore and update default built-in AI tool signatures"
          >
            <RefreshCw size={13} className={actionLoading === 'reset' ? 'animate-spin' : ''} />
            Restore Presets
          </button>
          <button
            onClick={handlePurgeFalsePositives}
            disabled={actionLoading === 'purge'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
            title="Clean up any detected system process junk"
          >
            <Trash2 size={13} />
            Purge Junk
          </button>
        </div>
      </div>

      {/* ── Auto-Track AI Tools Engine Banner & Master Toggle ── */}
      <div className={`border rounded-2xl p-4.5 transition-all shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
        autoTrack
          ? 'bg-gradient-to-r from-violet-950/50 via-zinc-900/90 to-purple-950/40 border-violet-500/30 shadow-violet-950/20'
          : 'bg-zinc-900/60 border-white/5'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            autoTrack
              ? 'bg-violet-600/25 border border-violet-500/40 text-violet-300 shadow-lg shadow-violet-600/20'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-500'
          }`}>
            <Bot size={22} className={autoTrack ? 'animate-pulse text-violet-300' : 'text-zinc-500'} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white tracking-tight">Auto-Track AI Tool Engine</h2>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                autoTrack
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${autoTrack ? 'bg-emerald-400 animate-ping' : 'bg-zinc-500'}`} />
                {autoTrack ? 'Active & Auto-Detecting' : 'Paused'}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                socketConnected
                  ? 'bg-blue-500/10 border border-blue-500/25 text-blue-300'
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                <Radio size={9} className={socketConnected ? 'animate-pulse text-blue-400' : ''} />
                {socketConnected ? 'Real-Time Sync' : 'Reconnecting...'}
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse">
                  <AlertCircle size={10} />
                  {pendingCount} Awaiting Approval
                </span>
              )}
              {liveCount > 0 && (
                <button
                  onClick={() => setTab('ACTIVE_NOW')}
                  className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-all cursor-pointer animate-pulse"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {liveCount} Tool Session{liveCount > 1 ? 's' : ''} Active Right Now
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">

              {autoTrack
                ? `Auto-detects unlisted AI tools when opened → Adds to Pending Approval List → Admin reviews & clicks Approve → Added to official AI Tools List.`
                : 'Auto-tracking is currently paused. Student AI tool usage will not trigger automated alerts or logging.'}
            </p>
          </div>
        </div>

        {/* 1-Click Master Toggle & Badges */}
        <div className="flex items-center gap-2.5 self-end lg:self-center flex-wrap">
          <div className="hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-950/80 border border-white/10 text-amber-300">
              <Zap size={12} className="text-amber-400" />
              Sub-Second Discovery
            </span>
          </div>

          <div className="flex items-center gap-2.5 bg-zinc-950/80 border border-white/10 px-3.5 py-2 rounded-xl">
            <span className="text-xs font-semibold text-zinc-300">
              {autoTrack ? 'Auto-Track Active' : 'Auto-Track Paused'}
            </span>
            <button
              onClick={handleToggleAutoTrack}
              disabled={togglingAutoTrack}
              className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${
                autoTrack ? 'bg-violet-600 shadow-lg shadow-violet-600/30' : 'bg-zinc-700'
              }`}
              title={autoTrack ? 'Click to pause auto-tracking' : 'Click to enable auto-tracking'}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-paper rounded-full shadow transition-all ${
                  autoTrack ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── 🌟 DEDICATED APPROVAL / PENDING AI TOOLS SECTION ── */}
      {pendingTools.length > 0 && (
        <div className="bg-gradient-to-br from-amber-950/40 via-zinc-900/90 to-zinc-900 border-2 border-amber-500/40 rounded-2xl p-5 shadow-2xl shadow-amber-950/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
                <AlertCircle size={18} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Approval / Pending AI Tools
                  </h3>
                  <span className="bg-amber-500 text-black text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                    {pendingTools.length} TO REVIEW
                  </span>
                </div>
                <p className="text-xs text-amber-200/70 mt-0.5">
                  Detected by Auto-Track Engine. Review details and click <strong>Approve</strong> to officially add each tool to the main AI Tools list.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={approveAllPending}
                disabled={actionLoading === 'approve-all'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-paper shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <CheckCheck size={14} />
                Approve All ({pendingTools.length})
              </button>
            </div>
          </div>

          {/* Pending Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {pendingTools.map(tool => {
              const isApp = tool.type === 'APP';
              const isHighlighted = highlightPendingId === tool.id;

              return (
                <div
                  key={tool.id}
                  className={`bg-zinc-950/80 border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all ${
                    isHighlighted
                      ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-xl shadow-amber-500/20 animate-pulse'
                      : 'border-white/10 hover:border-amber-500/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                          isApp
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {isApp ? <Monitor size={14} /> : <Globe size={14} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{tool.name}</h4>
                          <span className="text-[10px] text-zinc-400 block truncate">
                            {isApp ? 'Windows Application' : 'Web AI Application'}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                        <Clock size={10} />
                        Flagged {tool.reportCount}x
                      </span>
                    </div>

                    <div className="bg-zinc-900/90 rounded-lg p-2 border border-white/5 space-y-1 text-left">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-500">Pattern:</span>
                        <code className="text-amber-300 font-mono font-medium truncate max-w-[170px]" title={tool.pattern}>
                          {tool.pattern}
                        </code>
                      </div>
                      {tool.description && (
                        <p className="text-[10px] text-zinc-400 truncate" title={tool.description}>
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => approve(tool.id, tool.name)}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-paper shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      Approve
                    </button>
                    <button
                      onClick={() => openEditModal(tool)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-300 transition-all cursor-pointer"
                      title="Edit details before approving"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => reject(tool.id, tool.name)}
                      disabled={!!actionLoading}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-zinc-400 hover:text-red-300 transition-all cursor-pointer"
                      title="Reject tool"
                    >
                      <XCircle size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-zinc-500 font-medium">Total Registered</p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.total ?? tools.length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
            <Globe size={12} /> Web Apps
          </p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.webCount ?? tools.filter(t => t.type === 'WEB').length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1">
            <Monitor size={12} /> Desktop Apps
          </p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.appCount ?? tools.filter(t => t.type === 'APP').length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <Monitor size={12} /> In-app AI
          </p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.embeddedCount ?? tools.filter(t => t.type === 'EMBEDDED').length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <Shield size={12} /> Built-in
          </p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.builtIn ?? tools.filter(t => t.status === 'BUILT_IN').length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
            <CheckCircle2 size={12} /> Approved
          </p>
          <p className="text-xl font-bold text-white mt-0.5">{stats?.approved ?? tools.filter(t => t.status === 'APPROVED').length}</p>
        </div>
        <div className="bg-zinc-900/70 border border-white/5 p-3.5 rounded-2xl">
          <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
            <AlertCircle size={12} /> Awaiting Review
          </p>
          <p className="text-xl font-bold text-amber-400 mt-0.5">{pendingCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-white/5 overflow-x-auto">
          {STATUS_TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                tab === t ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'ALL' && 'ALL TOOLS'}
              {t === 'ACTIVE_NOW' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  ACTIVE NOW ({liveCount})
                </>
              )}
              {t !== 'ALL' && t !== 'ACTIVE_NOW' && t.replace('_', ' ')}
              {t === 'PENDING' && pendingCount > 0 && (
                <span className="ml-1 bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Type Filter & Search Input */}
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="ALL">All Application Types</option>
              <option value="WEB">Web Applications Only</option>
              <option value="APP">Desktop Applications Only</option>
              <option value="EMBEDDED">In-app AI Features Only</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tools, patterns, keywords..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 w-60"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main AI Tools Table */}
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {tab === 'PENDING' ? 'Pending Approval AI Tools' : 'Active AI Tools List'} ({filtered.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            {tab === 'PENDING' ? 'Awaiting administrator action' : 'Monitored & detected automatically across all devices'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-2" />
            Loading AI Tools...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-2">
            <Wrench size={32} className="opacity-20" />
            <p className="text-sm font-medium">No tools found matching your criteria</p>
            <p className="text-xs text-zinc-600">Try clearing filters or click "+ Add AI Tool" to register one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/1">
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">AI Tool</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Primary Pattern / Domain / EXE</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Window Title Keywords</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Added By</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {filtered.map(tool => {
                  return (
                    <tr key={tool.id} className="hover:bg-white/2 transition-colors">
                      {/* Name & Description */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <ToolTypeIcon type={tool.type} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white text-xs">{tool.name}</p>
                              {getToolActiveCount(tool.name, tool.id) > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-black animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  {getToolActiveCount(tool.name, tool.id)} Active
                                </span>
                              )}
                            </div>
                            {tool.description && (
                              <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[220px]" title={tool.description}>
                                {tool.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5">
                        <ToolTypeBadge type={tool.type} />
                      </td>

                      {/* Pattern & Aliases */}
                      <td className="px-4 py-3.5">
                        <code className="text-xs text-amber-300 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {tool.pattern}
                        </code>
                        {tool.aliases?.length > 0 && (
                          <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate max-w-[180px]" title={tool.aliases.join(', ')}>
                            aliases: {tool.aliases.join(', ')}
                          </p>
                        )}
                      </td>

                      {/* Window Title Keywords */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {(tool.keywords && tool.keywords.length > 0 ? tool.keywords : [tool.name]).slice(0, 3).map((kw, i) => (
                            <span key={i} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-md">
                              {kw}
                            </span>
                          ))}
                          {(tool.keywords?.length || 0) > 3 && (
                            <span className="text-[10px] text-zinc-500">
                              +{(tool.keywords?.length || 0) - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${STATUS_BADGE[tool.status] || 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                          {tool.status === 'BUILT_IN' && <Shield size={10} />}
                          {tool.status === 'APPROVED' && <CheckCircle2 size={10} />}
                          {tool.status === 'PENDING' && <AlertCircle size={10} />}
                          {tool.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Added By */}
                      <td className="px-4 py-3.5">
                        <span className="text-[11px] text-zinc-400 font-mono">{tool.addedBy}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tool.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => approve(tool.id, tool.name)}
                                disabled={!!actionLoading}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-paper flex items-center gap-1 cursor-pointer transition-all shadow"
                              >
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              <button
                                onClick={() => reject(tool.id, tool.name)}
                                disabled={!!actionLoading}
                                className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-paper flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <XCircle size={12} /> Reject
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => openEditModal(tool)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                            title={tool.status === 'PENDING' ? 'Review & Edit Tool' : 'Edit AI Tool'}
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            onClick={() => handleDelete(tool.id, tool.name)}
                            disabled={actionLoading === tool.id + 'delete'}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                            title="Delete tool"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit / Review Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white">
                  {editingTool?.status === 'PENDING'
                    ? `Review & Approve AI Tool: ${editingTool.name}`
                    : (editingTool ? `Edit AI Tool: ${editingTool.name}` : 'Register New AI Tool')}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    AI Tool Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ChatGPT, Cursor AI, Kling AI"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Application Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as 'WEB' | 'APP' | 'EMBEDDED' })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="WEB">Web App (Browser-based)</option>
                    <option value="APP">Desktop App (Windows Executable)</option>
                    <option value="EMBEDDED">In-app AI (feature inside another app)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Primary Pattern / Domain / Executable <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={formData.type === 'WEB' ? 'e.g. chatgpt.com or deepseek.com' : formData.type === 'EMBEDDED' ? 'e.g. embedded:copilot-in-teams' : 'e.g. ChatGPT.exe or Cursor.exe'}
                  value={formData.pattern}
                  onChange={e => setFormData({ ...formData, pattern: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  {formData.type === 'WEB'
                    ? 'Main website domain or URL'
                    : formData.type === 'EMBEDDED'
                      ? 'Unique id starting with "embedded:". Put the host executables (e.g. WINWORD, Code) in Aliases and UI markers such as "Pane=Copilot" in Keywords.'
                      : 'Exact Windows process executable name (e.g. ChatGPT.exe)'}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Aliases & Subdomains (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. chat.openai.com, openai.com"
                  value={formData.aliases}
                  onChange={e => setFormData({ ...formData, aliases: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Window Title Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ChatGPT, New chat - ChatGPT"
                  value={formData.keywords}
                  onChange={e => setFormData({ ...formData, keywords: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of the AI tool..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-paper shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {editingTool?.status === 'PENDING' ? 'Approve & Add Tool' : (editingTool ? 'Save Changes' : 'Register AI Tool')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
