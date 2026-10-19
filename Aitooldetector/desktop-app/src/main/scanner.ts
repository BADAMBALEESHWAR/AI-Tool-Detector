import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { ScanSnapshot } from './detection/engine';

type ScanParts = Pick<ScanSnapshot, 'windows' | 'tabs' | 'markers'>;

function findBinary(file: string): string | null {
  const candidates = [
    join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'bin', file),
    join(app.getAppPath(), 'resources', 'bin', file),
    join(__dirname, '../../resources/bin', file),
  ];
  return candidates.find(c => existsSync(c)) || null;
}

/** Runs TabScanner.exe, falling back to the PowerShell build of the same source. */
function run(args: string[], timeoutMs: number): Promise<string> {
  const options = { timeout: timeoutMs, encoding: 'utf8' as const, windowsHide: true, maxBuffer: 4 * 1024 * 1024 };
  return new Promise(resolve => {
    const fallback = () => {
      const ps1 = findBinary('TabScanner.ps1');
      if (!ps1) return resolve('');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
        { ...options, timeout: timeoutMs * 2 },
        (err, stdout) => resolve(err ? '' : stdout));
    };
    const exe = findBinary('TabScanner.exe');
    if (!exe) return fallback();
    execFile(exe, args, options, (err, stdout) => (err && !stdout ? fallback() : resolve(stdout || '')));
  });
}

export function parseScannerOutput(stdout: string): ScanParts {
  const parts: ScanParts = { windows: [], tabs: [], markers: [] };
  for (const line of stdout.split(/\r?\n/)) {
    const [kind, proc, ...rest] = line.split('|');
    const value = rest.join('|').trim();
    if (!proc || !value) continue;
    if (kind === 'WINDOW') parts.windows.push({ process: proc, title: value });
    else if (kind === 'TAB') parts.tabs.push({ process: proc, title: value });
    else if (kind === 'MARKER') parts.markers.push({ process: proc, ruleId: value });
  }
  return parts;
}

/** Visible windows and browser tabs (Windows only, about 1 s). */
export async function scanFast(): Promise<ScanParts> {
  if (process.platform !== 'win32') return { windows: [], tabs: [], markers: [] };
  return parseScannerOutput(await run([], 6000));
}

/** Built-in AI panels matching the rules file (Windows only, 1–3 s). */
export async function scanDeep(rulesFile: string): Promise<ScanParts['markers']> {
  if (process.platform !== 'win32') return [];
  return parseScannerOutput(await run(['--deep', rulesFile], 10000)).markers;
}
