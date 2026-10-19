/**
 * Live end-to-end check against the real desktop (Windows only, opt-in):
 *   LIVE_SCAN=1 npx vitest run src/main/detection/live.test.ts
 * Runs the real TabScanner (fast + deep) and process list through the
 * engine and prints what would be reported. Skipped in normal test runs.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import bundled from '../../data/ai-tools.json';
import { parseScannerOutput } from '../scanner';
import { CatalogTool, compileCatalog, scannerRules } from './catalog';
import { detect, findCandidates } from './engine';

const live = process.env.LIVE_SCAN === '1' && process.platform === 'win32';

describe.skipIf(!live)('live desktop scan', () => {
  it('scans, detects and prints the result', async () => {
    const catalog = compileCatalog(bundled.tools as CatalogTool[], bundled.catalogVersion);
    const exe = join(__dirname, '../../../resources/bin/TabScanner.exe');
    const rules = join(mkdtempSync(join(tmpdir(), 'scan-')), 'rules.txt');
    writeFileSync(rules, scannerRules(catalog), 'utf-8');

    const fast = parseScannerOutput(execFileSync(exe, [], { encoding: 'utf8' }));
    const markers = parseScannerOutput(execFileSync(exe, ['--deep', rules], { encoding: 'utf8' })).markers;
    const psList = (await import('ps-list')).default;
    const processes = (await psList()).map(p => p.name);

    const snapshot = { ...fast, markers, processes };
    const detections = detect(snapshot, catalog);
    console.log(`windows=${fast.windows.length} tabs=${fast.tabs.length} processes=${processes.length} markers=${markers.length}`);
    for (const d of detections) console.log(`DETECTED ${d.kind.padEnd(8)} ${d.toolName} @ ${d.surface} — ${d.evidence}`);
    for (const c of findCandidates(snapshot, catalog)) console.log(`CANDIDATE ${c.type} ${c.name} (${c.pattern})`);
    expect(Array.isArray(detections)).toBe(true);
  }, 60_000);
});
