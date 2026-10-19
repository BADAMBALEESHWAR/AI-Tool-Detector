import { useEffect, useState } from 'react';
import {
  AlertCircle, AppWindow, Globe, Lock, LogOut, Minus, PanelRight, ShieldAlert, ShieldCheck, Trash2, X,
} from 'lucide-react';
import './styles.css';

type Kind = 'WEB' | 'APP' | 'EMBEDDED';

interface ActiveTool {
  sessionKey: string;
  toolId: string;
  toolName: string;
  kind: Kind;
  surface: string;
  evidence: string;
  startTime: string;
  durationSeconds: number;
}

interface RecentTool extends ActiveTool {
  endTime: string;
}

interface Student {
  sapId: string;
  name: string;
  branch: string;
}

interface CatalogSummary {
  version: number;
  web: number;
  apps: number;
  builtIn: number;
  appVersion: string;
}

interface Notice {
  type: 'ACTIVE_NOW' | 'DEACTIVATED';
  toolName: string;
  surface: string;
  kind: Kind;
  durationSeconds?: number;
}

declare global {
  interface Window {
    electronAPI: {
      getAuthState: () => Promise<{ isActivated: boolean; studentInfo: Student | null }>;
      signIn: (c: { sapId: string; password: string }) => Promise<{ success: boolean; error?: string; student?: Student }>;
      signUp: (d: { sapId: string; name: string; branch: string; email?: string; password: string }) => Promise<{ success: boolean; error?: string }>;
      signOut: () => Promise<{ success: boolean }>;
      getActiveTools: () => Promise<{ activeTools: ActiveTool[]; recentTools: RecentTool[] }>;
      getCatalogSummary: () => Promise<CatalogSummary>;
      clearSessionHistory: () => Promise<{ success: boolean }>;
      onActiveToolsUpdated: (cb: (data: { activeTools: ActiveTool[]; recentTools: RecentTool[] }) => void) => () => void;
      onToolNotification: (cb: (n: Notice) => void) => () => void;
      onMonitoringStarted: (cb: () => void) => void;
      onSignedOut: (cb: () => void) => void;
      minimizeWindow: () => void;
      hideWindow: () => void;
    };
  }
}

const KIND_LABEL: Record<Kind, string> = { WEB: 'Web', APP: 'App', EMBEDDED: 'In-app' };

export default function App() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getAuthState().then(({ isActivated, studentInfo }) => {
      if (isActivated && studentInfo) setStudent(studentInfo);
      setLoading(false);
    });
    window.electronAPI.onSignedOut(() => setStudent(null));
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="redline" />
      {loading ? (
        <div className="center">
          <div><div className="spinner" />Starting monitor…</div>
        </div>
      ) : student ? (
        <MonitoringScreen student={student} />
      ) : (
        <AuthScreen onSignedIn={setStudent} />
      )}
    </div>
  );
}

