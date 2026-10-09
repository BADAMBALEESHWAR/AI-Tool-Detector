import { useState, useEffect } from 'react';
import {
  Cpu, Shield, ShieldCheck, Activity, Globe, Laptop, Clock,
  CheckCircle2, AlertCircle, LogOut, Minus, X, Trash2,
  Sparkles, Key, User, BookOpen, Layers, Check
} from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      getAuthState: () => Promise<{ isActivated: boolean; studentInfo: any }>;
      signIn: (c: { sapId: string; password: string }) => Promise<{ success: boolean; error?: string; student?: any }>;
      signUp: (d: any) => Promise<{ success: boolean; error?: string; student?: any }>;
      signOut: () => Promise<{ success: boolean }>;
      getMonitoringStatus: () => Promise<any>;
      getActiveTools: () => Promise<{ activeTools: any[]; recentTools: any[] }>;
      clearSessionHistory: () => Promise<{ success: boolean }>;
      onActiveToolsUpdated: (cb: (data: { activeTools: any[]; recentTools: any[] }) => void) => () => void;
      onToolNotification?: (cb: (notif: { type: 'ACTIVE_NOW' | 'DEACTIVATED'; toolName: string; browserName: string; time?: string; durationFormatted?: string }) => void) => () => void;
      onMonitoringStarted: (cb: () => void) => void;
      onSignedOut: (cb: () => void) => void;
      minimizeWindow: () => void;
      hideWindow: () => void;
    };
  }
}

interface ActiveTool {
  sessionKey: string;
  toolId: string;
  toolName: string;
  browserName: string;
  rawIdentifier: string;
  startTime: string;
  startTimeFormatted?: string;
  durationSeconds: number;
  durationFormatted?: string;
  status: 'ACTIVE';
}

interface RecentTool {
  sessionKey: string;
  toolId: string;
  toolName: string;
  browserName: string;
  rawIdentifier?: string;
  startTime: string;
  startTimeFormatted?: string;
  endTime: string;
  endTimeFormatted?: string;
  durationSeconds: number;
  durationFormatted?: string;
  status: 'DEACTIVATED';
}

interface ToastNotification {
  id: string;
  type: 'ACTIVE_NOW' | 'DEACTIVATED';
  title: string;
  message: string;
  time: string;
}

type Screen = 'auth' | 'monitoring';
type AuthTab = 'signin' | 'signup';

export default function App() {
  const [screen, setScreen] = useState<Screen>('auth');
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getAuthState().then(({ isActivated, studentInfo }) => {
      if (isActivated && studentInfo) {
        setStudentInfo(studentInfo);
        setScreen('monitoring');
      }
      setLoading(false);
    });
    window.electronAPI.onMonitoringStarted(() => setScreen('monitoring'));
    window.electronAPI.onSignedOut(() => { setScreen('auth'); setStudentInfo(null); });
  }, []);

  return (
    <div style={styles.container}>
      <TitleBar isMonitoring={screen === 'monitoring'} />
      <div style={styles.contentWrapper}>
        {loading ? (
          <LoadingScreen />
        ) : screen === 'monitoring' ? (
          <MonitoringScreen student={studentInfo} />
        ) : (
          <AuthScreen onSuccess={(s) => { setStudentInfo(s); setScreen('monitoring'); }} />
        )}
      </div>
    </div>
  );
}

function TitleBar({ isMonitoring }: { isMonitoring: boolean }) {
  return (
    <div style={styles.titlebar}>
      <div style={styles.titlebarLeft}>
        <div style={styles.appIconWrapper}>
          <Cpu size={13} color="#a78bfa" />
        </div>
        <div style={styles.titleTextWrapper}>
          <span style={styles.titlebarTitle}>AI Monitor</span>
          <span style={styles.versionBadge}>v1.0.0</span>
        </div>
      </div>

      <div style={styles.titlebarCenter}>
        {isMonitoring ? (
          <span style={styles.headerStatusActive}>
            <span style={styles.pulseDot} />
            Auto-Track Active
          </span>
        ) : (
          <span style={styles.headerStatusIdle}>Authentication</span>
        )}
      </div>

      <div style={styles.titlebarRight}>
        <button
          style={styles.windowBtn}
          onClick={() => window.electronAPI.minimizeWindow()}
          title="Minimize to taskbar"
        >
          <Minus size={12} />
        </button>
        <button
          style={{ ...styles.windowBtn, ...styles.windowBtnClose }}
          onClick={() => window.electronAPI.hideWindow()}
          title="Minimize to System Tray"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={styles.loadingContainer}>
      <div style={styles.spinnerWrapper}>
        <div style={styles.spinnerRing} />
        <Cpu size={24} color="#a78bfa" style={styles.spinnerCenterIcon} />
      </div>
      <p style={styles.loadingText}>Initializing AI Monitoring Engine...</p>
    </div>
  );
}

