/**
 * Comprehensive blacklist of known system processes, background services, OEM utilities,
 * hardware managers, and non-AI tools that should NEVER be flagged or recorded as AI tools.
 */
export const SYSTEM_BLACKLIST_KEYWORDS: string[] = [
  // Nvidia / GPU daemons & services
  'nvdisplay',
  'nvcontainer',
  'nvtelemetry',
  'nvidia',
  'geforce',
  'nvcplui',
  'nvnodejslauncher',
  'nvspcaps64',
  'amdrsserv',
  'radeon',
  'igfx',

  // OEM software, hardware utilities & monitors
  'omeninstallmonitor',
  'omen',
  'hp ',
  'hp.',
  'hp_',
  'dell',
  'alienware',
  'lenovo',
  'acer',
  'asus',
  'armoury',
  'armourycrate',
  'samsung',
  'mysagethumbs',

  // Windows system processes & service hosts
  'svchost',
  'explorer',
  'taskmgr',
  'winlogon',
  'lsass',
  'dwm',
  'csrss',
  'searchindexer',
  'searchapp',
  'searchhost',
  'msiexec',
  'ctfmon',
  'audiodg',
  'spoolsv',
  'system',
  'conhost',
  'runtimebroker',
  'smartscreen',
  'securityhealthservice',
  'shellexperiencehost',
  'startmenuexperiencehost',
  'lockapp',
  'applicationframehost',
  'textinputhost',
  'systemsettings',
  'backgroundtaskhost',

  // Installers, updaters, setup programs
  'installmonitor',
  'installer',
  'setup.exe',
  'updater',
  'uninstall',

  // Antivirus / Security tools
  'antivirus',
  'defender',
  'avast',
  'norton',
  'malware',
  'kaspersky',
  'mcafee',

  // Generic shells & runtimes (unless explicitly registered AI tools like Cursor/Windsurf/Antigravity)
  'powershell',
  'cmd.exe',
  'git.exe',
  'bash.exe',

  // Standard web browsers themselves (should not be logged as standalone desktop AI apps)
  'chrome.exe',
  'firefox.exe',
  'msedge.exe',
  'brave.exe',
  'opera.exe',
  'safari.exe',
  'vivaldi.exe',
  'arc.exe',

  // The AI Monitor detector itself (NEVER detect self)
  'ai monitor',
  'ai monitor desktop',
  'ai monitor setup',
  'ai-monitor',
  'ai_monitor',
  'aimonitor',
  'ai-monitor-desktop',
  'ai monitor.exe',
  'ai tool detector',
  'electron',
  'electron.exe',
];

/**
 * Check if a given string (tool name, process name, window title, or pattern)
 * matches a known blacklisted system process or non-AI software.
 */
export function isBlacklistedSystemProcess(nameOrPattern?: string | null): boolean {
  if (!nameOrPattern) return false;
  const clean = nameOrPattern.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!clean) return false;

  const cleanNoExe = clean.replace(/\.exe$/, '');

  for (const pattern of SYSTEM_BLACKLIST_KEYWORDS) {
    const p = pattern.toLowerCase();
    if (clean === p || cleanNoExe === p || clean.includes(p)) {
      return true;
    }
  }

  // Exact check for known false-positive names or bare ambiguous generic strings
  if (
    clean === 'ai' ||
    clean === 'a.i.' ||
    clean === 'ai.ai' ||
    clean.includes('omen') ||
    clean.includes('nvdisplay') ||
    clean.includes('nvcontainer') ||
    clean.includes('installmonitor') ||
    clean.includes('ai monitor') ||
    clean.includes('aimonitor') ||
    clean.includes('ai-monitor')
  ) {
    return true;
  }

  return false;
}