function TitleBar() {
  return (
    <div className="titlebar">
      <div className="emblem"><ShieldCheck size={13} color="#fff" /></div>
      <div className="name">SVKM's NMIMS <span>· AI Integrity Monitor</span></div>
      <div className="spacer" />
      <button className="win-btn" title="Minimize" onClick={() => window.electronAPI.minimizeWindow()}><Minus size={14} /></button>
      <button className="win-btn close" title="Hide to system tray" onClick={() => window.electronAPI.hideWindow()}><X size={14} /></button>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="mark"><ShieldCheck size={24} color="#fff" /></div>
      <div>
        <div className="svkm">SVKM's</div>
        <div className="nmims">NMIMS</div>
        <div className="product">AI Integrity Monitor · Desktop</div>
      </div>
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (s: Student) => void }) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sapId, setSapId] = useState('');
  const [password, setPassword] = useState('');
  const [form, setForm] = useState({ sapId: '', name: '', branch: '', email: '', password: '', confirm: '' });
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const signIn = async (id: string, pw: string) => {
    const res = await window.electronAPI.signIn({ sapId: id.trim(), password: pw });
    if (res.success && res.student) onSignedIn(res.student);
    else setError(res.error || 'Sign-in failed. Check your SAP ID and password.');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sapId.trim() || !password) return setError('Enter your SAP ID and password.');
    setBusy(true);
    await signIn(sapId, password);
    setBusy(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.sapId || !form.name || !form.branch || !form.password) return setError('Fill in all required fields.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (!consent) return setError('Please acknowledge the monitoring disclosure.');
    setBusy(true);
    const res = await window.electronAPI.signUp({ sapId: form.sapId.trim(), name: form.name.trim(), branch: form.branch.trim(), email: form.email.trim() || undefined, password: form.password });
    if (res.success) await signIn(form.sapId, form.password);
    else setError(res.error || 'Registration failed.');
    setBusy(false);
  };

  return (
    <div className="scroll">
      <div className="card accent card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Brand />
        <div className="segmented">
          <button className={tab === 'signin' ? 'on' : ''} onClick={() => { setTab('signin'); setError(''); }}>Sign In</button>
          <button className={tab === 'signup' ? 'on' : ''} onClick={() => { setTab('signup'); setError(''); }}>Register</button>
        </div>

        {error && <div className="alert"><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}

        {tab === 'signin' ? (
          <form className="form" onSubmit={handleSignIn}>
            <div className="field"><label>SAP ID</label><input value={sapId} onChange={e => setSapId(e.target.value)} placeholder="e.g. 70022100123" autoFocus /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your portal password" /></div>
            <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in & start monitoring'}</button>
          </form>
        ) : (
          <form className="form" onSubmit={handleSignUp}>
            <div className="field"><label>SAP ID *</label><input value={form.sapId} onChange={set('sapId')} /></div>
            <div className="field"><label>Full name *</label><input value={form.name} onChange={set('name')} /></div>
            <div className="field"><label>Programme / branch *</label><input value={form.branch} onChange={set('branch')} placeholder="e.g. B.Tech CSE, Sem 5" /></div>
            <div className="field"><label>Institutional email</label><input value={form.email} onChange={set('email')} placeholder="optional" /></div>
            <div className="row-2">
              <div className="field"><label>Password *</label><input type="password" value={form.password} onChange={set('password')} placeholder="min. 8 characters" /></div>
              <div className="field"><label>Confirm *</label><input type="password" value={form.confirm} onChange={set('confirm')} /></div>
            </div>
            <div className="consent">
              <strong><ShieldAlert size={13} /> Monitoring disclosure</strong>
              This app records which AI chatbots, AI apps and built-in AI features are open on this computer, with times and
              durations. It never records messages, prompts, keystrokes, screenshots or files.
              <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I understand and consent</label>
            </div>
            <button className="btn-primary" disabled={busy}>{busy ? 'Registering…' : 'Register & start monitoring'}</button>
          </form>
        )}
      </div>
      <div className="card">
        <div className="section-head"><h2>What this app does</h2></div>
        <div className="facts">
          <div><Globe size={15} />Notices AI chatbots open in your browser tabs, such as ChatGPT, Gemini or Claude.</div>
          <div><AppWindow size={15} />Notices AI apps running on this computer, such as ChatGPT Desktop or Cursor.</div>
          <div><PanelRight size={15} />Notices AI panels opened inside other apps, such as Copilot in Word or Claude Code in VS Code.</div>
          <div><Lock size={15} />Never reads messages, prompts, keystrokes, screens or files — only tool names and times.</div>
        </div>
      </div>
      <p className="footer-note">For authorised institutional use · Shri Vile Parle Kelavani Mandal</p>
    </div>
  );
}

