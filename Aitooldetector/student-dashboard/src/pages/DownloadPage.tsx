import { useState } from 'react';
import { Download, Monitor, Puzzle, CheckCircle2, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';

type OS = 'windows' | 'macos';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Detect OS from user agent
function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  return 'windows';
}

const STEPS = [
  {
    num: 1,
    title: 'Create your web account',
    desc: 'You\'ve already done this — you\'re logged in!',
    done: true,
  },
  {
    num: 2,
    title: 'Download the Desktop App',
    desc: 'Click the download button below to get the installer for your OS.',
    done: false,
  },
  {
    num: 3,
    title: 'Install & Sign In',
    desc: 'Run the installer, then open the app and sign in with your SAP ID & password.',
    done: false,
  },
  {
    num: 4,
    title: 'Install the Browser Extension',
    desc: 'Install the companion extension so AI web tool usage is tracked in your browser.',
    done: false,
  },
  {
    num: 5,
    title: 'Monitoring is Active',
    desc: 'Once signed in on the app, monitoring starts automatically on this device.',
    done: false,
  },
];

const EXTENSION_LINKS = [
  { browser: 'Chrome / Brave', icon: '🌐', url: '#chrome-ext', note: 'Install from Chrome Web Store' },
  { browser: 'Microsoft Edge', icon: '🔷', url: '#edge-ext', note: 'Install from Edge Add-ons' },
  { browser: 'Firefox', icon: '🦊', url: '#firefox-ext', note: 'Install from Firefox Add-ons' },
  { browser: 'Manual (Developer Mode)', icon: '⚙️', url: `${API_BASE}/downloads/extension.zip`, note: 'Load as unpacked extension' },
];

export default function DownloadPage() {
  const [os, setOs] = useState<OS>(detectOS());

  return (
    <div className="space-y-8 max-w-3xl animate-fade-in">
      <div>
        <h1 className="page-header">Download & Setup</h1>
        <p className="page-subheader">Get the desktop app and browser extension to start monitoring</p>
      </div>

      {/* OS selector */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Monitor size={16} />
          Desktop Application
        </h2>
        <div className="flex gap-2 mb-6">
          {(['windows', 'macos'] as OS[]).map(o => (
            <button
              key={o}
              onClick={() => setOs(o)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                os === o
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              {o === 'windows' ? '🪟 Windows' : '🍎 macOS'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10 mb-4">
          <div className="text-4xl">{os === 'windows' ? '🪟' : '🍎'}</div>
          <div className="flex-1">
            <p className="font-semibold text-white">AI Monitor Desktop</p>
            <p className="text-sm text-gray-400">
              {os === 'windows' ? 'Windows 10/11 (x64) · v1.0.0 · ~85MB' : 'macOS 12+ (Universal) · v1.0.0 · ~95MB'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            {os === 'windows' && (
              <a
                id="download-windows-zip"
                href={`${API_BASE}/downloads/AI-Monitor-Windows.zip`}
                download="AI-Monitor-Windows.zip"
                className="btn-primary flex items-center justify-center gap-2 text-xs py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/30 text-white shadow-lg shadow-emerald-950/30 font-semibold"
                title="Download as ZIP archive (Recommended: never blocked by Chrome or browser filters)"
              >
                <Download size={15} />
                Download ZIP (Recommended)
              </a>
            )}
            <a
              id={`download-${os}`}
              href={`${API_BASE}/downloads/ai-monitor-${os === 'windows' ? 'Setup.exe' : 'Installer.dmg'}`}
              download={os === 'windows' ? 'AI-Monitor-Setup.exe' : 'AI-Monitor.dmg'}
              className="btn-secondary flex items-center justify-center gap-2 text-xs py-2 px-3 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white shrink-0"
            >
              <Download size={14} />
              {os === 'windows' ? 'Download .exe directly' : 'Download .dmg'}
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 font-semibold">
              Fix Chrome "Unconfirmed .crdownload" or "File might be harmful":
            </p>
          </div>
          <ul className="text-xs text-gray-300 space-y-1.5 pl-6 list-disc">
            <li>
              <strong>If file is named <code>Unconfirmed ... .crdownload</code>:</strong> Chrome has downloaded the file but is waiting for your confirmation. Press <kbd className="bg-white/20 px-2 py-0.5 rounded text-white font-mono text-[11px] font-bold">Ctrl + J</kbd> (or click the Download icon in Chrome's top right toolbar), find the file, and click <strong>"Keep"</strong> → <strong>"Keep anyway"</strong> to instantly finish saving.
            </li>
            <li>
              <strong>Instant alternative:</strong> Click <strong>"Download ZIP (Recommended)"</strong> above — Chrome downloads ZIP archives immediately without any security pause.
            </li>
            <li>
              <strong>Windows SmartScreen:</strong> If Windows shows <em>"Windows protected your PC"</em> when opening the installer, click <strong>"More info"</strong> → <strong>"Run anyway"</strong>.
            </li>
          </ul>
        </div>
      </div>

      {/* Step-by-step setup guide */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-5">Setup Steps</h2>
        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div key={i} className={`flex gap-4 ${i < STEPS.length - 1 ? 'pb-4 border-b border-white/5' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                step.done
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-brand-600/20 text-brand-400 border border-brand-500/30'
              }`}>
                {step.done ? <CheckCircle2 size={16} /> : step.num}
              </div>
              <div>
                <p className={`text-sm font-semibold ${step.done ? 'text-emerald-300' : 'text-white'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Browser extension */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
          <Puzzle size={16} />
          Browser Extension
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          Install the companion extension to track AI tool usage across any browser.
          The extension automatically uses your device credentials — no separate login needed.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {EXTENSION_LINKS.map(link => (
            <a
              key={link.browser}
              href={link.url}
              className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all group"
            >
              <span className="text-2xl">{link.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{link.browser}</p>
                <p className="text-xs text-gray-500 truncate">{link.note}</p>
              </div>
              <ArrowRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </a>
          ))}
        </div>
        <div className="mt-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl">
          <p className="text-xs text-gray-400">
            <span className="text-brand-300 font-medium">Enterprise deployment:</span> If your institution uses Google Admin Console, Intune, or Group Policy (GPO), ask your IT admin to push the extension automatically. See the{' '}
            <a href={`${API_BASE}/docs/deployment`} className="text-brand-400 hover:underline inline-flex items-center gap-1">
              deployment guide <ExternalLink size={10} />
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
