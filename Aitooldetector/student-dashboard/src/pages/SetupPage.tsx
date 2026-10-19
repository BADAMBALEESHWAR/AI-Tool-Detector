import { useEffect, useState, useCallback } from 'react';
import { DOWNLOADS_BASE } from '../lib/config';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  CheckCircle2, Download, Monitor, ShieldCheck,
  Loader2, AlertCircle, RefreshCw, ArrowRight
} from 'lucide-react';


function detectOS(): 'windows' | 'macos' {
  return navigator.userAgent.toLowerCase().includes('mac') ? 'macos' : 'windows';
}

type SetupStep = 'account' | 'download' | 'install' | 'done';

export default function SetupPage() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const os = detectOS();

  const [devices, setDevices] = useState<any[]>([]);
  const [polling, setPolling] = useState(false);
  const [currentStep, setCurrentStep] = useState<SetupStep>('download');
  const [downloaded, setDownloaded] = useState(false);

  const refreshDevices = useCallback(async () => {
    try {
      const res = await api.get('/student/devices');
      setDevices(res.data);
      return res.data as any[];
    } catch {
      return [];
    }
  }, []);

  // Poll for device activation every 3s while on install step
  useEffect(() => {
    if (currentStep !== 'install') return;
    setPolling(true);
    const interval = setInterval(async () => {
      const devs = await refreshDevices();
      const active = devs.find((d: any) => d.status === 'ACTIVE');
      if (active) {
        setPolling(false);
        setCurrentStep('done');
        clearInterval(interval);
      }
    }, 3000);
    return () => { clearInterval(interval); setPolling(false); };
  }, [currentStep, refreshDevices]);

  const activeDevice = devices.find(d => d.status === 'ACTIVE');

  const handleDownloadClick = () => {
    setDownloaded(true);
    setTimeout(() => setCurrentStep('install'), 1200);
  };

  const handleFinish = () => {
    navigate('/dashboard');
  };

  const steps = [
    { id: 'account', label: '1. Create Account', done: true },
    { id: 'download', label: '2. Download App', done: downloaded || currentStep === 'install' || currentStep === 'done' },
    { id: 'install', label: '3. Sign In on App', done: !!activeDevice || currentStep === 'done' },
    { id: 'done', label: '4. Monitoring Active', done: currentStep === 'done' || !!activeDevice },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6 animate-fade-in">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-600/15 border border-brand-500/20 rounded-full text-xs text-brand-300 font-medium mb-3">
            <ShieldCheck size={12} />
            Required Setup — Academic Monitoring
          </div>
          <h1 className="text-2xl font-bold text-white">
            Set Up AI Monitoring, {student?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            To comply with examination policies, you must install the AI Monitor desktop application before you can access the portal.
          </p>
        </div>

        {/* Progress stepper */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all ${
                    step.done
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : currentStep === step.id
                      ? 'bg-brand-600/20 border-brand-500 text-brand-400 ring-2 ring-brand-500/20'
                      : 'bg-gray-800 border-gray-700 text-gray-600'
                  }`}>
                    {step.done ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={`text-[10px] text-center leading-tight ${
                    step.done ? 'text-emerald-400' : currentStep === step.id ? 'text-brand-300' : 'text-gray-600'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-2 mb-5 transition-all ${step.done ? 'bg-emerald-500/40' : 'bg-gray-800'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        {currentStep === 'download' && (
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center">
                <Download className="text-brand-400 w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Step 1 — Download the Desktop App</h2>
                <p className="text-xs text-gray-400">Required for system-level AI tool monitoring</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-4xl">{os === 'windows' ? '🪟' : '🍎'}</div>
              <div className="flex-1">
                <p className="font-semibold text-white">AI Monitor Desktop</p>
                <p className="text-sm text-gray-400">
                  {os === 'windows' ? 'Windows 10/11 (x64) · v1.0.0 · ~85MB' : 'macOS 12+ (Universal) · v1.0.0 · ~95MB'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                {os === 'windows' && (
                  <a
                    id="download-windows-zip"
                    href={`${DOWNLOADS_BASE}/AI-Monitor-Windows.zip`}
                    download="AI-Monitor-Windows.zip"
                    onClick={handleDownloadClick}
                    className="btn-primary flex items-center justify-center gap-2 text-xs py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/30 text-paper shadow-lg shadow-emerald-950/30 font-semibold shrink-0"
                    title="Download as ZIP (Recommended: never blocked by Edge or Chrome SmartScreen)"
                  >
                    <Download size={15} />
                    Download ZIP (Recommended)
                  </a>
                )}
                <a
                  id={`download-${os}`}
                  href={`${DOWNLOADS_BASE}/ai-monitor-${os === 'windows' ? 'Setup.exe' : 'Installer.dmg'}`}
                  download={os === 'windows' ? 'AI-Monitor-Setup.exe' : 'AI-Monitor.dmg'}
                  onClick={handleDownloadClick}
                  className="btn-secondary flex items-center justify-center gap-2 text-xs py-2 px-3 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white shrink-0"
                >
                  <Download size={14} />
                  {os === 'windows' ? 'Download .exe directly' : 'Download .dmg'}
                </a>
              </div>
            </div>

            {/* SmartScreen & Browser warning resolution box */}
            <div className="flex flex-col gap-2.5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200 font-semibold">
                  Fix Edge / Chrome &quot;File isn&apos;t commonly downloaded&quot; or &quot;Windows protected your PC&quot;:
                </p>
              </div>
              <ul className="text-xs text-gray-300 space-y-1.5 pl-6 list-disc">
                <li>
                  <strong>In Microsoft Edge:</strong> When the warning <em>&quot;AI-Monitor-Setup.exe isn&apos;t commonly downloaded&quot;</em> appears in your downloads popup, hover over it, click the <strong>⋯</strong> (three dots) or <strong>&quot;See more&quot;</strong> → click <strong>&quot;Keep&quot;</strong> → click <strong>&quot;Show more&quot;</strong> → click <strong>&quot;Keep anyway&quot;</strong>.
                </li>
                <li>
                  <strong>Fastest alternative:</strong> Click the green <strong>&quot;Download ZIP (Recommended)&quot;</strong> button above — Edge and Chrome download ZIP archives instantly with zero security warnings. Just extract and double-click the installer!
                </li>
                <li>
                  <strong>Windows SmartScreen:</strong> When opening the installer, if Windows shows <em>&quot;Windows protected your PC&quot;</em>, click <strong>&quot;More info&quot;</strong> → <strong>&quot;Run anyway&quot;</strong>.
                </li>
              </ul>
            </div>

            {downloaded && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 animate-fade-in">
                <CheckCircle2 size={16} />
                Download started! Now install the app and sign in with your SAP ID…
              </div>
            )}

            {!downloaded && (
              <button
                onClick={() => setCurrentStep('install')}
                className="text-xs text-gray-500 hover:text-gray-400 underline"
              >
                Already installed? Skip to sign-in step →
              </button>
            )}
          </div>
        )}

        {currentStep === 'install' && (
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
                <Monitor className="text-violet-400 w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Step 2 — Install & Sign In</h2>
                <p className="text-xs text-gray-400">Open the downloaded file, install it, then sign in with your SAP ID</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { num: 1, text: 'Run the installer (AI Monitor Setup.exe or .dmg)' },
                { num: 2, text: 'Open the app — it appears in your system tray / menu bar' },
                { num: 3, text: `Sign in using your SAP ID: ${student?.sapId} and your password` },
                { num: 4, text: 'The app will show "Monitoring Active" — this page will automatically advance' },
              ].map(({ num, text }) => (
                <div key={num} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {num}
                  </div>
                  <p className="text-sm text-gray-300">{text}</p>
                </div>
              ))}
            </div>

            {/* Polling indicator */}
            <div className="flex items-center gap-3 p-4 bg-brand-500/8 border border-brand-500/20 rounded-xl">
              {polling ? (
                <>
                  <Loader2 size={16} className="text-brand-400 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm text-brand-300 font-medium">Waiting for desktop app connection…</p>
                    <p className="text-xs text-gray-500">This page will update automatically when you sign in on the app</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-300 font-medium">Device detected! Proceeding…</p>
                </>
              )}
              <button onClick={refreshDevices} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-all">
                <RefreshCw size={14} />
              </button>
            </div>

            <button
              onClick={() => setCurrentStep('download')}
              className="text-xs text-gray-500 hover:text-gray-400 underline"
            >
              ← Back to download
            </button>
          </div>
        )}

        {currentStep === 'done' && (
          <div className="glass-card p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Monitoring Active!</h2>
              <p className="text-sm text-gray-400">
                Your device is now actively monitored across all browsers and desktop AI applications.
              </p>
            </div>
            {activeDevice && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {activeDevice.hostname} · {activeDevice.osType}
              </div>
            )}
            <button
              onClick={handleFinish}
              className="btn-primary flex items-center gap-2 mx-auto"
              id="go-to-dashboard-btn"
            >
              Go to Dashboard
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