function MonitoringScreen({ student }: { student: Student }) {
  const [active, setActive] = useState<ActiveTool[]>([]);
  const [recent, setRecent] = useState<RecentTool[]>([]);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const apply = (d: { activeTools: ActiveTool[]; recentTools: RecentTool[] }) => {
      setActive(d.activeTools || []);
      setRecent(d.recentTools || []);
    };
    window.electronAPI.getActiveTools().then(apply);
    window.electronAPI.getCatalogSummary().then(setSummary);
    const offTools = window.electronAPI.onActiveToolsUpdated(apply);
    let timer: ReturnType<typeof setTimeout>;
    const offNotice = window.electronAPI.onToolNotification(n => {
      setNotice(n);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 4500);
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { offTools(); offNotice(); clearInterval(tick); clearTimeout(timer); };
  }, []);

  const signOut = async () => {
    if (window.confirm('Sign out and stop monitoring on this computer?')) await window.electronAPI.signOut();
  };
  const clearHistory = async () => {
    if (window.confirm('Clear the session list on this computer? (Records already sent to the institution are kept.)')) {
      await window.electronAPI.clearSessionHistory();
      setRecent([]);
    }
  };

  const initials = student.name.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'S';

  return (
    <div className="scroll">
      {notice && (
        <div className={`toast ${notice.type === 'DEACTIVATED' ? 'ended' : ''}`}>
          <KindIcon kind={notice.kind} />
          <div className="main">
            <b>{notice.type === 'ACTIVE_NOW' ? `${notice.toolName} detected` : `${notice.toolName} closed`}</b>
            {notice.type === 'ACTIVE_NOW' ? `Active on ${notice.surface}` : `Used for ${formatDuration(notice.durationSeconds || 0)} on ${notice.surface}`}
          </div>
          <button className="win-btn" style={{ color: 'var(--muted)' }} onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      )}

      <div className="card accent student">
        <div className="avatar">{initials}</div>
        <div className="who">
          <b>{student.name}</b>
          <small><span className="mono">{student.sapId}</span> · {student.branch}</small>
        </div>
        <span className="status-pill"><span className="dot" />Monitoring</span>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Active now</h2>
          <span className={`count ${active.length ? 'live' : ''}`}>{active.length ? `${active.length} open` : 'None'}</span>
        </div>
        {active.length === 0 ? (
          <div className="empty">
            <div className="shield"><ShieldCheck size={22} /></div>
            <b>No AI tools open</b>
            AI chatbots, AI apps and built-in AI panels you open will appear here.
          </div>
        ) : (
          <div className="list">
            {active.map(t => {
              const secs = Math.max(1, Math.round((now - new Date(t.startTime).getTime()) / 1000));
              return (
                <ToolRow key={t.sessionKey} tool={t} active
                  right={<><b>{formatClock(secs)}</b><small>since {formatTime(t.startTime)}</small></>} />
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Recent sessions</h2>
          {recent.length > 0 ? (
            <button className="btn-ghost" onClick={clearHistory}><Trash2 size={12} />Clear</button>
          ) : <span className="count">0</span>}
        </div>
        {recent.length === 0 ? (
          <div className="empty">Closed AI tools are listed here with their start time, end time and duration.</div>
        ) : (
          <div className="list">
            {recent.slice(0, 15).map((t, i) => (
              <ToolRow key={t.sessionKey + t.endTime + i} tool={t}
                right={<><b>{formatDuration(t.durationSeconds)}</b><small>{formatTime(t.startTime)} – {formatTime(t.endTime)}</small></>} />
            ))}
          </div>
        )}
      </div>

      {summary && (
        <div className="card">
          <div className="section-head"><h2>What this computer watches for</h2><span className="count">v{summary.appVersion}</span></div>
          <div className="coverage">
            <div><b>{summary.web}</b><span>AI websites</span></div>
            <div><b>{summary.apps}</b><span>AI apps</span></div>
            <div><b>{summary.builtIn}</b><span>In-app AI</span></div>
          </div>
          <div className="privacy"><Lock size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            Only tool names, times and durations are sent. Messages, prompts, keystrokes and screen contents are never read or stored.
          </div>
        </div>
      )}

      <button className="btn-outline" onClick={signOut}><LogOut size={14} />Sign out &amp; stop monitoring</button>
      <p className="footer-note">Runs in the system tray · Closing this window keeps monitoring on</p>
    </div>
  );
}

function ToolRow({ tool, active, right }: { tool: ActiveTool; active?: boolean; right: React.ReactNode }) {
  return (
    <div className={`tool ${active ? 'active' : 'ended'}`}>
      <div className="icon"><KindIcon kind={tool.kind} /></div>
      <div className="main">
        <div className="title"><span className="n">{tool.toolName}</span><span className="kind">{KIND_LABEL[tool.kind] || 'Web'}</span></div>
        <div className="meta">{tool.surface}</div>
        <div className="evidence" title={tool.evidence}>{tool.evidence}</div>
      </div>
      <div className="time">{right}</div>
    </div>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'APP') return <AppWindow size={17} />;
  if (kind === 'EMBEDDED') return <PanelRight size={17} />;
  return <Globe size={17} />;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatClock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return secs % 60 ? `${m}m ${secs % 60}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