function AuthScreen({ onSuccess }: { onSuccess: (s: any) => void }) {
  const [tab, setTab] = useState<AuthTab>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);

  // Signin state
  const [sapId, setSapId] = useState('');
  const [password, setPassword] = useState('');

  // Signup state
  const [signupData, setSignupData] = useState({ sapId: '', name: '', branch: '', email: '', password: '', confirmPassword: '' });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sapId.trim() || !password) { setError('Please enter your SAP ID and Password'); return; }
    setLoading(true);
    const result = await window.electronAPI.signIn({ sapId: sapId.trim(), password });
    setLoading(false);
    if (result.success) {
      onSuccess(result.student);
    } else {
      setError(result.error || 'Sign-in failed. Verify credentials.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!signupData.sapId || !signupData.name || !signupData.branch || !signupData.password) {
      setError('Please fill in all required fields');
      return;
    }
    if (signupData.password !== signupData.confirmPassword) { setError('Passwords do not match'); return; }
    if (signupData.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!consentChecked) { setError('Please acknowledge the monitoring disclosure to continue'); return; }
    setLoading(true);
    const result = await window.electronAPI.signUp(signupData);
    setLoading(false);
    if (result.success) {
      const signInResult = await window.electronAPI.signIn({ sapId: signupData.sapId, password: signupData.password });
      if (signInResult.success) onSuccess(signInResult.student);
      else setError('Account created successfully. Please sign in.');
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  return (
    <div style={styles.authContainer}>
      {/* Brand Hero */}
      <div style={styles.brandHero}>
        <div style={styles.brandLogoRing}>
          <div style={styles.brandLogo}>
            <Cpu size={26} color="#ffffff" />
          </div>
        </div>
        <h1 style={styles.brandTitle}>AI Activity Monitor</h1>
        <p style={styles.brandSubtitle}>Academic Integrity & Auto-Tracking Client</p>
      </div>

      {/* Segmented Control */}
      <div style={styles.segmentedControl}>
        <button
          style={{ ...styles.segmentBtn, ...(tab === 'signin' ? styles.segmentBtnActive : {}) }}
          onClick={() => { setTab('signin'); setError(''); }}
        >
          Sign In
        </button>
        <button
          style={{ ...styles.segmentBtn, ...(tab === 'signup' ? styles.segmentBtnActive : {}) }}
          onClick={() => { setTab('signup'); setError(''); }}
        >
          Register
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {tab === 'signin' ? (
        <form onSubmit={handleSignIn} style={styles.form}>
          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><User size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              placeholder="SAP ID (e.g. 500123456)"
              value={sapId}
              onChange={e => setSapId(e.target.value)}
              autoFocus
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><Key size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button style={styles.primaryButton} type="submit" disabled={loading}>
            {loading ? (
              <span style={styles.btnLoadingRow}>
                <span style={styles.btnMiniSpinner} />
                Authenticating...
              </span>
            ) : (
              'Sign In & Activate Monitor'
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} style={styles.form}>
          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><User size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              placeholder="SAP ID *"
              value={signupData.sapId}
              onChange={e => setSignupData(p => ({ ...p, sapId: e.target.value }))}
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><User size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              placeholder="Full Name *"
              value={signupData.name}
              onChange={e => setSignupData(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><BookOpen size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              placeholder="Branch / Program (e.g. B.Tech CSE) *"
              value={signupData.branch}
              onChange={e => setSignupData(p => ({ ...p, branch: e.target.value }))}
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><Globe size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              placeholder="Institutional Email (optional)"
              value={signupData.email}
              onChange={e => setSignupData(p => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><Key size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              type="password"
              placeholder="Create Password (min 8 chars) *"
              value={signupData.password}
              onChange={e => setSignupData(p => ({ ...p, password: e.target.value }))}
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.inputIconWrapper}><Key size={14} color="#71717a" /></span>
            <input
              style={styles.input}
              type="password"
              placeholder="Confirm Password *"
              value={signupData.confirmPassword}
              onChange={e => setSignupData(p => ({ ...p, confirmPassword: e.target.value }))}
            />
          </div>

          <div style={styles.consentCard}>
            <div style={styles.consentHeader}>
              <Shield size={13} color="#f59e0b" />
              <span style={styles.consentTitle}>Academic Integrity Compliance</span>
            </div>
            <p style={styles.consentText}>
              This application monitors active AI tools on this workstation. Only session metadata (tool name, browser, start time, duration) is captured — never message text, keystrokes, or personal files.
            </p>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                style={styles.checkbox}
              />
              <span>I consent to institutional AI tool activity tracking</span>
            </label>
          </div>

          <button style={styles.primaryButton} type="submit" disabled={loading}>
            {loading ? 'Registering...' : 'Register & Start Monitoring'}
          </button>
        </form>
      )}
    </div>
  );
}

function MonitoringScreen({ student }: { student: any }) {
  const [signingOut, setSigningOut] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [recentTools, setRecentTools] = useState<RecentTool[]>([]);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Fetch initial active tools snapshot and subscribe to real-time updates
  useEffect(() => {
    window.electronAPI.getActiveTools().then((data) => {
      if (data) {
        setActiveTools(data.activeTools || []);
        setRecentTools(data.recentTools || []);
      }
    });

    const unsubscribeActive = window.electronAPI.onActiveToolsUpdated((data) => {
      setActiveTools(data.activeTools || []);
      setRecentTools(data.recentTools || []);
    });

    // In-app single-fire toast notification listener
    const unsubscribeNotif = window.electronAPI.onToolNotification?.((notif) => {
      if (notif.type === 'ACTIVE_NOW') {
        setToast({
          id: String(Date.now()),
          type: 'ACTIVE_NOW',
          title: 'Active Now',
          message: `${notif.toolName} opened in ${notif.browserName}`,
          time: notif.time || formatTime12h(new Date()),
        });
      } else if (notif.type === 'DEACTIVATED') {
        setToast({
          id: String(Date.now()),
          type: 'DEACTIVATED',
          title: 'Deactivated',
          message: `${notif.toolName} closed (${notif.durationFormatted || 'Usage ended'})`,
          time: notif.time || formatTime12h(new Date()),
        });
      }
      setTimeout(() => setToast(null), 4500);
    });

    return () => {
      if (unsubscribeActive) unsubscribeActive();
      if (unsubscribeNotif) unsubscribeNotif();
    };
  }, []);

  // Real-time local stopwatch timer: increments active tools duration every 1 second
  useEffect(() => {
    if (activeTools.length === 0) return;
    const interval = setInterval(() => {
      setActiveTools((prev) =>
        prev.map((t) => {
          const secs = Math.max(1, Math.floor((Date.now() - new Date(t.startTime).getTime()) / 1000));
          return {
            ...t,
            durationSeconds: secs,
            durationFormatted: formatUsageMinutes(secs),
          };
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTools.length]);

  const handleClearHistory = async () => {
    if (window.confirm('Clear session activity log on this device?')) {
      await window.electronAPI.clearSessionHistory();
      setRecentTools([]);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('Sign out and pause AI monitoring on this device?')) return;
    setSigningOut(true);
    await window.electronAPI.signOut();
    setSigningOut(false);
  };

  const initials = (student?.name || 'S')
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={styles.monitoringContainer}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            ...styles.toastCard,
            borderColor: toast.type === 'ACTIVE_NOW' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: toast.type === 'ACTIVE_NOW' ? '0 8px 24px rgba(16, 185, 129, 0.15)' : '0 8px 24px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div style={styles.toastLeft}>
            <span
              style={{
                ...styles.toastDot,
                background: toast.type === 'ACTIVE_NOW' ? '#10b981' : '#71717a',
              }}
            />
            <div>
              <div style={styles.toastTitleRow}>
                <span
                  style={{
                    ...styles.toastStatus,
                    color: toast.type === 'ACTIVE_NOW' ? '#34d399' : '#e4e4e7',
                  }}
                >
                  {toast.title}
                </span>
                <span style={styles.toastTime}>· {toast.time}</span>
              </div>
              <p style={styles.toastMessage}>{toast.message}</p>
            </div>
          </div>
          <button style={styles.toastCloseBtn} onClick={() => setToast(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Student Profile Ribbon */}
      <div style={styles.profileRibbon}>
        <div style={styles.profileAvatar}>
          <span>{initials}</span>
        </div>
        <div style={styles.profileMeta}>
          <div style={styles.profileNameRow}>
            <span style={styles.profileName}>{student?.name || 'Authorized Student'}</span>
            <span style={styles.activePillSmall}>
              <span style={styles.pulseDot} />
              Active
            </span>
          </div>
          <p style={styles.profileDetails}>
            SAP ID: <span style={styles.monoText}>{student?.sapId || '—'}</span> · {student?.branch || '—'}
          </p>
        </div>
      </div>

      {/* ── LIVE ACTIVE NOW SECTION ── */}
      <div style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitleRow}>
            <Activity size={14} color="#34d399" />
            <h2 style={styles.sectionTitle}>Currently Detected AI Tools</h2>
          </div>
          <span
            style={{
              ...styles.liveCountBadge,
              background: activeTools.length > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
              borderColor: activeTools.length > 0 ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)',
              color: activeTools.length > 0 ? '#34d399' : '#71717a',
            }}
          >
            {activeTools.length > 0 ? `${activeTools.length} ACTIVE NOW` : '0 ACTIVE'}
          </span>
        </div>

        {activeTools.length > 0 ? (
          <div style={styles.activeToolsList}>
            {activeTools.map((tool) => (
              <div key={tool.sessionKey} style={styles.activeToolCard}>
                <div style={styles.activeToolTopRow}>
                  <div style={styles.activeToolHeading}>
                    <span style={styles.activeNowPill}>
                      <span style={styles.activeNowDot} />
                      ACTIVE NOW
                    </span>
                    <h3 style={styles.activeToolTitle}>{tool.toolName}</h3>
                  </div>
                  <div style={styles.liveStopwatchBadge}>
                    <Clock size={11} color="#34d399" />
                    <span>{formatDuration(tool.durationSeconds)}</span>
                  </div>
                </div>

                {/* 3-Column Metrics Grid */}
                <div style={styles.activeMetricsGrid}>
                  <div style={styles.activeMetricCell}>
                    <span style={styles.metricLabel}>Status</span>
                    <span style={styles.activeStatusValue}>Active Now</span>
                  </div>
                  <div style={styles.activeMetricCell}>
                    <span style={styles.metricLabel}>Active</span>
                    <span style={styles.metricTimeValue}>
                      {tool.startTimeFormatted || formatTime12h(tool.startTime)}
                    </span>
                  </div>
                  <div style={styles.activeMetricCell}>
                    <span style={styles.metricLabel}>Total Usage</span>
                    <span style={styles.activeDurationValue}>
                      {tool.durationFormatted || formatUsageMinutes(tool.durationSeconds)}
                    </span>
                  </div>
                </div>

                {/* Browser Tag */}
                <div style={styles.activeFooterRow}>
                  <span style={styles.platformBadge}>
                    {tool.browserName.includes('Desktop') ? (
                      <Laptop size={11} color="#a78bfa" />
                    ) : (
                      <Globe size={11} color="#38bdf8" />
                    )}
                    <span>{tool.browserName}</span>
                  </span>
                  <span style={styles.windowIdentifierText} title={tool.rawIdentifier}>
                    {tool.rawIdentifier.length > 32 ? tool.rawIdentifier.slice(0, 32) + '…' : tool.rawIdentifier}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyActiveCard}>
            <div style={styles.emptyRadarWrapper}>
              <span style={styles.emptyRadarRing} />
              <ShieldCheck size={20} color="#34d399" />
            </div>
            <div style={styles.emptyActiveTextWrapper}>
              <p style={styles.emptyActiveTitle}>No AI Tools Currently Open</p>
              <p style={styles.emptyActiveDesc}>
                Real-time monitor is scanning browser windows, side panels, and extensions. Opening ChatGPT, Claude, DeepSeek, or Gemini immediately marks it as “Active Now”.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── ACTIVITY TRACKING: CONCLUDED SESSIONS ── */}
      <div style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitleRow}>
            <Layers size={14} color="#a78bfa" />
            <h2 style={styles.sectionTitle}>Activity Tracking (Active Now → Deactivated)</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={styles.historyCountBadge}>
              {recentTools.length} {recentTools.length === 1 ? 'Session' : 'Sessions'}
            </span>
            {recentTools.length > 0 && (
              <button
                onClick={handleClearHistory}
                style={styles.clearLogBtn}
                title="Clear activity log"
              >
                <Trash2 size={10} />
                Clear
              </button>
            )}
          </div>
        </div>

        {recentTools.length > 0 ? (
          <div style={styles.recentToolsList}>
            {recentTools.map((recent, idx) => (
              <div key={recent.sessionKey + idx} style={styles.deactivatedSessionCard}>
                <div style={styles.deactivatedCardTop}>
                  <div style={styles.deactivatedToolHeading}>
                    <h4 style={styles.deactivatedToolName}>{recent.toolName}</h4>
                    <span style={styles.platformBadge}>
                      {recent.browserName.includes('Desktop') ? (
                        <Laptop size={10} color="#a78bfa" />
                      ) : (
                        <Globe size={10} color="#38bdf8" />
                      )}
                      <span>{recent.browserName}</span>
                    </span>
                  </div>
                  <span style={styles.deactivatedStatusBadge}>
                    <span style={styles.deactivatedDot} />
                    Deactivated
                  </span>
                </div>

                {/* 3-Column Metrics Row: Active | Deactivated | Total Usage */}
                <div style={styles.durationMetricsGrid}>
                  <div style={styles.durationMetricCell}>
                    <span style={styles.metricLabel}>Active</span>
                    <span style={styles.metricValueActive}>
                      {recent.startTimeFormatted || formatTime12h(recent.startTime)}
                    </span>
                  </div>
                  <div style={styles.durationMetricCell}>
                    <span style={styles.metricLabel}>Deactivated</span>
                    <span style={styles.metricValueDeact}>
                      {recent.endTimeFormatted || formatTime12h(recent.endTime)}
                    </span>
                  </div>
                  <div style={styles.durationMetricCell}>
                    <span style={styles.metricLabel}>Total Usage</span>
                    <span style={styles.metricValueTotal}>
                      {recent.durationFormatted || formatUsageMinutes(recent.durationSeconds)}
                    </span>
                  </div>
                </div>

                {recent.rawIdentifier && (
                  <div style={styles.deactivatedRawMeta}>
                    <span style={styles.deactivatedRawText} title={recent.rawIdentifier}>
                      {recent.rawIdentifier}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyRecentCard}>
            <p style={styles.emptyRecentText}>
              No concluded sessions recorded yet. Closing an open AI tool tab or window will log its exact Active time, Deactivated time, and Total Usage duration here.
            </p>
          </div>
        )}
      </div>

      {/* ── System Status & Sign Out ── */}
      <div style={styles.footerRow}>
        <div style={styles.systemStatusChip}>
          <ShieldCheck size={12} color="#34d399" />
          <span>System Tray Active · Single Alert Policy (No Spam)</span>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={12} />
          <span>{signingOut ? 'Signing out...' : 'Sign Out & Pause Monitoring'}</span>
        </button>
      </div>
    </div>
  );
}

function formatTime12h(isoOrDate: string | Date | undefined): string {
  if (!isoOrDate) return '—';
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '—';
  }
}

function formatUsageMinutes(seconds: number): string {
  if (seconds < 60) {
    return seconds <= 1 ? '1 second' : `${seconds} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (mins < 60) {
    if (remSecs === 0) {
      return `${mins} minute${mins === 1 ? '' : 's'}`;
    }
    return `${mins}m ${remSecs}s`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) {
    return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  return `${hrs}h ${remMins}m`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m ${secs}s`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ── Complete UI Stylesheet ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: 'radial-gradient(130% 120% at 50% 0%, #15142a 0%, #0d0d14 38%, #09090b 100%)',
    color: '#f4f4f5',
    height: '100vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 14px 18px 14px',
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  contentWrapper: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
  },
  monitoringContainer: {
    width: '100%',
    maxWidth: 404,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  authContainer: {
    width: '100%',
    maxWidth: 348,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 16,
  },
  loadingContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '60px 0',
  },
  spinnerWrapper: {
    position: 'relative',
    width: 60,
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    width: 52,
    height: 52,
    border: '3px solid rgba(124, 58, 237, 0.15)',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  spinnerCenterIcon: {
    position: 'absolute',
  },
  loadingText: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 14,
    letterSpacing: '0.01em',
  },

  // ── Titlebar ─────────────────────────────────────────────────────────────
  titlebar: {
    width: '100%',
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 4px 0 8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
    boxSizing: 'border-box',
    // @ts-ignore
    WebkitAppRegion: 'drag',
  },
  titlebarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  appIconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: 'rgba(124, 58, 237, 0.15)',
    border: '1px solid rgba(124, 58, 237, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  titlebarTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.02em',
  },
  versionBadge: {
    fontSize: 9,
    fontWeight: 600,
    color: '#71717a',
    background: 'rgba(255, 255, 255, 0.04)',
    padding: '1px 5px',
    borderRadius: 4,
  },
  titlebarCenter: {
    display: 'flex',
    alignItems: 'center',
  },
  headerStatusActive: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 10,
    fontWeight: 600,
    color: '#34d399',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: 9999,
    padding: '2px 8px',
  },
  headerStatusIdle: {
    fontSize: 10,
    color: '#71717a',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#10b981',
    animation: 'pulseDot 1.8s infinite',
    display: 'inline-block',
  },
  titlebarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    // @ts-ignore
    WebkitAppRegion: 'no-drag',
  },
  windowBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  windowBtnClose: {},

  // ── Auth Screen ──────────────────────────────────────────────────────────
  brandHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandLogoRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.4), rgba(79, 70, 229, 0.1))',
    padding: 2,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#a1a1aa',
    margin: '3px 0 0 0',
  },
  segmentedControl: {
    width: '100%',
    display: 'flex',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    padding: '7px 0',
    borderRadius: 7,
    border: 'none',
    background: 'transparent',
    color: '#71717a',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  segmentBtnActive: {
    background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  inputGroup: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  inputIconWrapper: {
    position: 'absolute',
    left: 12,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    padding: '9px 12px 9px 34px',
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#f4f4f5',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
    marginTop: 4,
    transition: 'all 0.15s',
  },
  btnLoadingRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  btnMiniSpinner: {
    width: 12,
    height: 12,
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  errorBanner: {
    width: '100%',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 11,
    color: '#f87171',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  consentCard: {
    background: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.18)',
    borderRadius: 10,
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  consentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  consentTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#fbbf24',
  },
  consentText: {
    fontSize: 10,
    color: '#a1a1aa',
    lineHeight: 1.45,
    margin: 0,
  },
  consentLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    color: '#e4e4e7',
    cursor: 'pointer',
    marginTop: 2,
  },
  checkbox: {
    accentColor: '#8b5cf6',
    cursor: 'pointer',
  },

  // ── Monitoring Screen ────────────────────────────────────────────────────
  profileRibbon: {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: '9px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxSizing: 'border-box',
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#ffffff',
    flexShrink: 0,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
  },
  profileNameRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  profileName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activePillSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#34d399',
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: 9999,
    padding: '1px 6px',
  },
  profileDetails: {
    fontSize: 10,
    color: '#71717a',
    margin: '2px 0 0 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  monoText: {
    fontFamily: "'SFMono-Regular', Consolas, Menlo, monospace",
    color: '#d4d4d8',
    fontWeight: 600,
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  sectionCard: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#f4f4f5',
    letterSpacing: '-0.01em',
    margin: 0,
  },
  liveCountBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '2px 7px',
    borderRadius: 9999,
    border: '1px solid transparent',
  },
  historyCountBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#71717a',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    padding: '2px 7px',
  },
  clearLogBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 500,
    color: '#a1a1aa',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    padding: '2px 7px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },

  // ── Active Tools Card ────────────────────────────────────────────────────
  activeToolsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  activeToolCard: {
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 13, 20, 0.95) 100%)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    borderRadius: 12,
    padding: '11px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    boxShadow: '0 4px 20px rgba(16, 185, 129, 0.12)',
  },
  activeToolTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeToolHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  activeNowPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.05em',
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.18)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderRadius: 9999,
    padding: '2px 6px',
  },
  activeNowDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#10b981',
    animation: 'pulseDot 1.5s infinite',
  },
  activeToolTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  liveStopwatchBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: 7,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "'SFMono-Regular', Consolas, Menlo, monospace",
    color: '#34d399',
  },
  activeMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6,
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: '8px 10px',
  },
  activeMetricCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#71717a',
  },
  activeStatusValue: {
    fontSize: 11,
    fontWeight: 700,
    color: '#34d399',
  },
  activeTimeValue: {
    fontSize: 11,
    fontWeight: 600,
    color: '#e4e4e7',
  },
  activeDurationValue: {
    fontSize: 11,
    fontWeight: 700,
    color: '#34d399',
    fontFamily: "'SFMono-Regular', Consolas, Menlo, monospace",
  },
  activeFooterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  platformBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 10,
    fontWeight: 600,
    color: '#d4d4d8',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    padding: '2px 7px',
  },
  windowIdentifierText: {
    fontSize: 10,
    color: '#71717a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // ── Empty State ──────────────────────────────────────────────────────────
  emptyActiveCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: '14px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  emptyRadarWrapper: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyRadarRing: {
    position: 'absolute',
    inset: -3,
    borderRadius: 13,
    border: '1px dashed rgba(16, 185, 129, 0.2)',
  },
  emptyActiveTextWrapper: {
    flex: 1,
  },
  emptyActiveTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  },
  emptyActiveDesc: {
    fontSize: 10,
    color: '#71717a',
    margin: '3px 0 0 0',
    lineHeight: 1.45,
  },

  // ── Concluded Sessions Card ──────────────────────────────────────────────
  recentToolsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  deactivatedSessionCard: {
    background: 'rgba(255, 255, 255, 0.025)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'all 0.15s',
  },
  deactivatedCardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deactivatedToolHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  deactivatedToolName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#e4e4e7',
    margin: 0,
  },
  deactivatedStatusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#71717a',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
    padding: '2px 7px',
  },
  deactivatedDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#71717a',
  },
  durationMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6,
    background: 'rgba(0, 0, 0, 0.25)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    padding: '7px 9px',
  },
  durationMetricCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  metricValueActive: {
    fontSize: 11,
    fontWeight: 600,
    color: '#a1a1aa',
  },
  metricValueDeact: {
    fontSize: 11,
    fontWeight: 600,
    color: '#a1a1aa',
  },
  metricValueTotal: {
    fontSize: 11,
    fontWeight: 700,
    color: '#fbbf24',
    fontFamily: "'SFMono-Regular', Consolas, Menlo, monospace",
  },
  deactivatedRawMeta: {
    fontSize: 9,
    color: '#52525b',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    paddingTop: 4,
  },
  deactivatedRawText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  },
  emptyRecentCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: '14px',
    textAlign: 'center',
  },
  emptyRecentText: {
    fontSize: 11,
    color: '#71717a',
    margin: 0,
    lineHeight: 1.4,
  },

  // ── Toast Alert ──────────────────────────────────────────────────────────
  toastCard: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(18, 18, 26, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderRadius: 10,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    animation: 'slideIn 0.2s ease-out',
    zIndex: 999,
  },
  toastLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  toastDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  toastTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  toastStatus: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  toastTime: {
    fontSize: 10,
    color: '#71717a',
  },
  toastMessage: {
    fontSize: 11,
    color: '#d4d4d8',
    margin: '1px 0 0 0',
  },
  toastCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  footerRow: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  systemStatusChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 10,
    color: '#71717a',
  },
  signOutButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid rgba(239, 68, 68, 0.2)',
    background: 'rgba(239, 68, 68, 0.05)',
    color: '#f87171',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
};
